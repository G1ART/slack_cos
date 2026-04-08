/**
 * Run supervisor: reconcile → advance packets → milestone Slack callbacks.
 */

import crypto from 'node:crypto';
import { readReviewQueueForRun, readExecutionSummaryForRun } from './executionLedger.js';
import {
  clearPendingSupervisorWake,
  getActiveRunForThread,
  getRunById,
  listNonTerminalRunIds,
  listPendingSupervisorWakeRunIds,
  listRunThreadKeys,
  patchRunById,
} from './executionRunStore.js';
import {
  reconcileRunFromLedger,
  reconcileRunFromLedgerForRun,
  maybeAdvanceNextPacket,
  maybeAdvanceNextPacketForRun,
} from './runProgressor.js';
import { getSlackRouting } from './slackRoutingStore.js';
import { sendFounderResponse } from './sendFounderResponse.js';
import { tryAcquireSupervisorLease } from './supervisorLease.js';
import {
  renderStartedMilestone,
  renderReviewMilestone,
  renderBlockedMilestone,
  renderCompletedMilestone,
  renderFailedMilestone,
  renderEagerCombinedMilestone,
} from './founderCallbackCopy.js';

const OWNER_ID = `${process.env.RAILWAY_REPLICA_ID || process.env.HOSTNAME || 'local'}:${process.pid}:${crypto.randomBytes(3).toString('hex')}`;

/** @type {Set<string>} */
const tickInflight = new Set();

/**
 * @param {{ run: Record<string, unknown>, client: import('@slack/web-api').WebClient, constitutionSha256: string }} p
 * @returns {Promise<string | null>}
 */
export async function processRunMilestones(p) {
  const run = p.run;
  if (!run || run.id == null || !String(run.id).trim()) return null;
  const threadKey = String(run.thread_key || '');
  const runIdStr = String(run.id).trim();
  const routing = await getSlackRouting(threadKey);
  if (!routing) return null;

  const recordOpsSmokeMilestone = async (milestone) => {
    try {
      const { recordOpsSmokeFounderMilestone } = await import('./smokeOps.js');
      await recordOpsSmokeFounderMilestone({ runId: runIdStr, threadKey, milestone });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
  };

  const objective = String(run.objective || '');
  const kick = run.starter_kickoff && typeof run.starter_kickoff === 'object' ? run.starter_kickoff : null;
  const status = String(run.status || '');
  const now = new Date().toISOString();

  if (kick && kick.executed && !run.founder_notified_started_at) {
    if (status === 'completed' || status === 'blocked' || status === 'failed' || status === 'review_required') {
      let text = '';
      if (status === 'completed') {
        const lines = await readExecutionSummaryForRun(run, 4);
        text = renderEagerCombinedMilestone({
          objective,
          tool: String(kick.tool || ''),
          action: String(kick.action || ''),
          terminal: 'completed',
          summary_lines: lines,
        });
      } else if (status === 'blocked') {
        const rq = await readReviewQueueForRun(run, 3);
        const need =
          rq.map((x) => x.next_required_input).find(Boolean) ||
          rq.map((x) => x.blocked_reason).find(Boolean) ||
          '';
        text = renderEagerCombinedMilestone({
          objective,
          tool: String(kick.tool || ''),
          action: String(kick.action || ''),
          terminal: 'blocked',
          need_line: String(need || ''),
        });
      } else if (status === 'review_required') {
        const review = await readReviewQueueForRun(run, 5);
        const lines = review
          .filter((x) => x.needs_review || x.status === 'degraded')
          .map((x) => x.result_summary || x.blocked_reason || '')
          .filter(Boolean);
        text = renderEagerCombinedMilestone({
          objective,
          tool: String(kick.tool || ''),
          action: String(kick.action || ''),
          terminal: 'review_required',
          review_lines: lines,
        });
      } else {
        text = renderEagerCombinedMilestone({
          objective,
          tool: String(kick.tool || ''),
          action: String(kick.action || ''),
          terminal: 'failed',
        });
      }
      const r = await sendFounderResponse({
        client: p.client,
        channel: routing.channel,
        thread_ts: routing.thread_ts || undefined,
        text,
        constitutionSha256: p.constitutionSha256,
      });
      if (r.ok) {
        const patch = { founder_notified_started_at: now };
        if (status === 'completed') patch.founder_notified_completed_at = now;
        if (status === 'blocked') patch.founder_notified_blocked_at = now;
        if (status === 'review_required') patch.founder_notified_review_required_at = now;
        if (status === 'failed') patch.founder_notified_failed_at = now;
        await patchRunById(String(run.id), patch);
        await recordOpsSmokeMilestone('eager_combined');
        return 'eager_combined';
      }
      return null;
    }

    const text = renderStartedMilestone({
      objective,
      tool: String(kick.tool || ''),
      action: String(kick.action || ''),
    });
    const r = await sendFounderResponse({
      client: p.client,
      channel: routing.channel,
      thread_ts: routing.thread_ts || undefined,
      text,
      constitutionSha256: p.constitutionSha256,
    });
    if (r.ok) {
      await patchRunById(String(run.id), { founder_notified_started_at: now });
      await recordOpsSmokeMilestone('started');
      return 'started';
    }
    return null;
  }

  if (status === 'blocked' && !run.founder_notified_blocked_at) {
    const rq = await readReviewQueueForRun(run, 3);
    const need =
      rq.map((x) => x.next_required_input).find(Boolean) ||
      rq.map((x) => x.blocked_reason).find(Boolean) ||
      '';
    const text = renderBlockedMilestone({ objective, need_line: String(need || '') });
    const r = await sendFounderResponse({
      client: p.client,
      channel: routing.channel,
      thread_ts: routing.thread_ts || undefined,
      text,
      constitutionSha256: p.constitutionSha256,
    });
    if (r.ok) {
      await patchRunById(String(run.id), { founder_notified_blocked_at: now });
      await recordOpsSmokeMilestone('blocked');
      return 'blocked';
    }
    return null;
  }

  if (status === 'review_required' && !run.founder_notified_review_required_at) {
    const review = await readReviewQueueForRun(run, 5);
    const lines = review
      .filter((x) => x.needs_review || x.status === 'degraded')
      .map((x) => x.result_summary || x.blocked_reason || '')
      .filter(Boolean);
    if (!lines.length) return null;
    const text = renderReviewMilestone({ objective, lines });
    const r = await sendFounderResponse({
      client: p.client,
      channel: routing.channel,
      thread_ts: routing.thread_ts || undefined,
      text,
      constitutionSha256: p.constitutionSha256,
    });
    if (r.ok) {
      await patchRunById(String(run.id), { founder_notified_review_required_at: now });
      await recordOpsSmokeMilestone('review_required');
      return 'review_required';
    }
    return null;
  }

  if (status === 'completed' && !run.founder_notified_completed_at) {
    const lines = await readExecutionSummaryForRun(run, 5);
    const text = renderCompletedMilestone({ objective, summary_lines: lines });
    const r = await sendFounderResponse({
      client: p.client,
      channel: routing.channel,
      thread_ts: routing.thread_ts || undefined,
      text,
      constitutionSha256: p.constitutionSha256,
    });
    if (r.ok) {
      await patchRunById(String(run.id), { founder_notified_completed_at: now });
      await recordOpsSmokeMilestone('completed');
      return 'completed';
    }
    return null;
  }

  if (status === 'failed' && !run.founder_notified_failed_at) {
    const text = renderFailedMilestone({ objective });
    const r = await sendFounderResponse({
      client: p.client,
      channel: routing.channel,
      thread_ts: routing.thread_ts || undefined,
      text,
      constitutionSha256: p.constitutionSha256,
    });
    if (r.ok) {
      await patchRunById(String(run.id), { founder_notified_failed_at: now });
      await recordOpsSmokeMilestone('failed');
      return 'failed';
    }
  }

  return null;
}

/**
 * @param {string} threadKey
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   constitutionSha256: string,
 *   skipLease?: boolean,
 * }} ctx
 */
export async function tickRunSupervisorForThread(threadKey, ctx) {
  const tk = String(threadKey || '');
  if (!tk || !ctx.client?.chat?.postMessage) return { skipped: true, reason: 'no_client' };

  const inflightKey = `t:${tk}`;
  if (tickInflight.has(inflightKey)) return { skipped: true, reason: 'reentrant' };

  if (!ctx.skipLease) {
    const ok = await tryAcquireSupervisorLease(OWNER_ID);
    if (!ok) return { skipped: true, reason: 'lease_held' };
  }

  tickInflight.add(inflightKey);
  try {
    let run = await getActiveRunForThread(tk);
    if (!run?.run_id) return { skipped: true, reason: 'no_run' };
    if (String(run.status) === 'canceled') return { skipped: true, reason: 'canceled' };

    await reconcileRunFromLedger(tk);

    for (let i = 0; i < 6; i += 1) {
      const adv = await maybeAdvanceNextPacket(tk);
      if (!adv.advanced) break;
    }

    run = await getActiveRunForThread(tk);
    if (run) {
      await processRunMilestones({
        run,
        client: ctx.client,
        constitutionSha256: ctx.constitutionSha256,
      });
    }

    return { skipped: false };
  } finally {
    tickInflight.delete(inflightKey);
  }
}

/**
 * Reconcile / advance / milestones for one durable run uuid (not necessarily the thread's active run).
 * @param {string} runId
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   constitutionSha256: string,
 *   skipLease?: boolean,
 * }} ctx
 */
export async function tickRunSupervisorForRun(runId, ctx) {
  const rid = String(runId || '').trim();
  if (!rid || !ctx.client?.chat?.postMessage) return { skipped: true, reason: 'no_client' };

  const inflightKey = `r:${rid}`;
  if (tickInflight.has(inflightKey)) return { skipped: true, reason: 'reentrant' };

  if (!ctx.skipLease) {
    const ok = await tryAcquireSupervisorLease(OWNER_ID);
    if (!ok) return { skipped: true, reason: 'lease_held' };
  }

  tickInflight.add(inflightKey);
  let attemptedWork = false;
  try {
    let run = await getRunById(rid);
    if (!run?.run_id) return { skipped: true, reason: 'no_run' };
    if (String(run.status) === 'canceled') return { skipped: true, reason: 'canceled' };

    attemptedWork = true;

    try {
      const { maybeRecordOpsSmokeCursorCallbackAbsence } = await import('./smokeOps.js');
      await maybeRecordOpsSmokeCursorCallbackAbsence({
        runId: rid,
        threadKey: String(run.thread_key || ''),
        env: process.env,
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }

    await reconcileRunFromLedgerForRun(rid);

    for (let i = 0; i < 6; i += 1) {
      const adv = await maybeAdvanceNextPacketForRun(rid);
      if (!adv.advanced) break;
    }

    run = await getRunById(rid);
    if (run) {
      await processRunMilestones({
        run,
        client: ctx.client,
        constitutionSha256: ctx.constitutionSha256,
      });
    }

    return { skipped: false };
  } finally {
    tickInflight.delete(inflightKey);
    if (attemptedWork) {
      await clearPendingSupervisorWake(rid).catch((e) => console.error('[cos_clear_wake]', e));
    }
  }
}

/**
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   constitutionSha256: string,
 * }} ctx
 */
export async function tickRunSupervisor(ctx) {
  const ok = await tryAcquireSupervisorLease(OWNER_ID);
  if (!ok) return { skipped: true, reason: 'lease_held' };

  const pending = await listPendingSupervisorWakeRunIds(50);
  const nonTerm = await listNonTerminalRunIds({ limit: 120 });
  const seen = new Set();
  /** @type {string[]} */
  const runOrder = [];
  for (const rid of [...pending, ...nonTerm]) {
    const r = String(rid || '').trim();
    if (!r || seen.has(r)) continue;
    seen.add(r);
    runOrder.push(r);
  }

  for (const rid of runOrder) {
    await tickRunSupervisorForRun(rid, {
      client: ctx.client,
      constitutionSha256: ctx.constitutionSha256,
      skipLease: true,
    });
  }

  const keys = await listRunThreadKeys();
  for (const threadKey of keys) {
    await tickRunSupervisorForThread(threadKey, {
      client: ctx.client,
      constitutionSha256: ctx.constitutionSha256,
      skipLease: true,
    });
  }

  return { skipped: false, processed_runs: runOrder.length, processed_threads: keys.length };
}

/**
 * @param {{
 *   client: import('@slack/web-api').WebClient,
 *   constitutionSha256: string,
 *   intervalMs?: number,
 * }} ctx
 * @returns {() => void} stop
 */
export function startRunSupervisorLoop(ctx) {
  const ms = Number(ctx.intervalMs ?? 45_000);
  const id = setInterval(() => {
    tickRunSupervisor({
      client: ctx.client,
      constitutionSha256: ctx.constitutionSha256,
    }).catch((e) => console.error('[run_supervisor]', e));
  }, ms);
  return () => clearInterval(id);
}
