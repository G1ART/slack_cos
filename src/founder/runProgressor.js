/**
 * Packet graph progressor — ledger reconcile + linear auto-advance.
 */

import crypto from 'node:crypto';
import { readRecentExecutionArtifacts } from './executionLedger.js';
import {
  getActiveRunForThread,
  patchRun,
  deriveRunTerminalStatus,
  deriveRunStage,
} from './executionRunStore.js';
import { derivePacketStateFromOutcome, executePacketInvocation } from './starterLadder.js';

/**
 * @param {string[]} required
 * @param {Record<string, string>} packet_state_map
 */
export function recomputeCurrentNext(required, packet_state_map) {
  let current_packet_id = null;
  let next_packet_id = null;
  const req = Array.isArray(required) ? required.map(String) : [];
  for (let i = 0; i < req.length; i += 1) {
    const id = req[i];
    const st = packet_state_map[id] || 'queued';
    if (st === 'completed' || st === 'skipped') continue;
    current_packet_id = id;
    for (let j = i + 1; j < req.length; j += 1) {
      const jd = req[j];
      const stj = packet_state_map[jd] || 'queued';
      if (stj === 'queued' || stj === 'ready') {
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
 * @param {string[]} required
 * @param {Record<string, string>} packet_state_map
 */
export function findNextQueuedPacket(required, packet_state_map) {
  for (const id of required || []) {
    const st = packet_state_map[id] || 'queued';
    if (st === 'queued' || st === 'ready') return String(id);
  }
  return null;
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
 * @param {string} threadKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function reconcileRunFromLedger(threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return null;
  let run = await getActiveRunForThread(tk);
  if (!run) return null;

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
    packet_state_map[pid] = derivePacketStateFromOutcome(pl);
  }

  const terminal_packet_ids = required.filter((id) => {
    const st = packet_state_map[id];
    return st === 'completed' || st === 'skipped' || st === 'failed';
  });

  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, packet_state_map);
  const status = deriveRunTerminalStatus(packet_state_map, required);
  const stage = deriveRunStage(status, Boolean(run.starter_kickoff && run.starter_kickoff.executed));
  const now = new Date().toISOString();

  await patchRun(tk, {
    packet_state_map,
    terminal_packet_ids,
    current_packet_id,
    next_packet_id,
    status,
    stage,
    completed_at: status === 'completed' ? now : run.completed_at ?? null,
    last_progressed_at: now,
  });

  return getActiveRunForThread(tk);
}

/**
 * @param {string} threadKey
 * @returns {Promise<{ advanced: boolean, target?: string, reason?: string }>}
 */
export async function maybeAdvanceNextPacket(threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return { advanced: false, reason: 'no_thread' };

  let run = await getActiveRunForThread(tk);
  if (!run) return { advanced: false, reason: 'no_run' };

  const status = String(run.status || '');
  if (status === 'blocked' || status === 'failed' || status === 'review_required') {
    return { advanced: false, reason: 'run_hold' };
  }

  const required = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  const packet_state_map = {
    ...(run.packet_state_map && typeof run.packet_state_map === 'object' ? run.packet_state_map : {}),
  };

  const target = findNextQueuedPacket(required, packet_state_map);
  if (!target) return { advanced: false, reason: 'no_next_queued' };

  const lastSha = run.last_auto_invocation_sha ? String(run.last_auto_invocation_sha) : '';
  const fp = crypto.createHash('sha256').update(`${tk}|${target}|auto_invoke`).digest('hex');
  const curSt = String(packet_state_map[target] || '');
  if (lastSha === fp && curSt !== 'queued' && curSt !== 'ready') {
    return { advanced: false, reason: 'duplicate_fingerprint' };
  }

  const pkt = findPacketDef(run, target);
  if (!pkt) return { advanced: false, reason: 'no_packet_def' };

  packet_state_map[target] = 'running';
  await patchRun(tk, {
    packet_state_map,
    last_progressed_at: new Date().toISOString(),
  });

  const outcome = await executePacketInvocation(pkt, { threadKey: tk });
  packet_state_map[target] = derivePacketStateFromOutcome(
    outcome && typeof outcome === 'object' ? outcome : {},
  );

  const { current_packet_id, next_packet_id } = recomputeCurrentNext(required, packet_state_map);
  const nextStatus = deriveRunTerminalStatus(packet_state_map, required);
  const stage = deriveRunStage(
    nextStatus,
    Boolean(run.starter_kickoff && run.starter_kickoff.executed),
  );
  const now = new Date().toISOString();

  await patchRun(tk, {
    packet_state_map,
    current_packet_id,
    next_packet_id,
    status: nextStatus,
    stage,
    completed_at: nextStatus === 'completed' ? now : run.completed_at ?? null,
    terminal_packet_ids: required.filter((id) => {
      const st = packet_state_map[id];
      return st === 'completed' || st === 'skipped' || st === 'failed';
    }),
    last_auto_invocation_sha: fp,
    last_progressed_at: now,
  });

  return { advanced: true, target };
}
