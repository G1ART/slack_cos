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
 *   callback_request_id_hint?: string | null,
 *   callback_path_fingerprint_hint?: string | null,
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
    const anchorPkt = anchor.packet_id != null ? String(anchor.packet_id).trim() : '';
    if (anchorPkt) pkt = anchorPkt;
  }
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

/**
 * @param {Record<string, unknown> | null | undefined} runRow
 */
function listDispatchPacketsForRun(runRow) {
  if (!runRow) return [];
  const d =
    runRow.dispatch_payload && typeof runRow.dispatch_payload === 'object'
      ? /** @type {Record<string, unknown>} */ (runRow.dispatch_payload)
      : {};
  const snap =
    runRow.harness_snapshot && typeof runRow.harness_snapshot === 'object'
      ? /** @type {Record<string, unknown>} */ (runRow.harness_snapshot)
      : {};
  const fromD = Array.isArray(d.packets) ? /** @type {unknown[]} */ (d.packets) : [];
  const fromS = Array.isArray(snap.packets) ? /** @type {unknown[]} */ (snap.packets) : [];
  return fromD.length ? fromD : fromS;
}

/** @param {unknown} p */
function isCursorEmitPatchPacketMeta(p) {
  if (!p || typeof p !== 'object' || Array.isArray(p)) return false;
  const o = /** @type {Record<string, unknown>} */ (p);
  return String(o.preferred_tool || '') === 'cursor' && String(o.preferred_action || '') === 'emit_patch';
}

export function runDispatchHasEmitPatchPacket(runRow) {
  if (!runRow) return false;
  return listDispatchPacketsForRun(runRow).some((p) => isCursorEmitPatchPacketMeta(p));
}

/**
 * @param {Record<string, unknown> | null | undefined} runRow
 * @param {string} packetId
 */
function getPacketMetaById(runRow, packetId) {
  const id = String(packetId || '').trim();
  if (!id || !runRow) return null;
  for (const p of listDispatchPacketsForRun(runRow)) {
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const o = /** @type {Record<string, unknown>} */ (p);
    if (String(o.packet_id || '').trim() === id) return o;
  }
  return null;
}

export function packetIdIfEmitPatchOnRun(runRow, rawId) {
  const id = String(rawId || '').trim();
  if (!id || !runRow) return '';
  return isCursorEmitPatchPacketMeta(getPacketMetaById(runRow, id)) ? id : '';
}

/**
 * Deterministic emit_patch packet id for provider structural closure (vNext.13.73).
 * @param {Record<string, unknown>} runRow
 * @param {Record<string, unknown>} corr
 * @param {CanonicalExternalEvent} canonical
 * @returns {{ packetId: string, closure_not_applied_reason: string | null }}
 */
export function resolveEmitPatchAuthoritativePacketId(runRow, corr, canonical) {
  const fromCorr = packetIdIfEmitPatchOnRun(runRow, corr.packet_id != null ? String(corr.packet_id) : '');
  if (fromCorr) return { packetId: fromCorr, closure_not_applied_reason: null };

  const fromHint = packetIdIfEmitPatchOnRun(runRow, canonical.packet_id_hint);
  if (fromHint) return { packetId: fromHint, closure_not_applied_reason: null };

  const anchor =
    runRow.cursor_callback_anchor && typeof runRow.cursor_callback_anchor === 'object'
      ? /** @type {Record<string, unknown>} */ (runRow.cursor_callback_anchor)
      : {};
  const fromAnchor = packetIdIfEmitPatchOnRun(runRow, anchor.packet_id);
  if (fromAnchor) return { packetId: fromAnchor, closure_not_applied_reason: null };

  const psm =
    runRow.packet_state_map && typeof runRow.packet_state_map === 'object'
      ? /** @type {Record<string, string>} */ (runRow.packet_state_map)
      : {};
  const req = Array.isArray(runRow.required_packet_ids) ? runRow.required_packet_ids.map(String) : [];
  /** @type {string[]} */
  const runningEmit = [];
  for (const rid of req) {
    if (String(psm[rid] || '') !== 'running') continue;
    if (packetIdIfEmitPatchOnRun(runRow, rid)) runningEmit.push(rid);
  }
  if (runningEmit.length === 1) return { packetId: runningEmit[0], closure_not_applied_reason: null };
  return { packetId: '', closure_not_applied_reason: 'effective_packet_id_unresolved' };
}

/**
 * Mixed delegate graphs may include an emit_patch packet while the active correlation targets create_spec.
 * Authoritative emit_patch closure applies only when correlation/hints resolve an emit_patch target, or
 * exactly one running emit_patch packet can be inferred without contradicting an explicit non-emit corr id.
 * @param {Record<string, unknown>} runRow
 * @param {Record<string, unknown>} corr
 * @param {CanonicalExternalEvent} canonical
 */
export function shouldUseEmitPatchAuthoritativeCursorClosure(runRow, corr, canonical) {
  if (!runDispatchHasEmitPatchPacket(runRow)) return false;
  const cPid = corr.packet_id != null ? String(corr.packet_id).trim() : '';
  if (cPid) {
    return Boolean(packetIdIfEmitPatchOnRun(runRow, cPid));
  }
  const quick = resolveEmitPatchAuthoritativePacketId(runRow, corr, canonical);
  return Boolean(quick.packetId);
}

/**
 * @param {string} runId
 * @param {Record<string, unknown>} runRow
 * @param {Record<string, unknown>} corr
 * @param {CanonicalExternalEvent} canonical
 * @param {{ bucket: string }} canonForOut
 * @param {string} callbackSourceKind
 */
async function tryApplyAuthoritativeCursorEmitPatchClosureForRun(
  runId,
  runRow,
  corr,
  canonical,
  canonForOut,
  callbackSourceKind,
) {
  const src = String(callbackSourceKind || '').trim().toLowerCase();
  if (src !== 'provider_runtime') {
    return {
      applied: false,
      progression_applied: false,
      effective_packet_id: '',
      closure_not_applied_reason: 'non_provider_callback_source',
      idempotent_repeat: false,
    };
  }

  const bucket = String(canonForOut.bucket || '');
  if (bucket !== 'positive_terminal' && bucket !== 'negative_terminal') {
    return {
      applied: false,
      progression_applied: false,
      effective_packet_id: '',
      closure_not_applied_reason: 'non_terminal_callback_status',
      idempotent_repeat: false,
    };
  }

  const { packetId, closure_not_applied_reason: unresolved } = resolveEmitPatchAuthoritativePacketId(
    runRow,
    corr,
    canonical,
  );
  if (!packetId) {
    return {
      applied: false,
      progression_applied: false,
      effective_packet_id: '',
      closure_not_applied_reason: unresolved || 'effective_packet_id_unresolved',
      idempotent_repeat: false,
    };
  }

  const prevAnchor =
    runRow.cursor_callback_anchor && typeof runRow.cursor_callback_anchor === 'object'
      ? /** @type {Record<string, unknown>} */ (runRow.cursor_callback_anchor)
      : {};
  const psm0 =
    runRow.packet_state_map && typeof runRow.packet_state_map === 'object'
      ? /** @type {Record<string, string>} */ (runRow.packet_state_map)
      : {};
  const st0 = String(psm0[packetId] || '');
  if (
    prevAnchor.provider_structural_closure_at &&
    String(prevAnchor.provider_structural_closure_packet_id || '').trim() === packetId &&
    (st0 === 'completed' || st0 === 'failed' || st0 === 'skipped')
  ) {
    return {
      applied: true,
      progression_applied: false,
      effective_packet_id: packetId,
      closure_not_applied_reason: null,
      idempotent_repeat: true,
    };
  }

  const progressed = await applyExternalCursorPacketProgressForRun(runId, packetId, canonical);
  if (!progressed) {
    return {
      applied: false,
      progression_applied: false,
      effective_packet_id: packetId,
      closure_not_applied_reason: 'packet_progression_not_applied',
      idempotent_repeat: false,
    };
  }

  const reqId =
    canonical.callback_request_id_hint != null && String(canonical.callback_request_id_hint).trim()
      ? String(canonical.callback_request_id_hint).trim().slice(0, 128)
      : null;
  const pathFp =
    canonical.callback_path_fingerprint_hint != null && String(canonical.callback_path_fingerprint_hint).trim()
      ? String(canonical.callback_path_fingerprint_hint).trim().slice(0, 128)
      : null;

  const nextAnchor = {
    ...prevAnchor,
    provider_structural_closure_at: new Date().toISOString(),
    provider_structural_closure_source: 'provider_runtime',
    provider_structural_closure_request_id: reqId,
    provider_structural_closure_packet_id: packetId,
    provider_structural_closure_status_bucket: bucket,
    ...(pathFp ? { provider_structural_closure_paths_fingerprint: pathFp } : {}),
  };
  try {
    await patchRunById(runId, { cursor_callback_anchor: nextAnchor });
  } catch (e) {
    console.error('[cos_provider_structural_closure]', e);
    return {
      applied: false,
      progression_applied: true,
      effective_packet_id: packetId,
      closure_not_applied_reason: 'packet_progression_not_applied',
      idempotent_repeat: false,
    };
  }

  return {
    applied: true,
    progression_applied: true,
    effective_packet_id: packetId,
    closure_not_applied_reason: null,
    idempotent_repeat: false,
  };
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
    meta.callback_source_kind != null ? String(meta.callback_source_kind).slice(0, 32) : 'provider_runtime';

  /** @type {string | null} */
  let progression_skipped_reason = null;
  let cursorPacketPatched = false;
  let authoritative_packet_progression = false;
  /** @type {string | null} */
  let closure_not_applied_reason = null;
  let authoritative_emit_patch_closure_applied = false;
  let emit_patch_authoritative_path = false;
  let supervisor_should_wake = true;
  let idempotent_closure_repeat = false;
  let pktEff = '';

  if (canonical.provider === 'cursor') {
    emit_patch_authoritative_path = shouldUseEmitPatchAuthoritativeCursorClosure(runRow, corr, canonical);
    if (emit_patch_authoritative_path) {
      const closure = await tryApplyAuthoritativeCursorEmitPatchClosureForRun(
        runId,
        runRow,
        corr,
        canonical,
        canonForOut,
        callbackSourceKind,
      );
      pktEff =
        closure.effective_packet_id ||
        resolveEmitPatchAuthoritativePacketId(runRow, corr, canonical).packetId ||
        '';
      cursorPacketPatched = closure.progression_applied;
      authoritative_emit_patch_closure_applied = closure.applied;
      closure_not_applied_reason = closure.closure_not_applied_reason;
      idempotent_closure_repeat = closure.idempotent_repeat;
      progression_skipped_reason = closure.applied ? null : closure.closure_not_applied_reason;
      authoritative_packet_progression = Boolean(closure.applied && closure.progression_applied);
      supervisor_should_wake = Boolean(closure.applied);
    } else {
      const allowProg = allowsAuthoritativeCursorPacketProgression(callbackSourceKind);
      pktEff = resolveEffectiveCursorPacketId(runRow, corr, canonical);
      if (allowProg && pktEff) {
        cursorPacketPatched = await applyExternalCursorPacketProgressForRun(runId, pktEff, canonical);
        if (!cursorPacketPatched) progression_skipped_reason = 'authority_resolution_or_idempotent_skip';
      } else if (allowProg && !pktEff) {
        progression_skipped_reason = 'missing_target_packet_id';
      } else if (!allowProg) {
        progression_skipped_reason = 'non_provider_callback_source';
      }
      authoritative_packet_progression = false;
      supervisor_should_wake = true;
    }
  } else {
    pktEff = corr.packet_id != null ? String(corr.packet_id).trim() : '';
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
      cos_authoritative_emit_patch_closure_applied: authoritative_emit_patch_closure_applied,
      cos_closure_not_applied_reason: closure_not_applied_reason,
      cos_emit_patch_authoritative_path: emit_patch_authoritative_path,
      target_run_id: runId,
      target_packet_id_resolved: pktEff || null,
    });
  }

  await appendCosRunEventForRun(runId, eventType, eventPayload, {
    matched_by: meta.matched_by ?? null,
    canonical_status: cs,
    payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
  });

  if (canonical.provider === 'cursor' && emit_patch_authoritative_path) {
    if (authoritative_emit_patch_closure_applied && !idempotent_closure_repeat) {
      await appendCosRunEventForRun(
        runId,
        'cursor_authoritative_closure_applied',
        {
          target_run_id: runId,
          effective_packet_id: pktEff || null,
          provider_structural_closure_source: 'provider_runtime',
        },
        {
          matched_by: meta.matched_by ?? null,
          canonical_status: cs,
          payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
        },
      );
    } else if (!authoritative_emit_patch_closure_applied) {
      await appendCosRunEventForRun(
        runId,
        'cursor_callback_correlated_but_closure_not_applied',
        {
          target_run_id: runId,
          closure_not_applied_reason: closure_not_applied_reason,
          correlation: { packet_id: corr.packet_id, run_id: corr.run_id },
        },
        {
          matched_by: meta.matched_by ?? null,
          canonical_status: cs,
          payload_fingerprint_prefix: meta.payload_fingerprint_prefix ?? null,
        },
      );
    }
  }

  if (supervisor_should_wake) {
    await signalSupervisorWakeForRun(threadKey, runId);
  }

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
        authoritative_closure_applied: authoritative_emit_patch_closure_applied,
        closure_not_applied_reason,
        emit_patch_authoritative_path: emit_patch_authoritative_path,
        supervisor_wake_enqueued: supervisor_should_wake,
        idempotent_closure_repeat: idempotent_closure_repeat,
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
