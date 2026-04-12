/**
 * vNext.13.29b–13.31 — execution run + packet graph (durable Supabase, memory test, optional file).
 *
 * Run status: queued | running | review_required | blocked | completed | failed | canceled
 * Run stage: delegated | starter_kickoff | executing | reviewing | finalizing
 * Packet state: queued | ready | running | review_required | blocked | completed | failed | skipped
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { cosRuntimeBaseDir } from './executionLedger.js';
import { orderPacketsByHandoff, derivePacketStateFromOutcome } from './starterLadder.js';
import {
  createCosRuntimeSupabase,
  dbRowToAppRun,
  supabaseCancelActiveRuns,
  supabaseInsertRun,
  supabasePatchLatestRun,
  supabasePatchRunById,
  supabaseSelectLatestRun,
  supabaseSelectRunById,
  supabaseListThreadKeys,
  supabaseListNonTerminalRunIds,
  supabaseListPendingSupervisorWakeRunIds,
  supabaseListRunsWithRecoveryEnvelopePending,
  supabaseAppendRunEvent,
} from './runStoreSupabase.js';
import { notifyRunStateChangedForRun } from './supervisorDirectTrigger.js';

/** @typedef {'queued'|'running'|'review_required'|'blocked'|'completed'|'failed'|'canceled'} RunStatus */
/** @typedef {'delegated'|'starter_kickoff'|'executing'|'reviewing'|'finalizing'} RunStage */
/** @typedef {'started'|'review_required'|'blocked'|'completed'|'failed'} CallbackMilestone */
/** @typedef {'queued'|'ready'|'running'|'review_required'|'blocked'|'completed'|'failed'|'skipped'} PacketState */

/** @type {Map<string, Record<string, unknown>>} */
const memRuns = new Map();

/** @type {Map<string, Record<string, unknown>>} — run uuid → row (same thread may have multiple over time) */
const memRunsById = new Map();

function runsDir() {
  return path.join(cosRuntimeBaseDir(), 'execution_runs');
}

function runsByIdDir() {
  return path.join(runsDir(), 'by_id');
}

/**
 * @param {string} runUuid
 * @returns {Promise<Record<string, unknown> | null>}
 */
async function readRunFromDiskById(runUuid) {
  const rid = String(runUuid || '').trim();
  if (!rid) return null;
  const bid = path.join(runsByIdDir(), `${rid}.json`);
  try {
    const raw = await fs.readFile(bid, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && j.founder_notified_review_at && !j.founder_notified_review_required_at) {
      j.founder_notified_review_required_at = j.founder_notified_review_at;
    }
    return j && typeof j === 'object' ? j : null;
  } catch {
    /* fall through: legacy thread-key-only files */
  }
  const dir = runsDir();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return null;
  }
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const fp = path.join(dir, n);
    try {
      const raw = await fs.readFile(fp, 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && String(j.id || '') === rid) return j;
    } catch {
      /* skip */
    }
  }
  return null;
}

/** @param {string} threadKey */
function safeName(threadKey) {
  return `${Buffer.from(String(threadKey), 'utf8').toString('base64url')}.json`;
}

/**
 * @returns {'supabase'|'memory'|'file'}
 */
function storeMode() {
  const m = String(process.env.COS_RUN_STORE || '').trim().toLowerCase();
  if (m === 'file') return 'file';
  if (m === 'memory') return 'memory';
  if (createCosRuntimeSupabase()) return 'supabase';
  return 'file';
}

/** 외부 이벤트·correlation 모듈용 */
export function getCosRunStoreMode() {
  return storeMode();
}

/** Test isolation */
export function __resetCosRunMemoryStore() {
  memRuns.clear();
  memRunsById.clear();
}

/**
 * @param {Record<string, unknown>} patch
 */
function normalizePatch(patch) {
  const p = { ...patch };
  if ('founder_notified_review_at' in p) {
    p.founder_notified_review_required_at = p.founder_notified_review_at;
    delete p.founder_notified_review_at;
  }
  return p;
}

/**
 * required packet 전부 completed|skipped → completed; any failed; any review_required; any blocked; else running
 * @param {Record<string, string>} packetStateMap
 * @param {string[]} requiredPacketIds
 * @returns {RunStatus}
 */
export function deriveRunTerminalStatus(packetStateMap, requiredPacketIds) {
  const ids =
    Array.isArray(requiredPacketIds) && requiredPacketIds.length
      ? requiredPacketIds.map(String)
      : Object.keys(packetStateMap || {});
  if (!ids.length) return 'running';
  const states = ids.map((id) => String(packetStateMap[id] || 'queued'));
  if (states.every((s) => s === 'completed' || s === 'skipped')) return 'completed';
  if (states.some((s) => s === 'failed')) return 'failed';
  if (states.some((s) => s === 'review_required')) return 'review_required';
  if (states.some((s) => s === 'blocked')) return 'blocked';
  return 'running';
}

/**
 * @param {Record<string, unknown> | null | undefined} run
 */
export function isRunTerminal(run) {
  const s = String(run?.status || '');
  return s === 'completed' || s === 'failed' || s === 'canceled';
}

/**
 * @param {Record<string, unknown>} dispatch
 * @param {Record<string, unknown> | null} kick
 */
function buildPacketGraphFromDispatch(dispatch, kick) {
  const ordered = orderPacketsByHandoff(dispatch);
  /** @type {string[]} */
  const required_packet_ids = [];
  /** @type {Record<string, PacketState>} */
  const packet_state_map = {};

  for (const pkt of ordered) {
    if (!pkt || typeof pkt !== 'object') continue;
    const id = String(pkt.packet_id || '').trim();
    if (!id) continue;
    if (String(pkt.packet_status) === 'draft') {
      packet_state_map[id] = 'skipped';
      continue;
    }
    required_packet_ids.push(id);
    packet_state_map[id] = 'queued';
  }

  if (kick && kick.executed && kick.packet_id) {
    const pid = String(kick.packet_id);
    if (packet_state_map[pid] !== undefined && packet_state_map[pid] !== 'skipped') {
      packet_state_map[pid] = derivePacketStateFromOutcome(
        kick.outcome && typeof kick.outcome === 'object' ? kick.outcome : {},
      );
    }
  }

  const terminal_packet_ids = required_packet_ids.filter((id) => {
    const st = packet_state_map[id];
    return st === 'completed' || st === 'skipped' || st === 'failed';
  });

  let current_packet_id = null;
  let next_packet_id = null;
  for (let i = 0; i < required_packet_ids.length; i += 1) {
    const id = required_packet_ids[i];
    const st = packet_state_map[id];
    if (st === 'completed' || st === 'skipped') continue;
    current_packet_id = id;
    for (let j = i + 1; j < required_packet_ids.length; j += 1) {
      const stj = packet_state_map[required_packet_ids[j]];
      if (stj === 'queued' || stj === 'ready' || stj === 'running') {
        next_packet_id = required_packet_ids[j];
        break;
      }
    }
    break;
  }

  if (!current_packet_id && required_packet_ids.length) {
    current_packet_id = required_packet_ids[required_packet_ids.length - 1];
    next_packet_id = null;
  }

  return {
    required_packet_ids,
    packet_state_map,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
  };
}

/**
 * 레거시·테스트용 — kick 단일 스냅샷에서 run status 힌트 (packet graph와 별개)
 * @param {object} kick
 * @returns {RunStatus | 'queued'}
 */
export function deriveRunStatusFromKickoff(kick) {
  if (!kick || !kick.executed) return 'queued';
  const oc = kick.outcome && typeof kick.outcome === 'object' ? kick.outcome : {};
  const st = String(oc.status || '');
  if (st === 'blocked') return 'blocked';
  if (oc.blocked === true || oc.reason === 'unsupported_tool' || oc.reason === 'unsupported_action') {
    return 'blocked';
  }
  if (st === 'failed') return 'failed';
  if (oc.needs_review === true && st === 'degraded') return 'review_required';
  if (st === 'completed') return 'completed';
  return 'running';
}

/**
 * @param {RunStatus} status
 * @param {boolean} kickExecuted
 * @returns {RunStage}
 */
export function deriveRunStage(status, kickExecuted) {
  if (!kickExecuted) return 'delegated';
  if (status === 'completed') return 'finalizing';
  if (status === 'review_required') return 'reviewing';
  return 'executing';
}

/**
 * Accepted dispatch 직후 durable run row만 확보 (starter kickoff 이전). Supervisor wake 없음.
 * @param {{
 *   threadKey: string,
 *   dispatch: Record<string, unknown>,
 *   founder_request_summary?: string,
 * }} p
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function persistAcceptedRunShell(p) {
  const threadKey = String(p.threadKey || '');
  if (!threadKey) return null;

  const dispatch = p.dispatch && typeof p.dispatch === 'object' ? p.dispatch : {};
  const dispatch_id = String(dispatch.dispatch_id || '');
  const objective = String(dispatch.objective || '').trim();

  const run_id = `run_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const graph = buildPacketGraphFromDispatch(dispatch, null);
  const status = /** @type {RunStatus} */ (
    deriveRunTerminalStatus(graph.packet_state_map, graph.required_packet_ids)
  );
  const stage = /** @type {RunStage} */ (deriveRunStage(status, false));
  const packets = Array.isArray(dispatch.packets) ? dispatch.packets : [];
  const packet_ids = packets.map((x) => String(x?.packet_id || '').trim()).filter(Boolean);
  const handoff_order = Array.isArray(dispatch.handoff_order) ? dispatch.handoff_order.map(String) : [];

  const now = new Date().toISOString();
  const runUuid = crypto.randomUUID();
  /** @type {Record<string, unknown>} */
  const row = {
    id: runUuid,
    run_id,
    external_run_id: run_id,
    thread_key: threadKey,
    objective,
    founder_request_summary: String(p.founder_request_summary || '').slice(0, 500),
    dispatch_id,
    status,
    stage,
    created_at: now,
    updated_at: now,
    completed_at: status === 'completed' ? now : null,
    current_packet_id: graph.current_packet_id,
    next_packet_id: graph.next_packet_id,
    starter_kickoff: null,
    packet_ids,
    packet_state_map: graph.packet_state_map,
    required_packet_ids: graph.required_packet_ids,
    terminal_packet_ids: graph.terminal_packet_ids,
    harness_snapshot: {
      packets: Array.isArray(dispatch.packets) ? dispatch.packets : [],
      handoff_order,
    },
    dispatch_payload: dispatch,
    handoff_order,
    founder_notified_started_at: null,
    founder_notified_review_required_at: null,
    founder_notified_blocked_at: null,
    founder_notified_completed_at: null,
    founder_notified_failed_at: null,
    last_founder_update_sha: crypto.createHash('sha256').update(`${run_id}:${now}`).digest('hex'),
    last_progressed_at: now,
    last_auto_invocation_sha: null,
    cursor_external_terminal_by_packet: {},
    pending_supervisor_wake: false,
    last_supervisor_wake_request_at: null,
  };

  const mode = storeMode();
  let out = null;

  if (mode === 'memory') {
    const clone = structuredClone(row);
    memRunsById.set(String(row.id), clone);
    memRuns.set(threadKey, clone);
    out = memRuns.get(threadKey);
  } else if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    await supabaseCancelActiveRuns(sb, threadKey);
    const inserted = await supabaseInsertRun(sb, row);
    if (!inserted?.id) return null;
    out = inserted;
  } else {
    const dir = runsDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.mkdir(runsByIdDir(), { recursive: true });
    await fs.writeFile(path.join(runsByIdDir(), `${runUuid}.json`), JSON.stringify(row, null, 0), 'utf8');
    await fs.writeFile(path.join(dir, safeName(threadKey)), JSON.stringify(row, null, 0), 'utf8');
    out = row;
  }

  return out;
}

/**
 * Shell row에 starter kickoff + packet graph 반영 후 supervisor wake.
 * @param {{
 *   runId: string,
 *   threadKey: string,
 *   dispatch: Record<string, unknown>,
 *   starter_kickoff: Record<string, unknown> | null,
 *   founder_request_summary?: string,
 * }} p
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function finalizeRunAfterStarterKickoff(p) {
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '');
  if (!runId || !threadKey) return null;

  const existing = await getRunById(runId);
  if (!existing || String(existing.thread_key || '') !== threadKey) return null;

  const dispatch = p.dispatch && typeof p.dispatch === 'object' ? p.dispatch : {};
  const dispatch_id = String(dispatch.dispatch_id || '');
  const kick = p.starter_kickoff && typeof p.starter_kickoff === 'object' ? p.starter_kickoff : null;

  const graph = buildPacketGraphFromDispatch(dispatch, kick);
  const status = /** @type {RunStatus} */ (
    deriveRunTerminalStatus(graph.packet_state_map, graph.required_packet_ids)
  );
  const stage = /** @type {RunStage} */ (deriveRunStage(status, Boolean(kick && kick.executed)));
  const packets = Array.isArray(dispatch.packets) ? dispatch.packets : [];
  const packet_ids = packets.map((x) => String(x?.packet_id || '').trim()).filter(Boolean);
  const handoff_order = Array.isArray(dispatch.handoff_order) ? dispatch.handoff_order.map(String) : [];
  const now = new Date().toISOString();
  const run_id = String(existing.run_id || existing.external_run_id || '');
  const prevHarness =
    existing.harness_snapshot && typeof existing.harness_snapshot === 'object'
      ? { .../** @type {Record<string, unknown>} */ (existing.harness_snapshot) }
      : {};

  const patch = {
    founder_request_summary: String(p.founder_request_summary ?? existing.founder_request_summary ?? '').slice(
      0,
      500,
    ),
    starter_kickoff: kick,
    packet_ids,
    packet_state_map: graph.packet_state_map,
    required_packet_ids: graph.required_packet_ids,
    terminal_packet_ids: graph.terminal_packet_ids,
    current_packet_id: graph.current_packet_id,
    next_packet_id: graph.next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : null,
    harness_snapshot: {
      ...prevHarness,
      packets: Array.isArray(dispatch.packets) ? dispatch.packets : [],
      handoff_order,
    },
    dispatch_payload: dispatch,
    handoff_order,
    last_founder_update_sha: crypto.createHash('sha256').update(`${run_id}:${now}`).digest('hex'),
    last_progressed_at: now,
    updated_at: now,
  };

  await patchRunById(runId, patch);

  const mode = storeMode();
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (sb) {
      await supabaseAppendRunEvent(sb, runId, 'run_persisted', {
        thread_key: threadKey,
        dispatch_id,
        status,
      });
    }
  }

  await signalSupervisorWakeForRun(threadKey, runId);
  return getRunById(runId);
}

/**
 * @param {{
 *   threadKey: string,
 *   dispatch: Record<string, unknown>,
 *   starter_kickoff: Record<string, unknown> | null,
 *   founder_request_summary?: string,
 * }} p
 */
export async function persistRunAfterDelegate(p) {
  const shell = await persistAcceptedRunShell({
    threadKey: p.threadKey,
    dispatch: p.dispatch,
    founder_request_summary: p.founder_request_summary,
  });
  if (!shell?.id) return null;
  return finalizeRunAfterStarterKickoff({
    runId: String(shell.id),
    threadKey: String(p.threadKey || ''),
    dispatch: p.dispatch && typeof p.dispatch === 'object' ? p.dispatch : {},
    starter_kickoff: p.starter_kickoff && typeof p.starter_kickoff === 'object' ? p.starter_kickoff : null,
    founder_request_summary: p.founder_request_summary,
  });
}

/**
 * Clears durable wake hint after an attempted run-scoped supervisor tick.
 * @param {string} runId
 */
export async function clearPendingSupervisorWake(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return;
  await patchRunById(rid, { pending_supervisor_wake: false });
}

/**
 * Marks run for periodic backstop and notifies direct listener (best-effort).
 * @param {string} threadKey
 * @param {string} runId
 */
export async function signalSupervisorWakeForRun(threadKey, runId) {
  const tk = String(threadKey || '').trim();
  const rid = String(runId || '').trim();
  if (!tk || !rid) return;
  await patchRunById(rid, {
    pending_supervisor_wake: true,
    last_supervisor_wake_request_at: new Date().toISOString(),
  });
  notifyRunStateChangedForRun(tk, rid);
}

/**
 * @param {unknown} status
 */
export function isRunStatusNonTerminal(status) {
  const s = String(status || '');
  return s !== 'completed' && s !== 'failed' && s !== 'canceled';
}

/**
 * @param {{ limit?: number, updatedSince?: string | null }} [opts]
 * @returns {Promise<string[]>}
 */
export async function listNonTerminalRunIds(opts) {
  const limit = opts?.limit != null ? Number(opts.limit) : 80;
  const updatedSince = opts?.updatedSince != null ? String(opts.updatedSince).trim() : '';
  const mode = storeMode();

  if (mode === 'memory') {
    const rows = [...memRunsById.values()].filter((r) => isRunStatusNonTerminal(r.status));
    rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
    let filtered = rows;
    if (updatedSince) {
      filtered = rows.filter((r) => String(r.updated_at || '') >= updatedSince);
    }
    return filtered.slice(0, limit).map((r) => String(r.id || '').trim()).filter(Boolean);
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return [];
    return supabaseListNonTerminalRunIds(sb, limit, updatedSince || null);
  }

  const dir = runsByIdDir();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, n), 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && isRunStatusNonTerminal(j.status)) rows.push(j);
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  let filtered = rows;
  if (updatedSince) {
    filtered = rows.filter((r) => String(r.updated_at || '') >= updatedSince);
  }
  return filtered.slice(0, limit).map((r) => String(r.id || '').trim()).filter(Boolean);
}

/**
 * @param {number} [limit]
 * @returns {Promise<string[]>}
 */
export async function listPendingSupervisorWakeRunIds(limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const mode = storeMode();

  if (mode === 'memory') {
    const rows = [...memRunsById.values()].filter((r) => r.pending_supervisor_wake === true);
    rows.sort((a, b) => String(b.last_supervisor_wake_request_at || '').localeCompare(String(a.last_supervisor_wake_request_at || '')));
    return rows.slice(0, lim).map((r) => String(r.id || '').trim()).filter(Boolean);
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return [];
    return supabaseListPendingSupervisorWakeRunIds(sb, lim);
  }

  const dir = runsByIdDir();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, n), 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && j.pending_supervisor_wake === true) rows.push(j);
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => String(b.last_supervisor_wake_request_at || '').localeCompare(String(a.last_supervisor_wake_request_at || '')));
  return rows.slice(0, lim).map((r) => String(r.id || '').trim()).filter(Boolean);
}

function runRowPendingRecoveryEnvelope(r) {
  const e = r?.recovery_envelope_pending;
  return Boolean(e && typeof e === 'object' && String(e.recovery_status || '') === 'pending_callback');
}

/**
 * Run rows with recovery_envelope_pending.recovery_status === pending_callback (memory | file scan | Supabase).
 * @param {number} [limit]
 * @returns {Promise<Record<string, unknown>[]>}
 */
export async function listRunsWithPendingRecoveryEnvelope(limit = 200) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const mode = storeMode();

  if (mode === 'memory') {
    return [...memRunsById.values()].filter(runRowPendingRecoveryEnvelope).slice(0, lim).map((r) => structuredClone(r));
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return [];
    const rows = await supabaseListRunsWithRecoveryEnvelopePending(sb, lim * 3);
    return rows.filter(runRowPendingRecoveryEnvelope).slice(0, lim);
  }

  const dir = runsByIdDir();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  /** @type {Record<string, unknown>[]} */
  const rows = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    try {
      const raw = await fs.readFile(path.join(dir, n), 'utf8');
      const j = JSON.parse(raw);
      if (j && typeof j === 'object' && runRowPendingRecoveryEnvelope(j)) rows.push(j);
    } catch {
      /* skip */
    }
  }
  rows.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return rows.slice(0, lim).map((r) => structuredClone(r));
}

/**
 * @param {string} threadKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getActiveRunForThread(threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return null;
  const mode = storeMode();

  if (mode === 'memory') {
    const r = memRuns.get(tk);
    return r ? structuredClone(r) : null;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    const raw = await supabaseSelectLatestRun(sb, tk);
    return dbRowToAppRun(raw);
  }

  const fp = path.join(runsDir(), safeName(tk));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && j.founder_notified_review_at && !j.founder_notified_review_required_at) {
      j.founder_notified_review_required_at = j.founder_notified_review_at;
    }
    return j;
  } catch {
    return null;
  }
}

/**
 * @param {string} threadKey
 * @param {Record<string, unknown>} patch
 */
export async function patchRun(threadKey, patch) {
  const tk = String(threadKey || '');
  if (!tk) return null;
  const normalized = normalizePatch(patch);
  const mode = storeMode();

  if (mode === 'memory') {
    const cur = memRuns.get(tk);
    if (!cur) return null;
    const next = { ...cur, ...normalized, updated_at: new Date().toISOString() };
    memRuns.set(tk, next);
    if (cur.id != null) memRunsById.set(String(cur.id), structuredClone(next));
    return structuredClone(next);
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    return supabasePatchLatestRun(sb, tk, normalized);
  }

  const cur = await getActiveRunForThread(tk);
  if (!cur) return null;
  const next = { ...cur, ...normalized, updated_at: new Date().toISOString() };
  const fp = path.join(runsDir(), safeName(tk));
  await fs.writeFile(fp, JSON.stringify(next, null, 0), 'utf8');
  if (next.id != null) {
    await fs.mkdir(runsByIdDir(), { recursive: true });
    await fs.writeFile(path.join(runsByIdDir(), `${String(next.id)}.json`), JSON.stringify(next, null, 0), 'utf8');
  }
  return next;
}

/**
 * @param {string} runId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getRunById(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  const mode = storeMode();
  if (mode === 'memory') {
    const r = memRunsById.get(rid);
    return r ? structuredClone(r) : null;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    const raw = await supabaseSelectRunById(sb, rid);
    return dbRowToAppRun(raw);
  }
  const disk = await readRunFromDiskById(rid);
  return disk;
}

/**
 * @param {string} runId
 * @param {Record<string, unknown>} patch
 */
export async function patchRunById(runId, patch) {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  const normalized = normalizePatch(patch);
  const mode = storeMode();

  if (mode === 'memory') {
    const cur = memRunsById.get(rid);
    if (!cur) return null;
    const next = { ...cur, ...normalized, updated_at: new Date().toISOString() };
    memRunsById.set(rid, next);
    const tk = String(cur.thread_key || '');
    if (tk && String(memRuns.get(tk)?.id) === rid) {
      memRuns.set(tk, structuredClone(next));
    }
    return structuredClone(next);
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    return supabasePatchRunById(sb, rid, normalized);
  }

  const cur = await readRunFromDiskById(rid);
  if (!cur) return null;
  const tk = String(cur.thread_key || '');
  const next = { ...cur, ...normalized, updated_at: new Date().toISOString() };
  await fs.mkdir(runsByIdDir(), { recursive: true });
  await fs.writeFile(path.join(runsByIdDir(), `${rid}.json`), JSON.stringify(next, null, 0), 'utf8');
  const latest = await getActiveRunForThread(tk);
  if (latest && String(latest.id) === rid) {
    await fs.writeFile(path.join(runsDir(), safeName(tk)), JSON.stringify(next, null, 0), 'utf8');
  }
  return next;
}

/**
 * @param {CallbackMilestone} milestone
 */
export function milestoneField(milestone) {
  switch (milestone) {
    case 'started':
      return 'founder_notified_started_at';
    case 'review_required':
      return 'founder_notified_review_required_at';
    case 'blocked':
      return 'founder_notified_blocked_at';
    case 'completed':
      return 'founder_notified_completed_at';
    case 'failed':
      return 'founder_notified_failed_at';
    default:
      return null;
  }
}

/**
 * @returns {Promise<string[]>}
 */
export async function listRunThreadKeys() {
  const mode = storeMode();
  if (mode === 'memory') return [...memRuns.keys()];
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return [];
    return supabaseListThreadKeys(sb);
  }

  const dir = runsDir();
  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out = [];
  for (const n of names) {
    if (!n.endsWith('.json')) continue;
    const b = n.slice(0, -5);
    try {
      out.push(Buffer.from(b, 'base64url').toString('utf8'));
    } catch {
      /* skip */
    }
  }
  return out;
}
