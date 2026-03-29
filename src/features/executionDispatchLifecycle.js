/**
 * Execution Dispatch Lifecycle — canonical single-entrypoint for auto-dispatch.
 *
 * ALL execution creation paths must call ensureExecutionRunDispatched()
 * instead of directly calling dispatchOutboundActionsForRun().
 */

import {
  getExecutionRunById,
  updateOutboundDispatchState,
  getRunDispatchState,
  updateRunStage,
  updateRunReport,
  updateLaneStatus,
} from './executionRun.js';

import {
  dispatchOutboundActionsForRun,
  retryRunOutbound,
  collectOutboundStatus,
} from './executionOutboundOrchestrator.js';

import {
  ingestCursorResultFromFile,
} from './executionResultIngestion.js';

function logLifecycle(event, fields = {}) {
  try {
    console.info(JSON.stringify({ stage: event, ts: new Date().toISOString(), ...fields }));
  } catch { /* never crash */ }
}

/* ------------------------------------------------------------------ */
/*  Dispatch guard                                                      */
/* ------------------------------------------------------------------ */

export function shouldDispatchRun(run) {
  if (!run) return false;
  const st = run.outbound_dispatch_state;
  return st === 'not_started';
}

/* ------------------------------------------------------------------ */
/*  Canonical entrypoint: call from ALL run creation sites              */
/* ------------------------------------------------------------------ */

/**
 * Idempotent: if already dispatched, returns immediately.
 * Fire-and-forget safe: catches all errors internally.
 */
export function ensureExecutionRunDispatched(run, metadata = {}) {
  if (!run || !run.run_id) return;
  if (!shouldDispatchRun(run)) {
    logLifecycle('dispatch_lifecycle_skip', { run_id: run.run_id, state: run.outbound_dispatch_state });
    return;
  }

  logLifecycle('dispatch_lifecycle_start', { run_id: run.run_id });
  dispatchOutboundActionsForRun(run, metadata)
    .then((results) => {
      logLifecycle('dispatch_lifecycle_done', { run_id: run.run_id, skipped: !!results?.skipped });
    })
    .catch((err) => {
      updateOutboundDispatchState(run.run_id, 'failed', { error: String(err?.message || err).slice(0, 300) });
      logLifecycle('dispatch_lifecycle_error', { run_id: run.run_id, error: String(err?.message || err).slice(0, 200) });
    });
}

/* ------------------------------------------------------------------ */
/*  Lane dependency scheduler                                           */
/* ------------------------------------------------------------------ */

const LANE_DEPS = {
  research_benchmark: [],
  uiux_design: ['research_benchmark'],
  fullstack_swe: ['research_benchmark'],
  qa_qc: ['fullstack_swe'],
};

function isLaneOutboundDone(ws) {
  const st = ws.outbound?.outbound_status;
  return st === 'completed' || st === 'dispatched' || st === 'drafted';
}

export function computeLaneDispatchPlan(run) {
  if (!run) return [];
  const plan = [];
  for (const ws of (run.workstreams || [])) {
    const deps = ws.dependencies?.length ? ws.dependencies : (LANE_DEPS[ws.lane_type] || []);
    const depsResolved = deps.every((dep) => {
      const depWs = (run.workstreams || []).find((w) => w.lane_type === dep);
      return depWs ? isLaneOutboundDone(depWs) : true;
    });
    const ownDone = isLaneOutboundDone(ws);
    plan.push({
      lane_type: ws.lane_type,
      depends_on: deps,
      deps_resolved: depsResolved,
      ready_for_dispatch: depsResolved && !ownDone,
      completed: ws.outbound?.outbound_status === 'completed',
      outbound_status: ws.outbound?.outbound_status || 'pending',
      auto_dispatch: true,
    });
  }
  return plan;
}

export function getDispatchableLanes(run) {
  return computeLaneDispatchPlan(run)
    .filter((p) => p.ready_for_dispatch)
    .map((p) => p.lane_type);
}

export function isLaneCompleted(run, laneType) {
  const ws = (run?.workstreams || []).find((w) => w.lane_type === laneType);
  return ws?.outbound?.outbound_status === 'completed';
}

export function markLaneReady(runId, laneType) {
  return updateLaneStatus(runId, laneType, 'ready');
}

/* ------------------------------------------------------------------ */
/*  Completion detection                                                */
/* ------------------------------------------------------------------ */

const TERMINAL_STATUSES = new Set(['completed', 'dispatched', 'drafted']);
const BLOCKED_STATUSES = new Set(['manual_required', 'blocked']);
const FAILED_STATUSES = new Set(['failed']);

/**
 * @param {string} runId
 * @returns {{ overall_status: string, blocking_lanes: string[], manual_required_lanes: string[], completed_lanes: string[], failed_lanes: string[], next_actions: string[] } | null}
 */
export function evaluateExecutionRunCompletion(runId) {
  const run = getExecutionRunById(runId);
  if (!run) return null;

  const completed = [];
  const blocking = [];
  const manualRequired = [];
  const failed = [];
  const running = [];
  const next = [];

  for (const ws of (run.workstreams || [])) {
    const st = ws.outbound?.outbound_status || 'pending';
    if (st === 'completed') {
      completed.push(ws.lane_type);
    } else if (FAILED_STATUSES.has(st)) {
      failed.push(ws.lane_type);
      next.push(`retry \`${ws.lane_type}\` (${ws.outbound?.last_error || 'failed'})`);
    } else if (BLOCKED_STATUSES.has(st)) {
      manualRequired.push(ws.lane_type);
      blocking.push(ws.lane_type);
      next.push(`manual action for \`${ws.lane_type}\` (${ws.outbound?.outbound_provider || 'unknown'})`);
    } else {
      running.push(ws.lane_type);
    }
  }

  let overall_status;
  const total = (run.workstreams || []).length;
  if (completed.length === total) {
    overall_status = 'completed';
  } else if (failed.length > 0 && running.length === 0 && completed.length + failed.length + manualRequired.length === total) {
    overall_status = 'failed';
  } else if (manualRequired.length > 0 && running.length === 0 && completed.length + manualRequired.length + failed.length === total) {
    overall_status = 'manual_blocked';
  } else if (completed.length > 0 && (running.length > 0 || manualRequired.length > 0 || failed.length > 0)) {
    overall_status = 'partial';
  } else {
    overall_status = 'running';
  }

  if (running.length > 0) {
    next.push(`awaiting: ${running.join(', ')}`);
  }

  return {
    overall_status,
    blocking_lanes: blocking,
    manual_required_lanes: manualRequired,
    completed_lanes: completed,
    failed_lanes: failed,
    next_actions: next,
  };
}

/**
 * Auto-detect and apply completion state changes.
 */
export function detectAndApplyCompletion(runId) {
  const eval_ = evaluateExecutionRunCompletion(runId);
  if (!eval_) return null;

  const run = getExecutionRunById(runId);
  if (!run) return null;

  if (eval_.overall_status === 'completed' && run.current_stage !== 'completed') {
    updateRunStage(runId, 'execution_reporting');
    updateRunReport(runId, `All ${eval_.completed_lanes.length} lanes completed.`);
    logLifecycle('completion_detected', { run_id: runId, overall: 'completed' });
  } else if (eval_.overall_status === 'manual_blocked') {
    logLifecycle('completion_detected', { run_id: runId, overall: 'manual_blocked', blocking: eval_.blocking_lanes });
  }

  return eval_;
}

/* ------------------------------------------------------------------ */
/*  GitHub env diagnostic                                               */
/* ------------------------------------------------------------------ */

export function diagnoseGithubConfig() {
  const pat = process.env.GITHUB_FINE_GRAINED_PAT || process.env.GITHUB_TOKEN;
  const owner = process.env.GITHUB_DEFAULT_OWNER;
  const repo = process.env.GITHUB_DEFAULT_REPO;
  const missing = [];
  if (!pat) missing.push('GITHUB_FINE_GRAINED_PAT or GITHUB_TOKEN');
  if (!owner) missing.push('GITHUB_DEFAULT_OWNER');
  if (!repo) missing.push('GITHUB_DEFAULT_REPO');
  return {
    configured: missing.length === 0,
    mode: pat ? 'live' : 'draft_only',
    missing,
  };
}

/* ------------------------------------------------------------------ */
/*  Supabase manual-apply instructions                                  */
/* ------------------------------------------------------------------ */

export function buildSupabaseManualApplyInstructions(runId) {
  const run = getExecutionRunById(runId);
  if (!run) return null;

  const draftPath = run.artifacts?.fullstack_swe?.supabase_schema_draft_path;
  const sqlPath = run.artifacts?.fullstack_swe?.supabase_sql_artifact_path;

  return {
    run_id: runId,
    draft_path: draftPath || '(no draft created)',
    sql_artifact_path: sqlPath || '(no SQL artifact)',
    steps: [
      draftPath ? `1. Review draft: \`${draftPath}\`` : '1. No draft exists — create schema manually',
      '2. Apply via `supabase db push` or Supabase dashboard',
      `3. Drop result payload at: \`data/cursor-results/${runId}.json\` or call ingestSupabaseResult()`,
      '4. Include: { migration_id, migration_path, apply_status: "applied_result_ingested" }',
    ],
    result_drop_path: `data/supabase-results/${runId}.json`,
  };
}

/* ------------------------------------------------------------------ */
/*  Cursor operational status                                           */
/* ------------------------------------------------------------------ */

export function getCursorOperationalStatus(runId) {
  const run = getExecutionRunById(runId);
  if (!run) return null;

  const handoff = run.artifacts?.fullstack_swe?.cursor_handoff_path;
  const traces = run.cursor_trace || [];
  const lastTrace = traces.length ? traces[traces.length - 1] : null;
  const hasResult = lastTrace?.dispatch_mode === 'result_ingested';

  let status;
  if (!handoff) status = 'no_handoff';
  else if (hasResult && lastTrace?.status === 'completed') status = 'result_ingested';
  else if (hasResult && lastTrace?.status === 'failed') status = 'failed';
  else status = 'awaiting_result';

  return {
    status,
    handoff_path: handoff,
    result_drop_paths: [
      `data/cursor-results/${runId}.json`,
      `docs/cursor-results/${runId}.json`,
    ],
    last_trace: lastTrace,
    result_summary: lastTrace?.result_summary || null,
    changed_files: lastTrace?.changed_files || [],
    tests_passed: lastTrace?.tests_passed ?? null,
  };
}

/**
 * Scan for any pending cursor results across all active runs.
 */
export async function scanPendingCursorResults() {
  // This is a convenience — individual file-drop ingest
  // Currently a no-op placeholder for bulk scanning
  return { scanned: 0, ingested: 0 };
}

/* ------------------------------------------------------------------ */
/*  PM cockpit: retry intent mapping                                    */
/* ------------------------------------------------------------------ */

const RETRY_RE = /retry|재시도|다시\s*해|재실행/i;
const MANUAL_ASK_RE = /manual\s*action|수동\s*조치|뭐\s*남았|manual|남은\s*작업/i;

export function detectPMIntent(text) {
  if (RETRY_RE.test(text)) return 'retry';
  if (MANUAL_ASK_RE.test(text)) return 'manual_status';
  return null;
}
