/**
 * vNext.13.29b — execution run lifecycle (persisted, idempotent callbacks).
 *
 * Run status / stage enums (product contract):
 * - status: queued | running | review_required | blocked | completed | failed | canceled
 * - stage: delegated | starter_kickoff | executing | reviewing | finalizing
 *
 * Callback milestones: started | review_required | blocked | completed | failed
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { cosRuntimeBaseDir } from './executionLedger.js';

/** @typedef {'queued'|'running'|'review_required'|'blocked'|'completed'|'failed'|'canceled'} RunStatus */
/** @typedef {'delegated'|'starter_kickoff'|'executing'|'reviewing'|'finalizing'} RunStage */
/** @typedef {'started'|'review_required'|'blocked'|'completed'|'failed'} CallbackMilestone */

function runsDir() {
  return path.join(cosRuntimeBaseDir(), 'execution_runs');
}

/** @param {string} threadKey */
function safeName(threadKey) {
  return `${Buffer.from(String(threadKey), 'utf8').toString('base64url')}.json`;
}

/**
 * @param {object} kick
 * @returns {RunStatus}
 */
export function deriveRunStatusFromKickoff(kick) {
  if (!kick || !kick.executed) return 'queued';
  const oc = kick.outcome && typeof kick.outcome === 'object' ? kick.outcome : {};
  const st = String(oc.status || '');
  if (st === 'blocked') return 'blocked';
  if (oc.blocked === true || oc.reason === 'unsupported_tool' || oc.reason === 'unsupported_action') return 'blocked';
  if (st === 'failed') return 'failed';
  if (oc.needs_review === true && st === 'degraded') return 'review_required';
  if (st === 'completed') return 'completed';
  return 'running';
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
  const threadKey = String(p.threadKey || '');
  if (!threadKey) return null;

  const dispatch = p.dispatch && typeof p.dispatch === 'object' ? p.dispatch : {};
  const dispatch_id = String(dispatch.dispatch_id || '');
  const objective = String(dispatch.objective || '').trim();
  const kick = p.starter_kickoff && typeof p.starter_kickoff === 'object' ? p.starter_kickoff : null;

  const run_id = `run_${Date.now()}_${crypto.randomBytes(5).toString('hex')}`;
  const status = /** @type {RunStatus} */ (deriveRunStatusFromKickoff(kick));
  const stage =
    kick && kick.executed
      ? /** @type {RunStage} */ ('starter_kickoff')
      : /** @type {RunStage} */ ('delegated');

  const packets = Array.isArray(dispatch.packets) ? dispatch.packets : [];
  const packet_ids = packets.map((x) => String(x?.packet_id || '').trim()).filter(Boolean);

  const now = new Date().toISOString();
  /** @type {Record<string, unknown>} */
  const row = {
    run_id,
    thread_key: threadKey,
    objective,
    founder_request_summary: String(p.founder_request_summary || '').slice(0, 500),
    dispatch_id,
    status,
    stage,
    created_at: now,
    updated_at: now,
    completed_at: status === 'completed' ? now : null,
    current_packet_id: kick && kick.packet_id ? String(kick.packet_id) : null,
    next_packet_id: null,
    starter_kickoff: kick,
    packet_ids,
    founder_notified_started_at: null,
    founder_notified_review_at: null,
    founder_notified_blocked_at: null,
    founder_notified_completed_at: null,
    founder_notified_failed_at: null,
    last_founder_update_sha: crypto.createHash('sha256').update(`${run_id}:${now}`).digest('hex'),
  };

  const dir = runsDir();
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, safeName(threadKey)), JSON.stringify(row, null, 0), 'utf8');
  return row;
}

/**
 * @param {string} threadKey
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function getActiveRunForThread(threadKey) {
  const fp = path.join(runsDir(), safeName(threadKey));
  try {
    const raw = await fs.readFile(fp, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/**
 * @param {string} threadKey
 * @param {Record<string, unknown>} patch
 */
export async function patchRun(threadKey, patch) {
  const cur = await getActiveRunForThread(threadKey);
  if (!cur) return null;
  const next = { ...cur, ...patch, updated_at: new Date().toISOString() };
  await fs.writeFile(path.join(runsDir(), safeName(threadKey)), JSON.stringify(next, null, 0), 'utf8');
  return next;
}

/**
 * @param {Record<string, unknown>} run
 * @param {CallbackMilestone} milestone
 * @param {string} iso
 */
export function milestoneField(milestone) {
  switch (milestone) {
    case 'started':
      return 'founder_notified_started_at';
    case 'review_required':
      return 'founder_notified_review_at';
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
 * @returns {Promise<string[]>} threadKey 목록
 */
export async function listRunThreadKeys() {
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
      const threadKey = Buffer.from(b, 'base64url').toString('utf8');
      out.push(threadKey);
    } catch {
      /* skip */
    }
  }
  return out;
}
