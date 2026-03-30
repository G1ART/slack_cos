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

/**
 * @typedef {'pending'|'drafted'|'dispatched'|'completed'|'manual_required'|'blocked'|'failed'} OutboundStatus
 */

function makeOutboundMeta() {
  return {
    outbound_provider: null,
    outbound_status: /** @type {OutboundStatus} */ ('pending'),
    outbound_ref_ids: [],
    last_outbound_at: null,
    last_error: null,
  };
}

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
      outbound: makeOutboundMeta(),
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
      outbound: makeOutboundMeta(),
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
      outbound: makeOutboundMeta(),
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
      outbound: makeOutboundMeta(),
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
    project_id: opts.project_id || null,
    project_label: opts.project_label || null,
    document_context_summary: opts.document_context_summary || null,
    document_sources: opts.document_sources || [],
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
/**
 * @param {{ packet: object, metadata: Record<string, unknown>, playbook_id?: string, task_kind?: string }} opts
 */
export function createExecutionRun({ packet, metadata, playbook_id, task_kind }) {
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
    artifacts: {
      research_benchmark: { research_note_id: null, research_note_path: null },
      fullstack_swe: { github_issue_id: null, github_issue_url: null, branch_name: null, pr_id: null, pr_url: null, cursor_handoff_path: null, supabase_schema_draft_path: null },
      uiux_design: { ui_spec_delta_path: null, wireframe_note_path: null, component_checklist_path: null },
      qa_qc: { acceptance_checklist_path: null, regression_case_list_path: null, smoke_test_plan_path: null },
    },
    project_id: packet.project_id || metadata?.project_id || null,
    project_label: packet.project_label || metadata?.project_label || null,
    document_context_summary: packet.document_context_summary || null,
    document_sources: packet.document_sources || [],
    originating_playbook_id: playbook_id || null,
    originating_task_kind: task_kind || null,
    outbound_dispatch_state: 'not_started',
    outbound_dispatched_at: null,
    outbound_dispatch_attempts: 0,
    outbound_last_error: null,
    escalation_policy: 'bounded',
    deploy_readiness: 'not_ready',
    deploy_provider: packet.deploy_provider || metadata?.deploy_provider || null,
    deploy_status: 'none',
    deploy_url: null,
    deploy_error: null,
    requested_by: packet.requested_by || String(metadata?.user || ''),
    approved_by: String(metadata?.user || ''),
    latest_report: null,
  };

  runsByThread.set(packet.thread_key, run);
  runsById.set(run_id, run);

  persistRun(run);
  return run;
}

export function updateRunDeployStatus(runId, { deploy_status, deploy_provider, deploy_url, deploy_error }) {
  const run = runsById.get(runId);
  if (!run) return false;
  if (deploy_status) run.deploy_status = deploy_status;
  if (deploy_provider) run.deploy_provider = deploy_provider;
  if (deploy_url !== undefined) run.deploy_url = deploy_url;
  if (deploy_error !== undefined) run.deploy_error = deploy_error;
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
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
    run,
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

/**
 * Attach artifact metadata to a specific lane in the run.
 * @param {string} runId
 * @param {string} laneType - e.g. 'fullstack_swe'
 * @param {Record<string, unknown>} artifactData
 */
export function attachRunArtifact(runId, laneType, artifactData) {
  const run = runsById.get(runId);
  if (!run) return false;
  if (!run.artifacts) run.artifacts = {};
  run.artifacts[laneType] = { ...(run.artifacts[laneType] || {}), ...artifactData };
  const ws = (run.workstreams || []).find((w) => w.lane_type === laneType);
  if (ws) {
    for (const [k, v] of Object.entries(artifactData)) {
      if (v && !ws.git_artifacts.includes(k)) ws.git_artifacts.push(k);
    }
  }
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/**
 * Update git_trace fields progressively.
 * @param {string} runId
 * @param {Record<string, unknown>} traceUpdate
 */
export function updateRunGitTrace(runId, traceUpdate) {
  const run = runsById.get(runId);
  if (!run) return false;
  if (!run.git_trace) run.git_trace = {};
  for (const [k, v] of Object.entries(traceUpdate)) {
    if (k === 'commit_shas' && Array.isArray(v)) {
      run.git_trace.commit_shas = [...new Set([...(run.git_trace.commit_shas || []), ...v])];
    } else if (k === 'supabase_migration_ids' && Array.isArray(v)) {
      run.git_trace.supabase_migration_ids = [...new Set([...(run.git_trace.supabase_migration_ids || []), ...v])];
    } else if (v != null) {
      run.git_trace[k] = v;
    }
  }
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/**
 * Update outbound metadata on a specific workstream lane.
 * @param {string} runId
 * @param {string} laneType
 * @param {{ provider?: string, status?: OutboundStatus, ref_ids?: string[], error?: string | null }} update
 */
export function updateLaneOutbound(runId, laneType, update) {
  const run = runsById.get(runId);
  if (!run) return false;
  const ws = (run.workstreams || []).find((w) => w.lane_type === laneType);
  if (!ws) return false;
  if (!ws.outbound) ws.outbound = { outbound_provider: null, outbound_status: 'pending', outbound_ref_ids: [], last_outbound_at: null, last_error: null };
  if (update.provider != null) ws.outbound.outbound_provider = update.provider;
  if (update.status != null) ws.outbound.outbound_status = update.status;
  if (update.ref_ids) ws.outbound.outbound_ref_ids = [...new Set([...(ws.outbound.outbound_ref_ids || []), ...update.ref_ids])];
  if (update.error !== undefined) ws.outbound.last_error = update.error;
  ws.outbound.last_outbound_at = new Date().toISOString();
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/**
 * Append an entry to cursor_trace.
 * @param {string} runId
 * @param {{ dispatch_mode: string, handoff_path: string, status: string, result_summary?: string, result_link?: string }} entry
 */
export function appendCursorTrace(runId, entry) {
  const run = runsById.get(runId);
  if (!run) return false;
  if (!run.cursor_trace) run.cursor_trace = [];
  run.cursor_trace.push({ created_at: new Date().toISOString(), ...entry });
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/**
 * Append an entry to supabase_trace.
 * @param {string} runId
 * @param {{ kind: string, draft_path?: string, migration_id?: string, status: string }} entry
 */
export function appendSupabaseTrace(runId, entry) {
  const run = runsById.get(runId);
  if (!run) return false;
  if (!run.supabase_trace) run.supabase_trace = [];
  run.supabase_trace.push({ created_at: new Date().toISOString(), ...entry });
  if (entry.migration_id) {
    if (!run.git_trace) run.git_trace = {};
    if (!run.git_trace.supabase_migration_ids) run.git_trace.supabase_migration_ids = [];
    if (!run.git_trace.supabase_migration_ids.includes(entry.migration_id)) {
      run.git_trace.supabase_migration_ids.push(entry.migration_id);
    }
  }
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

/**
 * @param {string} runId
 * @param {'not_started'|'in_progress'|'completed'|'partial'|'failed'} state
 * @param {{ error?: string }} [extra]
 */
export function updateOutboundDispatchState(runId, state, extra = {}) {
  const run = runsById.get(runId);
  if (!run) return false;
  run.outbound_dispatch_state = state;
  if (state === 'in_progress' || state === 'completed' || state === 'partial') {
    run.outbound_dispatched_at = run.outbound_dispatched_at || new Date().toISOString();
  }
  run.outbound_dispatch_attempts = (run.outbound_dispatch_attempts || 0) + (state === 'in_progress' ? 1 : 0);
  if (extra.error !== undefined) run.outbound_last_error = extra.error;
  run.updated_at = new Date().toISOString();
  persistRun(run);
  return true;
}

export function getRunDispatchState(runId) {
  const run = runsById.get(runId);
  if (!run) return null;
  return {
    outbound_dispatch_state: run.outbound_dispatch_state || 'not_started',
    outbound_dispatched_at: run.outbound_dispatched_at || null,
    outbound_dispatch_attempts: run.outbound_dispatch_attempts || 0,
    outbound_last_error: run.outbound_last_error || null,
  };
}

/**
 * Update lane-level status field (not outbound, but lane.status itself).
 */
export function updateLaneStatus(runId, laneType, status) {
  const run = runsById.get(runId);
  if (!run) return false;
  const ws = (run.workstreams || []).find((w) => w.lane_type === laneType);
  if (!ws) return false;
  ws.status = status;
  run.updated_at = new Date().toISOString();
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
    Promise.resolve(appendJsonRecord(fp, run)).catch((e) => {
      console.warn('[execution_run] persist failed:', e?.message || e);
    });
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

export const _resetForTest = clearExecutionRunsForTest;
