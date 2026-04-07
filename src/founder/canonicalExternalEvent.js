/**
 * Canonical external events → cos_run_events + run/packet patch + supervisor wake.
 * @typedef {{
 *   provider: 'github'|'cursor'|'railway',
 *   event_type: string,
 *   external_id: string,
 *   external_run_id: string | null,
 *   status_hint: string,
 *   thread_key_hint: string | null,
 *   packet_id_hint: string | null,
 *   run_id_hint: string | null,
 *   occurred_at: string,
 *   payload: Record<string, unknown>,
 * }} CanonicalExternalEvent
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
import { findExternalCorrelation, findExternalCorrelationCursorHints } from './correlationStore.js';
import {
  canonicalizeExternalRunStatus,
  resolveCursorPacketStateAuthority,
  externalBucketToDesiredPacketState,
} from './externalRunStatus.js';

/**
 * @param {Record<string, unknown>} norm normalizeGithubWebhookPayload result
 * @param {string} ghEventHeader
 * @returns {CanonicalExternalEvent}
 */
export function buildCanonicalFromGithubNormalized(norm, ghEventHeader) {
  const ck = norm.correlation_keys && typeof norm.correlation_keys === 'object' ? norm.correlation_keys : {};
  const object_type = String(ck.object_type || '');
  const object_id = String(ck.object_id || '');
  const received_at = String(norm.received_at || new Date().toISOString());
  return {
    provider: 'github',
    event_type: String(norm.event_type || ghEventHeader || 'unknown'),
    external_id: String(norm.external_id || `github:${object_type}:${object_id}`),
    external_run_id: null,
    status_hint: String(norm.status_hint || 'external_status_update'),
    thread_key_hint: null,
    packet_id_hint: null,
    run_id_hint: null,
    occurred_at: received_at,
    payload: {
      raw_summary: norm.raw_summary,
      correlation_keys: { object_type, object_id },
      github_event_header: ghEventHeader || null,
    },
  };
}

/**
 * @param {CanonicalExternalEvent} canonical
 */
export async function resolveCorrelationForCanonical(canonical) {
  const p = String(canonical.provider || '');
  if (p === 'github') {
    const ck = canonical.payload?.correlation_keys;
    const cko = ck && typeof ck === 'object' ? ck : {};
    const object_type = String(cko.object_type || '');
    const object_id = String(cko.object_id || '');
    if (!object_type || !object_id) return null;
    return findExternalCorrelation('github', object_type, object_id);
  }
  if (p === 'cursor') {
    return (
      await findExternalCorrelationCursorHints({
        external_run_id: canonical.external_run_id,
        run_id: canonical.run_id_hint,
        packet_id: canonical.packet_id_hint,
        thread_key: canonical.thread_key_hint,
      })
    );
  }
  return null;
}

/**
 * @param {string} threadKey
 * @param {string} packetId
 * @param {string} packetState
 */
export async function applyExternalPacketProgressState(threadKey, packetId, packetState) {
  const tk = String(threadKey || '').trim();
  const pid = String(packetId || '').trim();
  const st = String(packetState || '').trim();
  if (!tk || !pid || !st) return;
  const allowed = new Set(['queued', 'ready', 'running', 'review_required', 'blocked', 'completed', 'failed', 'skipped']);
  if (!allowed.has(st)) return;

  const run = await getActiveRunForThread(tk);
  if (!run) return;
  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const psm = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
    [pid]: st,
  };
  const packetsById = buildPacketsById(run);
  const terminal_packet_ids = required.filter((id) => {
    const s = psm[id];
    return s === 'completed' || s === 'skipped' || s === 'failed';
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
 * Cursor webhook → packet patch with terminal authority + durable terminal map.
 * @param {string} threadKey
 * @param {string} packetId
 * @param {CanonicalExternalEvent} canonical
 */
export async function applyExternalCursorPacketProgress(threadKey, packetId, canonical) {
  const tk = String(threadKey || '').trim();
  const pid = String(packetId || '').trim();
  if (!tk || !pid) return;
  const run = await getActiveRunForThread(tk);
  if (!run) return;

  const statusRaw = String(
    canonical.payload && typeof canonical.payload === 'object'
      ? /** @type {Record<string, unknown>} */ (canonical.payload).status || ''
      : '',
  );
  const canon = canonicalizeExternalRunStatus(statusRaw);
  /** @type {string} */
  let desired;
  if (canon.bucket === 'positive_terminal') desired = 'completed';
  else if (canon.bucket === 'negative_terminal') desired = 'failed';
  else if (canon.bucket === 'non_terminal') {
    desired = externalBucketToDesiredPacketState('non_terminal', canon.raw_normalized);
  } else {
    const hint = String(canonical.status_hint || '');
    if (hint === 'external_completed') desired = 'completed';
    else if (hint === 'external_failed') desired = 'failed';
    else desired = 'running';
  }

  const psm = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
  };
  const existing = String(psm[pid] || 'queued');
  const termMap =
    run.cursor_external_terminal_by_packet && typeof run.cursor_external_terminal_by_packet === 'object'
      ? { .../** @type {Record<string, unknown>} */ (run.cursor_external_terminal_by_packet) }
      : {};
  const lastRecRaw = termMap[pid];
  const lastRec =
    lastRecRaw && typeof lastRecRaw === 'object' && !Array.isArray(lastRecRaw)
      ? /** @type {{ occurred_at?: string, outcome?: string }} */ (lastRecRaw)
      : null;

  const res = resolveCursorPacketStateAuthority(existing, desired, canonical.occurred_at, lastRec);
  if (res.skipPatch) return;

  psm[pid] = res.state;
  if (res.terminalRecord) {
    termMap[pid] = res.terminalRecord;
  }

  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const terminal_packet_ids = required.filter((id) => {
    const s = psm[id];
    return s === 'completed' || s === 'skipped' || s === 'failed';
  });
  const packetsById = buildPacketsById(run);
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
    cursor_external_terminal_by_packet: termMap,
  });
}

/**
 * @param {CanonicalExternalEvent} canonical
 * @param {Record<string, unknown> | null} corr
 * @returns {Promise<{ matched: boolean, httpBody: string, canonical_status?: string }>}
 */
export async function processCanonicalExternalEvent(canonical, corr) {
  const statusHint = String(canonical.status_hint || 'external_status_update');
  const eventType =
    statusHint === 'external_completed'
      ? 'external_completed'
      : statusHint === 'external_failed'
        ? 'external_failed'
        : 'external_status_update';

  const statusRawForCanon = String(
    canonical.payload && typeof canonical.payload === 'object'
      ? /** @type {Record<string, unknown>} */ (canonical.payload).status || ''
      : '',
  );
  const canonForOut = canonicalizeExternalRunStatus(statusRawForCanon);

  if (!corr) {
    console.info(
      JSON.stringify({
        event: 'cos_external_event_no_match',
        provider: canonical.provider,
        event_type: canonical.event_type,
        external_run_id: canonical.external_run_id,
        external_id: canonical.external_id,
        status_hint: statusHint,
      }),
    );
    return { matched: false, httpBody: 'no correlation' };
  }

  const threadKey = String(corr.thread_key || '');
  if (!threadKey) {
    return { matched: false, httpBody: 'no thread_key' };
  }

  await appendCosRunEvent(threadKey, eventType, {
    canonical_provider: canonical.provider,
    canonical_event_type: canonical.event_type,
    external_id: canonical.external_id,
    external_run_id: canonical.external_run_id,
    status_hint: statusHint,
    occurred_at: canonical.occurred_at,
    correlation: { packet_id: corr.packet_id, run_id: corr.run_id },
    payload: canonical.payload,
  });

  const pkt = corr.packet_id != null ? String(corr.packet_id).trim() : '';

  if (canonical.provider === 'cursor' && pkt) {
    await applyExternalCursorPacketProgress(threadKey, pkt, canonical);
  } else if (canonical.provider === 'github' && pkt && (statusHint === 'external_completed' || statusHint === 'external_failed')) {
    await applyExternalPacketProgressState(
      threadKey,
      pkt,
      statusHint === 'external_completed' ? 'completed' : 'failed',
    );
  }

  notifyRunStateChanged(threadKey);
  return {
    matched: true,
    httpBody: 'ok',
    ...(String(canonical.provider || '') === 'cursor' ? { canonical_status: String(canonForOut.bucket) } : {}),
  };
}
