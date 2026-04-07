/**
 * Inbound external events: validate → canonical → correlate → cos_run_events → run patch → supervisor wake.
 */

import { __resetCorrelationMemoryForTests } from './correlationStore.js';
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
  const out = await processCanonicalExternalEvent(canonical, corr);

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

  const canonical = normalizeCursorWebhookPayload(
    body && typeof body === 'object' && !Array.isArray(body) ? body : {},
  );
  if (!canonical) {
    return { ok: true, httpStatus: 202, body: 'ignored: insufficient payload', ignored: true };
  }

  const corr = await resolveCorrelationForCanonical(canonical);
  const out = await processCanonicalExternalEvent(canonical, corr);

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
