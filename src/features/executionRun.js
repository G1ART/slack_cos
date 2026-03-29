/**
 * Execution Run — scope lock 이후 COS가 계속 소유하는 실행 spine 정본 객체.
 * packet_id(승인 패킷) → run_id(실행 단위) → workstreams(내부 lane) → git trace.
 *
 * 저장: data/execution-runs.json (append-only JSONL-ish array).
 */

import { appendJsonRecord, readJsonArray, writeJsonArray } from '../storage/jsonStore.js';
import { resolveExecutionRunsPath } from '../storage/paths.js';

/* ------------------------------------------------------------------ */
/*  ID generators                                                      */
/* ------------------------------------------------------------------ */

function makePacketId() {
  return `EPK-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeRunId() {
  return `RUN-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

function makeLaneId(laneType) {
  return `LANE-${laneType}-${Date.now().toString(36).slice(-4)}${Math.random().toString(36).slice(2, 5)}`;
}

/* ------------------------------------------------------------------ */
/*  In-memory index (thread_key → run)                                 */
/* ------------------------------------------------------------------ */

/** @type {Map<string, object>} */
const runsByThread = new Map();

/** @type {Map<string, object>} */
const runsById = new Map();

/* ------------------------------------------------------------------ */
/*  Default 4-lane workstream seed                                     */
/* ------------------------------------------------------------------ */

function seedWorkstreams(goalLine) {
  const g = String(goalLine || '').trim();
  return [
    {
      lane_id: makeLaneId('research'),
      lane_type: 'research_benchmark',
      objective: `기존 유사 패턴·UX baseline·SaaS benchmark 조사 — ${g.slice(0, 80)}`,
      inputs: ['locked_scope', 'market_context'],
      outputs: ['research_note_artifact'],
      dependencies: [],
      owner_agent: 'deep_research',
      status: 'pending',
      git_artifacts: [],
      external_tools_needed: ['web_search', 'competitor_analysis'],
      done_criteria: 'research note delivered',
    },
    {
      lane_id: makeLaneId('swe'),
      lane_type: 'fullstack_swe',
      objective: `app skeleton · route · data model · approval flow — ${g.slice(0, 80)}`,
      inputs: ['locked_scope', 'research_note'],
      outputs: ['github_issue', 'branch_pr_seed', 'cursor_handoff'],
      dependencies: ['research_benchmark'],
      owner_agent: 'fullstack_swe',
      status: 'pending',
      git_artifacts: [],
      external_tools_needed: ['cursor', 'github', 'supabase'],
      done_criteria: 'PR seed + schema draft ready',
    },
    {
      lane_id: makeLaneId('uiux'),
      lane_type: 'uiux_design',
      objective: `view model · permission surface · booking flow — ${g.slice(0, 80)}`,
      inputs: ['locked_scope', 'research_note'],
      outputs: ['ui_spec_delta', 'wireframe_note', 'component_checklist'],
      dependencies: ['research_benchmark'],
      owner_agent: 'uiux_design',
      status: 'pending',
      git_artifacts: [],
      external_tools_needed: [],
      done_criteria: 'UI spec + component checklist delivered',
    },
    {
      lane_id: makeLaneId('qa'),
      lane_type: 'qa_qc',
      objective: `acceptance criteria · conflict detection · regression cases — ${g.slice(0, 80)}`,
      inputs: ['locked_scope', 'swe_output'],
      outputs: ['test_checklist', 'smoke_cases', 'regression_additions'],
      dependencies: ['fullstack_swe'],
      owner_agent: 'qa_qc',
      status: 'pending',
      git_artifacts: [],
      external_tools_needed: [],
      done_criteria: 'test checklist + smoke cases delivered',
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  Execution Packet (pre-run, approval-pending)                       */
/* ------------------------------------------------------------------ */

/**
 * @param {{
 *   thread_key: string,
 *   goal_line: string,
 *   locked_scope_summary: string,
 *   includes: string[],
 *   excludes: string[],
 *   deferred_items: string[],
 *   approval_rules: string[],
 *   session_id: string,
 *   requested_by: string,
 * }} opts
 */
export function createExecutionPacket(opts) {
  const packet_id = makePacketId();
  return {
    packet_id,
    thread_key: opts.thread_key,
    goal_line: opts.goal_line,
    locked_scope_summary: opts.locked_scope_summary || opts.goal_line,
    includes: opts.includes || [],
    excludes: opts.excludes || [],
    deferred_items: opts.deferred_items || [],
    approval_policy: opts.approval_rules || [],
    generated_at: new Date().toISOString(),
    originating_session_id: opts.session_id || '',
    requested_by: opts.requested_by || '',
  };
}

/* ------------------------------------------------------------------ */
/*  Execution Run (the canonical spine object)                         */
/* ------------------------------------------------------------------ */

/**
 * @param {{ packet: object, metadata: Record<string, unknown> }} opts
 */
export function createExecutionRun({ packet, metadata }) {
  const run_id = makeRunId();
  const now = new Date().toISOString();
  const run = {
    run_id,
    packet_id: packet.packet_id,
    session_id: packet.originating_session_id || '',
    project_goal: packet.goal_line,
    locked_mvp_summary: packet.locked_scope_summary,
    includes: packet.includes,
    excludes: packet.excludes,
    deferred_items: packet.deferred_items,
    current_stage: 'execution_running',
    status: 'active',
    owner_thread_key: packet.thread_key,
    created_at: now,
    updated_at: now,
    workstreams: seedWorkstreams(packet.goal_line),
    git_trace: {
      repo: null,
      branch: null,
      issue_id: null,
      pr_id: null,
      commit_shas: [],
      handoff_doc_path: null,
      generated_cursor_handoff_path: null,
      supabase_migration_ids: [],
    },
    cursor_trace: [],
    supabase_trace: [],
    escalation_policy: 'bounded',
    requested_by: packet.requested_by || String(metadata?.user || ''),
    approved_by: String(metadata?.user || ''),
    latest_report: null,
  };

  runsByThread.set(packet.thread_key, run);
  runsById.set(run_id, run);

  persistRun(run);
  return run;
}

/* ------------------------------------------------------------------ */
/*  Lookup                                                             */
/* ------------------------------------------------------------------ */

export function getExecutionRunByThread(threadKey) {
  return runsByThread.get(threadKey) || null;
}

export function getExecutionRunById(runId) {
  return runsById.get(runId) || null;
}

/* ------------------------------------------------------------------ */
/*  Approval Resolution                                                */
/* ------------------------------------------------------------------ */

/**
 * Resolve approval for the most recent open packet on a thread.
 * @param {{ thread_key: string, text: string, metadata: Record<string, unknown>, packet: object }} opts
 * @returns {{ matched: boolean, run_id?: string, packet_id?: string, stage_result?: string }}
 */
export function resolveApproval({ thread_key, text, metadata, packet }) {
  if (!packet || !packet.packet_id) {
    return { matched: false };
  }

  const run = createExecutionRun({ packet, metadata });
  return {
    matched: true,
    run_id: run.run_id,
    packet_id: packet.packet_id,
    stage_result: 'execution_running',
  };
}

/* ------------------------------------------------------------------ */
/*  Stage transitions                                                  */
/* ------------------------------------------------------------------ */

export function updateRunStage(runId, newStage) {
  const run = runsById.get(runId);
  if (!run) return false;
  run.current_stage = newStage;
  run.updated_at = new Date().toISOString();
  if (newStage === 'completed' || newStage === 'cancelled') {
    run.status = newStage;
  }
  persistRun(run);
  return true;
}

export function updateRunReport(runId, report) {
  const run = runsById.get(runId);
  if (!run) return false;
  run.latest_report = report;
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/* ------------------------------------------------------------------ */
/*  Persistence                                                        */
/* ------------------------------------------------------------------ */

function persistRun(run) {
  try {
    const fp = resolveExecutionRunsPath();
    appendJsonRecord(fp, run);
  } catch (e) {
    console.warn('[execution_run] persist failed:', e?.message || e);
  }
}

export async function loadExecutionRunsFromDisk() {
  try {
    const fp = resolveExecutionRunsPath();
    const rows = readJsonArray(fp);
    for (const r of rows) {
      if (!r.run_id || !r.owner_thread_key) continue;
      if (r.status === 'completed' || r.status === 'cancelled') continue;
      runsById.set(r.run_id, r);
      runsByThread.set(r.owner_thread_key, r);
    }
  } catch {
    /* first boot — no file yet */
  }
}

export function clearExecutionRunsForTest() {
  runsByThread.clear();
  runsById.clear();
}
