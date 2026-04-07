/**
 * Packet graph progressor — ledger reconcile + auto-advance (linear + minimal depends_on).
 */

import crypto from 'node:crypto';
import { readRecentExecutionArtifacts } from './executionLedger.js';
import {
  getActiveRunForThread,
  getRunById,
  patchRun,
  patchRunById,
  deriveRunTerminalStatus,
  deriveRunStage,
} from './executionRunStore.js';
import { derivePacketStateFromOutcome, executePacketInvocation } from './starterLadder.js';
import { notifyRunStateChangedForRun } from './supervisorDirectTrigger.js';

/**
 * @param {Record<string, unknown>} run
 * @returns {Record<string, object>}
 */
export function buildPacketsById(run) {
  const snap = run.harness_snapshot && typeof run.harness_snapshot === 'object' ? run.harness_snapshot : {};
  const packets = Array.isArray(snap.packets) ? snap.packets : [];
  /** @type {Record<string, object>} */
  const m = {};
  for (const p of packets) {
    if (p && typeof p === 'object' && p.packet_id != null) m[String(p.packet_id)] = p;
  }
  return m;
}

/**
 * @param {Record<string, string>} packet_state_map
 * @param {string} depId
 */
function depTerminalCompleted(packet_state_map, depId) {
  const st = String(packet_state_map[depId] || 'queued');
  return st === 'completed' || st === 'skipped';
}

/**
 * Next packet that may be auto-invoked: queued/ready state, harness packet_status ready|queued, deps satisfied.
 * @param {string[]} required
 * @param {Record<string, string>} packet_state_map
 * @param {Record<string, object>} packetsById
 */
export function findNextRunnablePacket(required, packet_state_map, packetsById) {
  const byId = packetsById && typeof packetsById === 'object' ? packetsById : {};
  for (const id of required || []) {
    const sid = String(id);
    const st = String(packet_state_map[sid] || 'queued');
    if (st !== 'queued' && st !== 'ready') continue;
    const pkt = byId[sid];
    if (!pkt || typeof pkt !== 'object') continue;
    if (String(pkt.packet_status || '') === 'draft') continue;
    const pstat = String(pkt.packet_status || 'ready');
    if (pstat !== 'ready' && pstat !== 'queued') continue;
    const deps = Array.isArray(pkt.depends_on) ? pkt.depends_on.map(String) : [];
    if (!deps.every((d) => depTerminalCompleted(packet_state_map, d))) continue;
    return sid;
  }
  return null;
}

/**
 * @param {string[]} required
 * @param {Record<string, string>} packet_state_map
 * @param {Record<string, object>} [packetsById]
 */
export function recomputeCurrentNext(required, packet_state_map, packetsById) {
  const req = Array.isArray(required) ? required.map(String) : [];
  const byId = packetsById && typeof packetsById === 'object' ? packetsById : {};
  let current_packet_id = null;
  let next_packet_id = null;

  for (let i = 0; i < req.length; i += 1) {
    const id = req[i];
    const st = packet_state_map[id] || 'queued';
    if (st === 'completed' || st === 'skipped') continue;
    current_packet_id = id;
    for (let j = i + 1; j < req.length; j += 1) {
      const jd = req[j];
      const runN = findNextRunnablePacket([jd], packet_state_map, byId);
      if (runN === jd) {
        next_packet_id = jd;
        break;
      }
    }
    break;
  }
  if (!current_packet_id && req.length) {
    current_packet_id = req[req.length - 1];
    next_packet_id = null;
  }
  return { current_packet_id, next_packet_id };
}

/**
 * @param {Record<string, unknown>} run
 * @param {string} packetId
 */
function findPacketDef(run, packetId) {
  const snap = run.harness_snapshot && typeof run.harness_snapshot === 'object' ? run.harness_snapshot : {};
  const packets = Array.isArray(snap.packets) ? snap.packets : [];
  return packets.find((p) => p && String(p.packet_id) === String(packetId)) || null;
}

/**
 * @param {string} runId
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function reconcileRunFromLedgerForRun(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  let run = await getRunById(rid);
  if (!run) return null;
  const tk = String(run.thread_key || '');
  if (!tk) return null;

  const artifacts = await readRecentExecutionArtifacts(tk, 400);
  const toolResults = artifacts.filter((a) => a.type === 'tool_result');
  toolResults.sort((a, b) => String(a.ts || '').localeCompare(String(b.ts || '')));

  /** @type {Record<string, Record<string, unknown>>} */
  const latestByPacket = {};
  for (const row of toolResults) {
    const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const pid = pl.run_packet_id != null ? String(pl.run_packet_id).trim() : '';
    if (pid) latestByPacket[pid] = pl;
  }

  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const packet_state_map = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
  };

  for (const [pid, pl] of Object.entries(latestByPacket)) {
    if (!required.includes(pid)) continue;
    const existing = String(packet_state_map[pid] || 'queued');
    if (existing === 'completed' || existing === 'failed' || existing === 'skipped') continue;
    packet_state_map[pid] = derivePacketStateFromOutcome(pl);
  }

  const terminal_packet_ids = required.filter((id) => {
    const st = packet_state_map[id];
    return st === 'completed' || st === 'skipped' || st === 'failed';
  });

  const packetsById = buildPacketsById(run);
  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, packet_state_map, packetsById);
  const status = deriveRunTerminalStatus(packet_state_map, required);
  const stage = deriveRunStage(status, Boolean(run.starter_kickoff && run.starter_kickoff.executed));
  const now = new Date().toISOString();
  const newCompleted = status === 'completed' ? now : null;

  const prevPsm = JSON.stringify(run.packet_state_map || {});
  const newPsm = JSON.stringify(packet_state_map);
  const changed =
    prevPsm !== newPsm ||
    String(run.status || '') !== String(status) ||
    String(run.current_packet_id || '') !== String(current_packet_id || '') ||
    String(run.next_packet_id || '') !== String(next_packet_id || '') ||
    String(run.stage || '') !== String(stage) ||
    String(run.completed_at || '') !== String(newCompleted || '');

  if (changed) {
    await patchRunById(rid, {
      packet_state_map,
      terminal_packet_ids,
      current_packet_id,
      next_packet_id,
      status,
      stage,
      completed_at: newCompleted,
      last_progressed_at: now,
    });
    notifyRunStateChangedForRun(tk, rid);
  }

  return getRunById(rid);
}

/**
 * Active run for thread only — use {@link reconcileRunFromLedgerForRun} for a specific historical run.
 * @param {string} threadKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function reconcileRunFromLedger(threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return null;
  const active = await getActiveRunForThread(tk);
  if (!active?.id) return null;
  return reconcileRunFromLedgerForRun(String(active.id));
}

/**
 * @param {string} runId
 * @returns {Promise<{ advanced: boolean, target?: string, reason?: string }>}
 */
export async function maybeAdvanceNextPacketForRun(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return { advanced: false, reason: 'no_run_id' };

  let run = await getRunById(rid);
  if (!run) return { advanced: false, reason: 'no_run' };
  const tk = String(run.thread_key || '');
  if (!tk) return { advanced: false, reason: 'no_thread' };

  const status = String(run.status || '');
  if (status === 'blocked' || status === 'failed' || status === 'review_required') {
    return { advanced: false, reason: 'run_hold' };
  }

  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const packet_state_map = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
  };

  const packetsById = buildPacketsById(run);
  const target = findNextRunnablePacket(required, packet_state_map, packetsById);
  if (!target) return { advanced: false, reason: 'no_next_runnable' };

  const lastSha = run.last_auto_invocation_sha ? String(run.last_auto_invocation_sha) : '';
  const fp = crypto.createHash('sha256').update(`${rid}|${target}|auto_invoke`).digest('hex');
  const curSt = String(packet_state_map[target] || '');
  if (lastSha === fp && curSt !== 'queued' && curSt !== 'ready') {
    return { advanced: false, reason: 'duplicate_fingerprint' };
  }

  const pkt = findPacketDef(run, target);
  if (!pkt) return { advanced: false, reason: 'no_packet_def' };

  packet_state_map[target] = 'running';
  await patchRunById(rid, {
    packet_state_map,
    last_progressed_at: new Date().toISOString(),
  });

  const outcome = await executePacketInvocation(pkt, { threadKey: tk });
  packet_state_map[target] = derivePacketStateFromOutcome(
    outcome && typeof outcome === 'object' ? outcome : {},
  );

  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, packet_state_map, packetsById);
  const nextStatus = deriveRunTerminalStatus(packet_state_map, required);
  const stage = deriveRunStage(
    nextStatus,
    Boolean(run.starter_kickoff && run.starter_kickoff.executed),
  );
  const now = new Date().toISOString();

  await patchRunById(rid, {
    packet_state_map,
    current_packet_id,
    next_packet_id,
    status: nextStatus,
    stage,
    completed_at: nextStatus === 'completed' ? now : null,
    terminal_packet_ids: required.filter((id) => {
      const st = packet_state_map[id];
      return st === 'completed' || st === 'skipped' || st === 'failed';
    }),
    last_auto_invocation_sha: fp,
    last_progressed_at: now,
  });
  notifyRunStateChangedForRun(tk, rid);

  return { advanced: true, target };
}

/**
 * Active run for thread only — use {@link maybeAdvanceNextPacketForRun} for a specific run uuid.
 * @param {string} threadKey
 * @returns {Promise<{ advanced: boolean, target?: string, reason?: string }>}
 */
export async function maybeAdvanceNextPacket(threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return { advanced: false, reason: 'no_thread' };
  const active = await getActiveRunForThread(tk);
  if (!active?.id) return { advanced: false, reason: 'no_run' };
  return maybeAdvanceNextPacketForRun(String(active.id));
}
