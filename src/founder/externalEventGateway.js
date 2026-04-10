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
  peekCursorWebhookObservedSchemaSnapshot,
  computeCursorWebhookFieldSelection,
} from './cursorWebhookIngress.js';
import {
  buildCursorCallbackInsufficientDiagnostics,
  pickCursorWebhookInsufficientRejectionReason,
} from './cursorCallbackGate.js';
import {
  deriveCursorCallbackSourceKindFromHeaders,
  mapMatchedByToCallbackMatchBasis,
} from './cursorCallbackTruth.js';
import { recordCosCursorWebhookIngressSafe, recordOpsSmokeGithubFallbackEvidence } from './smokeOps.js';
import { __resetRecoveryEnvelopeStoreForTests } from './recoveryEnvelopeStore.js';

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
  const env =
    p.env && typeof p.env === 'object' && p.env !== process.env ? { ...process.env, ...p.env } : process.env;
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
    try {
      await recordOpsSmokeGithubFallbackEvidence({
        env,
        match_attempted: false,
        matched: false,
        github_event_header: ghEvent,
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
    return { ok: true, httpStatus: 202, body: 'unsupported event', ignored: true };
  }

  const canonical = buildCanonicalFromGithubNormalized(norm, ghEvent);
  const corr = await resolveCorrelationForCanonical(canonical);
  const fp = crypto.createHash('sha256').update(p.rawBody).digest('hex').slice(0, 16);
  const out = await processCanonicalExternalEvent(canonical, corr, {
    matched_by: 'github_object',
    payload_fingerprint_prefix: fp,
  });

  /** @type {{ recovered?: boolean, run_id?: string, outcome?: string } | null} */
  let secondaryRecovery = null;
  if (!out.matched && ghEvent === 'push' && norm) {
    try {
      const { tryGithubPushSecondaryRecovery } = await import('./resultRecoveryBridge.js');
      secondaryRecovery = await tryGithubPushSecondaryRecovery(norm, env, fp);
    } catch (e) {
      console.error('[result_recovery_bridge]', e);
    }
  }

  const ck = canonical.payload?.correlation_keys;
  const cko = ck && typeof ck === 'object' ? ck : {};
  const secondaryRecovered = Boolean(secondaryRecovery && secondaryRecovery.recovered);
  try {
    await recordOpsSmokeGithubFallbackEvidence({
      env,
      match_attempted: true,
      matched: out.matched || secondaryRecovered,
      github_event_header: ghEvent,
      object_type: cko.object_type != null ? String(cko.object_type) : null,
      object_id: cko.object_id != null ? String(cko.object_id) : null,
      run_id:
        corr?.run_id != null
          ? String(corr.run_id)
          : secondaryRecovered && secondaryRecovery?.run_id != null
            ? String(secondaryRecovery.run_id)
            : secondaryRecovery?.diagnostics?.recovery_anchor_run_id != null
              ? String(secondaryRecovery.diagnostics.recovery_anchor_run_id)
              : null,
      thread_key: corr?.thread_key != null ? String(corr.thread_key) : null,
      ...(secondaryRecovered
        ? {
            github_secondary_recovery: true,
            secondary_recovery_outcome:
              secondaryRecovery?.outcome != null ? String(secondaryRecovery.outcome) : null,
          }
        : {}),
      ...(!secondaryRecovered &&
      ghEvent === 'push' &&
      secondaryRecovery &&
      secondaryRecovery.diagnostics &&
      typeof secondaryRecovery.diagnostics === 'object'
        ? { recovery_diagnostics: secondaryRecovery.diagnostics }
        : {}),
    });
  } catch (e) {
    console.error('[ops_smoke]', e);
  }

  const httpMatched = out.matched || secondaryRecovered;
  return {
    ok: true,
    httpStatus: httpMatched ? 200 : 202,
    body: secondaryRecovered ? 'ok: github push secondary recovery' : out.httpBody,
    matched: httpMatched,
    ...(secondaryRecovered ? { secondary_recovery: true } : {}),
  };
}

/**
 * @param {{
 *   rawBody: Buffer,
 *   headers: Record<string, string | undefined>,
 *   env?: NodeJS.ProcessEnv,
 *   request_id?: string | null,
 * }} p
 * @returns {Promise<{ ok: boolean, httpStatus: number, body: string, matched?: boolean, ignored?: boolean }>}
 */
export async function handleCursorWebhookIngress(p) {
  const env =
    p.env && typeof p.env === 'object' && p.env !== process.env ? { ...process.env, ...p.env } : process.env;
  const requestId = p.request_id != null ? String(p.request_id) : '';
  const secret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  if (!secret) {
    return { ok: false, httpStatus: 503, body: 'cursor webhook secret not configured' };
  }

  const headers = p.headers || {};
  const callback_source_kind = deriveCursorCallbackSourceKindFromHeaders(headers);
  const sig = headers['x-cursor-signature-256'];
  const sigOk = verifyCursorWebhookSignature(secret, p.rawBody, sig);
  if (!sigOk) {
    try {
      await recordCosCursorWebhookIngressSafe({
        env,
        request_id: requestId,
        signature_verification_ok: false,
        json_parse_ok: false,
        correlation_outcome: 'rejected_invalid_signature',
        rejection_reason: 'signature_verification_failed',
        callback_source_kind,
        callback_verification_kind: 'invalid_signature',
        callback_match_basis: 'none',
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
    return { ok: false, httpStatus: 401, body: 'invalid signature' };
  }

  let body;
  try {
    body = JSON.parse(p.rawBody.toString('utf8'));
  } catch {
    try {
      await recordCosCursorWebhookIngressSafe({
        env,
        request_id: requestId,
        signature_verification_ok: true,
        json_parse_ok: false,
        correlation_outcome: 'rejected_invalid_json',
        rejection_reason: 'json_parse_failed',
        callback_source_kind,
        callback_verification_kind: 'verified_signature',
        callback_match_basis: 'none',
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
    return { ok: false, httpStatus: 400, body: 'invalid json' };
  }

  const root = body && typeof body === 'object' && !Array.isArray(body) ? body : {};
  const peek = peekCursorWebhookObservedSchemaSnapshot(root, env);
  const norm = normalizeCursorWebhookPayload(root, env);
  const gateSel = computeCursorWebhookFieldSelection(root, env);
  const ingress_callback_gate = buildCursorCallbackInsufficientDiagnostics(gateSel);

  if (!norm) {
    try {
      await recordCosCursorWebhookIngressSafe({
        env,
        request_id: requestId,
        signature_verification_ok: true,
        json_parse_ok: true,
        top_level_keys: Array.isArray(peek.top_level_keys) ? peek.top_level_keys : null,
        observed_callback_schema_snapshot: peek,
        run_id_candidate_tail: peek.run_id_candidate_tail,
        status_candidate_raw: peek.status_candidate_raw,
        thread_hint_present: peek.thread_hint_present,
        packet_hint_present: peek.packet_hint_present,
        correlation_outcome: 'ignored_insufficient_payload',
        rejection_reason: pickCursorWebhookInsufficientRejectionReason(ingress_callback_gate),
        ingress_callback_gate,
        callback_source_kind,
        callback_verification_kind: 'verified_signature',
        callback_match_basis: 'none',
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
    return { ok: true, httpStatus: 202, body: 'ignored: insufficient payload', ignored: true };
  }

  const { canonical, evidence: ingressEvidence } = norm;
  const { corr, matched_by } = await findExternalCorrelationCursorHintsWithMeta({
    external_run_id: canonical.external_run_id,
    run_id: canonical.run_id_hint,
    packet_id: canonical.packet_id_hint,
    thread_key: canonical.thread_key_hint,
    accepted_external_id: canonical.accepted_external_id_hint,
    callback_request_id: canonical.callback_request_id_hint,
    callback_path_fingerprint: canonical.callback_path_fingerprint_hint,
  });
  const fp = crypto.createHash('sha256').update(p.rawBody).digest('hex').slice(0, 16);
  const callback_match_basis = mapMatchedByToCallbackMatchBasis(matched_by);
  const out = await processCanonicalExternalEvent(canonical, corr, {
    matched_by,
    payload_fingerprint_prefix: fp,
    ingress_evidence: ingressEvidence,
    callback_source_kind,
    callback_verification_kind: 'verified_signature',
    callback_match_basis,
  });

  const runIdForIngress = corr?.run_id != null ? String(corr.run_id).trim() : '';
  const threadKeyForIngress = corr?.thread_key != null ? String(corr.thread_key).trim() : '';

  try {
    await recordCosCursorWebhookIngressSafe({
      env,
      request_id: requestId,
      run_id: runIdForIngress || null,
      thread_key: threadKeyForIngress || null,
      signature_verification_ok: true,
      json_parse_ok: true,
      top_level_keys: Array.isArray(peek.top_level_keys) ? peek.top_level_keys : null,
      observed_callback_schema_snapshot: peek,
      run_id_candidate_tail: peek.run_id_candidate_tail,
      status_candidate_raw: peek.status_candidate_raw,
      thread_hint_present: peek.thread_hint_present,
      packet_hint_present: peek.packet_hint_present,
      correlation_outcome: out.matched ? 'matched' : 'no_match',
      rejection_reason: out.matched ? null : 'correlation_store_no_match',
      matched_by,
      ingress_callback_gate,
      callback_source_kind,
      callback_verification_kind: 'verified_signature',
      callback_match_basis: out.matched ? callback_match_basis : 'none',
    });
  } catch (e) {
    console.error('[ops_smoke]', e);
  }

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
  __resetRecoveryEnvelopeStoreForTests();
}
