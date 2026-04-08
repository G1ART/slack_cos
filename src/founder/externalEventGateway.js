/**
 * Inbound external events: validate → canonical → correlate → cos_run_events → run patch → supervisor wake.
 */

import crypto from 'node:crypto';
import { __resetCorrelationMemoryForTests, findExternalCorrelationCursorHintsWithMeta } from './correlationStore.js';
import { tryRecordGithubDelivery, __resetGithubDeliveryMemoryForTests } from './githubWebhookDedupe.js';
import { __resetCosRunEventsMemoryForTests } from './runCosEvents.js';
import {
  verifyGithubWebhookSignature,
  normalizeGithubWebhookPayload,
  githubRepoMatchesConfigured,
} from './providerEventNormalizers.js';
import { githubWebhookFollowOnFetch, GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS } from './githubWebhookFollowOn.js';
import {
  buildCanonicalFromGithubNormalized,
  resolveCorrelationForCanonical,
  processCanonicalExternalEvent,
  applyExternalPacketProgressState,
} from './canonicalExternalEvent.js';
import {
  verifyCursorWebhookSignature,
  normalizeCursorWebhookPayload,
} from './cursorWebhookIngress.js';

/**
 * @param {string} threadKey
 * @param {string} packetId
 * @param {'completed'|'failed'} packetState
 */
export async function applyExternalPacketTransition(threadKey, packetId, packetState) {
  return applyExternalPacketProgressState(threadKey, packetId, packetState);
}

/**
 * @param {{
 *   rawBody: Buffer,
 *   headers: Record<string, string | undefined>,
 *   env?: NodeJS.ProcessEnv,
 * }} p
 * @returns {Promise<{ ok: boolean, httpStatus: number, body: string, duplicate?: boolean, ignored?: boolean, matched?: boolean }>}
 */
export async function handleGithubWebhookIngress(p) {
  const env = p.env || process.env;
  const secret = String(env.GITHUB_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return { ok: false, httpStatus: 503, body: 'webhook secret not configured' };
  }

  const headers = p.headers || {};
  const sig = headers['x-hub-signature-256'];
  if (!verifyGithubWebhookSignature(secret, p.rawBody, sig)) {
    return { ok: false, httpStatus: 401, body: 'invalid signature' };
  }

  let body;
  try {
    body = JSON.parse(p.rawBody.toString('utf8'));
  } catch {
    return { ok: false, httpStatus: 400, body: 'invalid json' };
  }

  const ghEvent = String(headers['x-github-event'] || '').trim();
  if (ghEvent === 'ping') {
    return { ok: true, httpStatus: 202, body: 'ping accepted', ignored: true };
  }

  const delivery = String(headers['x-github-delivery'] || '').trim();
  if (delivery && GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has(ghEvent)) {
    const fresh = await tryRecordGithubDelivery(delivery);
    if (!fresh) {
      return { ok: true, httpStatus: 200, body: 'duplicate delivery', duplicate: true };
    }
  }

  const repoName =
    body.repository && typeof body.repository === 'object'
      ? String(body.repository.full_name || '')
      : '';
  if (!githubRepoMatchesConfigured(repoName, env)) {
    return { ok: true, httpStatus: 202, body: 'repository scope mismatch', ignored: true };
  }

  await githubWebhookFollowOnFetch(env, ghEvent);

  const norm = normalizeGithubWebhookPayload(headers, body);
  if (!norm) {
    return { ok: true, httpStatus: 202, body: 'unsupported event', ignored: true };
  }

  const canonical = buildCanonicalFromGithubNormalized(norm, ghEvent);
  const corr = await resolveCorrelationForCanonical(canonical);
  const fp = crypto.createHash('sha256').update(p.rawBody).digest('hex').slice(0, 16);
  const out = await processCanonicalExternalEvent(canonical, corr, {
    matched_by: 'github_object',
    payload_fingerprint_prefix: fp,
  });

  return {
    ok: true,
    httpStatus: out.matched ? 200 : 202,
    body: out.httpBody,
    matched: out.matched,
  };
}

/**
 * @param {{
 *   rawBody: Buffer,
 *   headers: Record<string, string | undefined>,
 *   env?: NodeJS.ProcessEnv,
 * }} p
 * @returns {Promise<{ ok: boolean, httpStatus: number, body: string, matched?: boolean, ignored?: boolean }>}
 */
export async function handleCursorWebhookIngress(p) {
  const env = p.env || process.env;
  const secret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return { ok: false, httpStatus: 503, body: 'cursor webhook secret not configured' };
  }

  const headers = p.headers || {};
  const sig = headers['x-cursor-signature-256'];
  if (!verifyCursorWebhookSignature(secret, p.rawBody, sig)) {
    return { ok: false, httpStatus: 401, body: 'invalid signature' };
  }

  let body;
  try {
    body = JSON.parse(p.rawBody.toString('utf8'));
  } catch {
    return { ok: false, httpStatus: 400, body: 'invalid json' };
  }

  const norm = normalizeCursorWebhookPayload(
    body && typeof body === 'object' && !Array.isArray(body) ? body : {},
    env,
  );
  if (!norm) {
    return { ok: true, httpStatus: 202, body: 'ignored: insufficient payload', ignored: true };
  }

  const { canonical, evidence: ingressEvidence } = norm;
  const { corr, matched_by } = await findExternalCorrelationCursorHintsWithMeta({
    external_run_id: canonical.external_run_id,
    run_id: canonical.run_id_hint,
    packet_id: canonical.packet_id_hint,
    thread_key: canonical.thread_key_hint,
  });
  const fp = crypto.createHash('sha256').update(p.rawBody).digest('hex').slice(0, 16);
  const out = await processCanonicalExternalEvent(canonical, corr, {
    matched_by,
    payload_fingerprint_prefix: fp,
    ingress_evidence: ingressEvidence,
  });

  if (out.matched) {
    const extId = String(canonical.external_run_id || '');
    const external_run_id_tail = extId.length > 6 ? extId.slice(-6) : extId;
    console.info(
      JSON.stringify({
        event: 'cos_cursor_callback_evidence',
        correlation_registered: true,
        matched_by,
        canonical_status: out.canonical_status ?? null,
        source_status_field_name: ingressEvidence.source_status_field_name,
        source_run_id_field_name: ingressEvidence.source_run_id_field_name,
        selected_override_keys: ingressEvidence.selected_override_keys,
        external_run_id_tail,
        has_thread_key: Boolean(canonical.thread_key_hint),
        has_packet_id: Boolean(canonical.packet_id_hint),
        has_branch: Boolean(
          canonical.payload && typeof canonical.payload === 'object' && canonical.payload.branch,
        ),
        has_pr_url: Boolean(
          canonical.payload && typeof canonical.payload === 'object' && canonical.payload.pr_url,
        ),
        has_summary: Boolean(
          canonical.payload && typeof canonical.payload === 'object' && canonical.payload.summary,
        ),
        payload_fingerprint_prefix: fp,
      }),
    );
  }

  return {
    ok: true,
    httpStatus: out.matched ? 200 : 202,
    body: out.httpBody,
    matched: out.matched,
  };
}

export function __resetExternalGatewayTestState() {
  __resetCorrelationMemoryForTests();
  __resetGithubDeliveryMemoryForTests();
  __resetCosRunEventsMemoryForTests();
}
