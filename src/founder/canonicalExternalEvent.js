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
  getRunById,
  patchRun,
  patchRunById,
  deriveRunTerminalStatus,
  deriveRunStage,
  signalSupervisorWakeForRun,
} from './executionRunStore.js';
import { buildPacketsById, recomputeCurrentNext } from './runProgressor.js';
import { appendCosRunEventForRun } from './runCosEvents.js';
import { recordOpsSmokeAfterExternalMatch } from './smokeOps.js';
import { findExternalCorrelation, findExternalCorrelationCursorHints } from './correlationStore.js';
import {
  canonicalizeExternalRunStatus,
  resolveCursorPacketStateAuthority,
  externalBucketToDesiredPacketState,
} from './externalRunStatus.js';
import { allowsAuthoritativeCursorPacketProgression } from './cursorCallbackTruth.js';

/**
 * @param {string} provider
 * @param {string} reason
 * @param {Record<string, unknown>} [extra]
 */
function logStaleOrMissingRun(provider, reason, extra) {
  console.info(
    JSON.stringify({
      event: 'cos_external_event_stale_or_missing_run',
      provider: String(provider || ''),
      reason,
      ...(extra && typeof extra === 'object' ? extra : {}),
    }),
  );
}

/**
 * @param {CanonicalExternalEvent} canonical
 * @param {string} statusHint
 * @param {{ bucket: string }} canonForOut
 */
function evidenceCanonicalStatus(canonical, statusHint, canonForOut) {
  const p = String(canonical.provider || '');
  if (p === 'cursor') return String(canonForOut.bucket || '');
  if (p === 'github') {
    if (statusHint === 'external_completed') return 'positive_terminal';
    if (statusHint === 'external_failed') return 'negative_terminal';
    return 'non_milestone';
  }
  return null;
}

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
    completed_at: status === 'completed' ? now : null,
    last_progressed_at: now,
  });
}

/**
 * @param {string} runId
 * @param {string} packetId
 * @param {string} packetState
 */
export async function applyExternalPacketProgressStateForRun(runId, packetId, packetState) {
  const rid = String(runId || '').trim();
  const pid = String(packetId || '').trim();
  const st = String(packetState || '').trim();
  if (!rid || !pid || !st) return;
  const allowed = new Set(['queued', 'ready', 'running', 'review_required', 'blocked', 'completed', 'failed', 'skipped']);
  if (!allowed.has(st)) return;

  const run = await getRunById(rid);
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
  await patchRunById(rid, {
    packet_state_map: psm,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : null,
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
    completed_at: status === 'completed' ? now : null,
    last_progressed_at: now,
    cursor_external_terminal_by_packet: termMap,
  });
}

/**
 * @param {string} runId
 * @param {string} packetId
 * @param {CanonicalExternalEvent} canonical
 */
/**
 * @returns {Promise<boolean>} true if run row was patched
 */
/**
 * Correlation row may omit packet_id; webhook may carry packet_id_hint; else infer running emit_patch packet.
 * @param {Record<string, unknown> | null | undefined} runRow
 * @param {Record<string, unknown>} corr
 * @param {CanonicalExternalEvent} canonical
 */
export function resolveEffectiveCursorPacketId(runRow, corr, canonical) {
  if (String(canonical.provider || '') !== 'cursor') {
    return corr.packet_id != null ? String(corr.packet_id).trim() : '';
  }
  let pkt = corr.packet_id != null ? String(corr.packet_id).trim() : '';
  if (!pkt && canonical.packet_id_hint) pkt = String(canonical.packet_id_hint).trim();
  if (!pkt && runRow) {
    const anchor =
      runRow.cursor_callback_anchor && typeof runRow.cursor_callback_anchor === 'object'
        ? /** @type {Record<string, unknown>} */ (runRow.cursor_callback_anchor)
        : {};
    if (String(anchor.action || '') === 'emit_patch') {
      const psm =
        runRow.packet_state_map && typeof runRow.packet_state_map === 'object'
          ? /** @type {Record<string, string>} */ (runRow.packet_state_map)
          : {};
      const req = Array.isArray(runRow.required_packet_ids) ? runRow.required_packet_ids.map(String) : [];
      for (const id of req) {
        if (String(psm[id] || '') === 'running') return id;
      }
      const cur = runRow.current_packet_id != null ? String(runRow.current_packet_id).trim() : '';
      if (cur) return cur;
    }
  }
  return pkt;
}

export async function applyExternalCursorPacketProgressForRun(runId, packetId, canonical) {
  const rid = String(runId || '').trim();
  const pid = String(packetId || '').trim();
  if (!rid || !pid) return false;
  const run = await getRunById(rid);
  if (!run) return false;

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
  if (res.skipPatch) return false;

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
  await patchRunById(rid, {
    packet_state_map: psm,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : null,
    last_progressed_at: now,
    cursor_external_terminal_by_packet: termMap,
  });
  return true;
}

/**
 * @param {CanonicalExternalEvent} canonical
 * @param {Record<string, unknown> | null} corr
 * @param {{
 *   matched_by?: string | null,
 *   payload_fingerprint_prefix?: string | null,
 *   ingress_evidence?: Record<string, unknown>,
 *   callback_source_kind?: string | null,
 *   callback_match_basis?: string | null,
 *   callback_verification_kind?: string | null,
 * }} [ingressMeta]
 * @returns {Promise<{ matched: boolean, httpBody: string, canonical_status?: string }>}
 */
export async function processCanonicalExternalEvent(canonical, corr, ingressMeta) {
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

  const runId = corr.run_id != null ? String(corr.run_id).trim() : '';
  if (!runId) {
    logStaleOrMissingRun(canonical.provider, 'missing_run_id', {
      external_id: canonical.external_id,
      thread_key: threadKey,
    });
    return { matched: false, httpBody: 'missing run_id' };
  }

  const runRow = await getRunById(runId);
  if (!runRow) {
    logStaleOrMissingRun(canonical.provider, 'run_not_found', {
      run_id: runId,
      external_id: canonical.external_id,
      thread_key: threadKey,
    });
    return { matched: false, httpBody: 'run not found' };
  }
  if (String(runRow.thread_key || '') !== threadKey) {
    logStaleOrMissingRun(canonical.provider, 'thread_key_mismatch', {
      run_id: runId,
      thread_key: threadKey,
      run_thread_key: String(runRow.thread_key || ''),
    });
    return { matched: false, httpBody: 'thread mismatch' };
  }

  const meta = ingressMeta && typeof ingressMeta === 'object' ? ingressMeta : {};
  const ingressEvidence =
    meta.ingress_evidence && typeof meta.ingress_evidence === 'object' ? meta.ingress_evidence : {};
  const cs = evidenceCanonicalStatus(canonical, statusHint, canonForOut);

  if (String(canonical.provider || '') === 'cursor') {
    try {
      const { markRecoveryEnvelopePrimaryCallbackObserved } = await import('./resultRecoveryBridge.js');
      await markRecoveryEnvelopePrimaryCallbackObserved(runId);
    } catch (e) {
      console.error('[result_recovery_bridge]', e);
    }
  }

  const callbackSourceKind =
    meta.callback_source_kind != null ? String(meta.callback_source_kind).slice(0, 32) : 'unknown';
  const allowProg =
    canonical.provider === 'cursor' && allowsAuthoritativeCursorPacketProgression(callbackSourceKind);

  const pktEff = resolveEffectiveCursorPacketId(runRow, corr, canonical);

  /** @type {string | null} */
  let progression_skipped_reason = null;
  let cursorPacketPatched = false;
  if (canonical.provider === 'cursor' && allowProg && pktEff) {
    cursorPacketPatched = await applyExternalCursorPacketProgressForRun(runId, pktEff, canonical);
    if (!cursorPacketPatched) progression_skipped_reason = 'authority_resolution_or_idempotent_skip';
  } else if (canonical.provider === 'cursor' && allowProg && !pktEff) {
    progression_skipped_reason = 'missing_target_packet_id';
  } else if (canonical.provider === 'cursor' && !allowProg) {
    progression_skipped_reason = 'non_provider_callback_source';
  }

  const authoritative_packet_progression =
    allowProg && cursorPacketPatched && (callbackSourceKind === 'provider_runtime' || callbackSourceKind === 'unknown');

  if (authoritative_packet_progression) {
    const prevAnchor =
      runRow.cursor_callback_anchor && typeof runRow.cursor_callback_anchor === 'object'
        ? /** @type {Record<string, unknown>} */ (runRow.cursor_callback_anchor)
        : {};
    const nextAnchor = { ...prevAnchor, provider_structural_closure_at: new Date().toISOString() };
    if (pktEff) nextAnchor.provider_structural_closure_packet_id = pktEff;
    try {
      await patchRunById(runId, { cursor_callback_anchor: nextAnchor });
    } catch (e) {
      console.error('[cos_provider_structural_closure]', e);
    }
  }

  /** @type {Record<string, unknown>} */
  const eventPayload = {
    canonical_provider: canonical.provider,
    canonical_event_type: canonical.event_type,
    external_id: canonical.external_id,
    external_run_id: canonical.external_run_id,
    status_hint: statusHint,
    occurred_at: canonical.occurred_at,
    correlation: { packet_id: corr.packet_id, run_id: corr.run_id },
    payload: canonical.payload,
  };
  if (canonical.provider === 'cursor') {
    Object.assign(eventPayload, {
      cos_callback_closure_source: callbackSourceKind,
      cos_callback_match_basis:
        meta.callback_match_basis != null ? String(meta.callback_match_basis).slice(0, 40) : null,
      cos_effective_packet_id: pktEff || null,
      cos_packet_progression_applied: cursorPacketPatched,
      cos_packet_progression_skipped_reason: progression_skipped_reason,
      cos_authoritative_packet_progression: authoritative_packet_progression,
      target_run_id: runId,
      target_packet_id_resolved: pktEff || null,
    });
  }

  await appendCosRunEventForRun(runId, eventType, eventPayload, {
    matched_by: meta.matched_by ?? null,
    canonical_status: cs,
    payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
  });

  await signalSupervisorWakeForRun(threadKey, runId);

  try {
    if (String(canonical.provider || '') === 'cursor') {
      await recordOpsSmokeAfterExternalMatch({
        runId,
        threadKey,
        canonical,
        corr,
        ingressMeta: meta,
        canonForOut,
        ingressEvidence,
        cursorPacketPatched,
        progression_skipped_reason,
      });
    }
  } catch (e) {
    console.error('[ops_smoke]', e);
  }

  return {
    matched: true,
    httpBody: 'ok',
    ...(String(canonical.provider || '') === 'cursor' ? { canonical_status: String(canonForOut.bucket) } : {}),
  };
}
