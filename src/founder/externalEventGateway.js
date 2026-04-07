/**
 * Inbound external events: validate → normalize → correlate → run patch → supervisor wake.
 */

import {
  getActiveRunForThread,
  patchRun,
  deriveRunTerminalStatus,
  deriveRunStage,
} from './executionRunStore.js';
import { buildPacketsById, recomputeCurrentNext } from './runProgressor.js';
import { notifyRunStateChanged } from './supervisorDirectTrigger.js';
import { appendCosRunEvent } from './runCosEvents.js';
import {
  findExternalCorrelation,
  __resetCorrelationMemoryForTests,
} from './correlationStore.js';
import { tryRecordGithubDelivery, __resetGithubDeliveryMemoryForTests } from './githubWebhookDedupe.js';
import { __resetCosRunEventsMemoryForTests } from './runCosEvents.js';
import {
  verifyGithubWebhookSignature,
  normalizeGithubWebhookPayload,
  githubRepoMatchesConfigured,
} from './providerEventNormalizers.js';
import { githubWebhookFollowOnFetch, GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS } from './githubWebhookFollowOn.js';

/**
 * @param {string} threadKey
 * @param {string} packetId
 * @param {'completed'|'failed'} packetState
 */
export async function applyExternalPacketTransition(threadKey, packetId, packetState) {
  const tk = String(threadKey || '').trim();
  const pid = String(packetId || '').trim();
  if (!tk || !pid) return;
  const run = await getActiveRunForThread(tk);
  if (!run) return;
  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const psm = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
    [pid]: packetState,
  };
  const packetsById = buildPacketsById(run);
  const terminal_packet_ids = required.filter((id) => {
    const st = psm[id];
    return st === 'completed' || st === 'skipped' || st === 'failed';
  });
  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, psm, packetsById);
  const status = deriveRunTerminalStatus(psm, required);
  const stage = deriveRunStage(status, Boolean(run.starter_kickoff && run.starter_kickoff.executed));
  const now = new Date().toISOString();
  await patchRun(tk, {
    packet_state_map: psm,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : run.completed_at ?? null,
    last_progressed_at: now,
  });
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

  const canonical = normalizeGithubWebhookPayload(headers, body);
  if (!canonical) {
    return { ok: true, httpStatus: 202, body: 'unsupported event', ignored: true };
  }

  const ck = canonical.correlation_keys && typeof canonical.correlation_keys === 'object' ? canonical.correlation_keys : {};
  const object_type = String(ck.object_type || '');
  const object_id = String(ck.object_id || '');
  const corr = await findExternalCorrelation('github', object_type, object_id);

  const statusHint = String(canonical.status_hint || 'external_status_update');
  const eventType =
    statusHint === 'external_completed'
      ? 'external_completed'
      : statusHint === 'external_failed'
        ? 'external_failed'
        : 'external_status_update';

  if (!corr) {
    return { ok: true, httpStatus: 202, body: 'no correlation', matched: false };
  }

  const threadKey = String(corr.thread_key || '');
  await appendCosRunEvent(threadKey, eventType, {
    canonical_event_type: canonical.event_type,
    status_hint: statusHint,
    correlation: { packet_id: corr.packet_id, run_id: corr.run_id },
    raw_summary: canonical.raw_summary,
  });

  const pkt = corr.packet_id != null ? String(corr.packet_id).trim() : '';
  if (pkt && (statusHint === 'external_completed' || statusHint === 'external_failed')) {
    await applyExternalPacketTransition(threadKey, pkt, statusHint === 'external_completed' ? 'completed' : 'failed');
  }

  notifyRunStateChanged(threadKey);
  return { ok: true, httpStatus: 200, body: 'ok', matched: true };
}

export function __resetExternalGatewayTestState() {
  __resetCorrelationMemoryForTests();
  __resetGithubDeliveryMemoryForTests();
  __resetCosRunEventsMemoryForTests();
}
