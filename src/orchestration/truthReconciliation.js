/**
 * vNext.12 / vNext.12.1 — Planned routes vs tool state on the run (not LLM self-report).
 * completion 정본: `reconcileRunTruthAfterDispatch` + `deriveExecutionCompletionFromRun`.
 */

import { getExecutionRunById } from '../features/executionRun.js';
import { routeDecisionKey } from './plannerTrace.js';

/**
 * @typedef {'satisfied'|'unsatisfied'|'draft_only'} ReconciledStatus
 */

/**
 * @param {object} run
 * @param {object} decision
 * @returns {{ route_key: string, attempted_action: string, observed_tool_refs: Record<string, unknown>, reconciled_status: ReconciledStatus, reconciliation_notes: string }}
 */
function reconcileOneDecision(run, decision) {
  const a = run.artifacts || {};
  const fs = a.fullstack_swe || {};
  const dep = a.deploy_preview || {};
  /** @type {Record<string, unknown>} */
  const obs = {};
  /** @type {ReconciledStatus} */
  let reconciled_status = 'unsatisfied';
  let notes = '';

  const cap = decision.capability;
  const prov = decision.selected_provider;

  if (cap === 'research' && prov === 'internal_artifact') {
    obs.research_note_path = a.research_benchmark?.research_note_path || null;
    reconciled_status = obs.research_note_path ? 'satisfied' : 'unsatisfied';
    if (!obs.research_note_path) notes = 'research_note_path missing';
  } else if (cap === 'spec_refine' && prov === 'internal_artifact') {
    obs.spec_outline_path = a.spec_refine?.outline_path || null;
    reconciled_status = obs.spec_outline_path ? 'satisfied' : 'unsatisfied';
    if (!obs.spec_outline_path) notes = 'spec outline path missing';
  } else if (cap === 'fullstack_code' && prov === 'github') {
    obs.github_issue_id = fs.github_issue_id || null;
    obs.github_draft_payload = Boolean(fs.github_draft_payload);
    obs.branch = run.git_trace?.branch || fs.branch_name || null;
    if (obs.github_issue_id) {
      reconciled_status = 'satisfied';
    } else if (fs.github_draft_payload) {
      reconciled_status = 'draft_only';
      notes = 'github live issue id missing (draft only)';
    } else {
      reconciled_status = 'unsatisfied';
      notes = 'github issue/draft ref missing';
    }
  } else if (cap === 'fullstack_code' && prov === 'cursor_cloud') {
    obs.cursor_handoff_path = fs.cursor_handoff_path || null;
    obs.cursor_cloud_run_ref = fs.cursor_cloud_run_ref || null;
    const hasH = Boolean(obs.cursor_handoff_path);
    const hasL = Boolean(obs.cursor_cloud_run_ref);
    if (hasH && hasL) {
      reconciled_status = 'satisfied';
    } else if (hasH || hasL) {
      reconciled_status = 'draft_only';
      notes = 'cursor handoff and live run ref both required for strict completion';
    } else {
      reconciled_status = 'unsatisfied';
      notes = 'cursor handoff or live ref missing';
    }
  } else if (cap === 'db_schema' && prov === 'supabase_dispatch') {
    obs.supabase_draft = fs.supabase_schema_draft_path || fs.supabase_migration_file_path || null;
    obs.apply_ref = fs.supabase_live_apply_ref || null;
    if (obs.apply_ref) {
      reconciled_status = 'satisfied';
    } else if (obs.supabase_draft) {
      reconciled_status = 'draft_only';
      notes = 'supabase apply ref missing (draft only)';
    } else {
      reconciled_status = 'unsatisfied';
      notes = 'supabase draft or apply ref missing';
    }
  } else if (cap === 'uiux_design' && prov === 'internal_artifact') {
    obs.ui_spec = a.uiux_design?.ui_spec_delta_path || null;
    reconciled_status = obs.ui_spec ? 'satisfied' : 'unsatisfied';
    if (!obs.ui_spec) notes = 'uiux spec path missing';
  } else if (cap === 'qa_validation' && prov === 'internal_artifact') {
    obs.qa_acceptance = a.qa_qc?.acceptance_checklist_path || null;
    reconciled_status = obs.qa_acceptance ? 'satisfied' : 'unsatisfied';
    if (!obs.qa_acceptance) notes = 'qa acceptance path missing';
  } else if (cap === 'deploy_preview' && prov === 'vercel') {
    obs.vercel_packet_path = dep.vercel_packet_path || a.deploy_preview?.vercel_packet_path || null;
    obs.vercel_preview_url = dep.vercel_preview_url || null;
    reconciled_status = obs.vercel_packet_path || obs.vercel_preview_url ? 'satisfied' : 'unsatisfied';
    if (reconciled_status === 'unsatisfied') notes = 'vercel deploy packet or preview ref missing';
  } else if (cap === 'deploy_preview' && prov === 'railway') {
    obs.railway_packet_path = dep.railway_packet_path || a.deploy_preview?.railway_packet_path || null;
    obs.railway_deploy_url = dep.railway_deploy_url || null;
    reconciled_status = obs.railway_packet_path || obs.railway_deploy_url ? 'satisfied' : 'unsatisfied';
    if (reconciled_status === 'unsatisfied') notes = 'railway deploy packet or status ref missing';
  } else if (cap === 'deploy_preview' && prov === 'observe_only') {
    obs.observe_summary_path = dep.observe_summary_path || a.deploy_preview?.observe_summary_path || null;
    reconciled_status = obs.observe_summary_path ? 'satisfied' : 'unsatisfied';
    if (!obs.observe_summary_path) notes = 'deploy observe summary missing';
  } else {
    reconciled_status = 'unsatisfied';
    notes = 'unknown route decision shape';
  }

  return {
    route_key: routeDecisionKey(decision),
    attempted_action: `${cap}/${prov}`,
    observed_tool_refs: obs,
    reconciled_status,
    reconciliation_notes: notes,
  };
}

/**
 * @param {ReturnType<typeof reconcileOneDecision>[]} entries
 * @returns {'completed'|'partial'|'failed'|'draft_only'|'observe_only'}
 */
export function aggregateReconciliationOverall(entries) {
  if (!entries.length) return 'failed';
  const st = entries.map((e) => e.reconciled_status);
  const allSat = st.every((s) => s === 'satisfied');
  if (allSat) {
    const onlyObserve =
      entries.length > 0 &&
      entries.every((e) => e.attempted_action === 'deploy_preview/observe_only');
    return onlyObserve ? 'observe_only' : 'completed';
  }
  const anyUnsat = st.some((s) => s === 'unsatisfied');
  const allOkish = st.every((s) => s === 'satisfied' || s === 'draft_only');
  if (allOkish && st.some((s) => s === 'draft_only')) {
    return 'draft_only';
  }
  if (anyUnsat && st.every((s) => s === 'unsatisfied')) return 'failed';
  return 'partial';
}

/**
 * @param {string} runId
 * @param {{ route_decisions: object[] }} orchestrationPlan
 * @returns {{ entries: object[], overall: string, evaluated_at: string }}
 */
export function reconcileRunTruthAfterDispatch(runId, orchestrationPlan) {
  const run = getExecutionRunById(runId);
  if (!run || !orchestrationPlan?.route_decisions?.length) {
    return { entries: [], overall: 'failed', evaluated_at: new Date().toISOString() };
  }

  const entries = orchestrationPlan.route_decisions.map((d) => reconcileOneDecision(run, d));
  const overall = aggregateReconciliationOverall(entries);

  return { entries, overall, evaluated_at: new Date().toISOString() };
}

/**
 * Founder/PM facing 한 줄 요약 — reconciliation + 관측 ref만 (lane 휴리스틱 없음).
 * @param {object|null} run
 * @returns {string[]}
 */
export function formatReconciliationLinesForFounder(run) {
  const tr = run?.truth_reconciliation;
  if (!tr?.entries?.length) {
    return ['툴 정본 스냅샷(`truth_reconciliation`)이 아직 없습니다. 디스패치가 끝나면 여기서 경로별 충족 여부가 찍힙니다.'];
  }
  const lines = [
    '*정본:* `truth_reconciliation` (LLM/레인 휴리스틱 아님)',
    `*overall:* \`${tr.overall}\``,
    '각 경로는 플랜 대비 실제 아티팩트 ref로만 판정합니다.',
  ];
  for (const e of tr.entries) {
    const note = e.reconciliation_notes ? ` — ${e.reconciliation_notes}` : '';
    lines.push(`- \`${e.attempted_action}\`: **${e.reconciled_status}**${note}`);
  }
  return lines;
}

/**
 * vNext.12.1 — `evaluateExecutionRunCompletion` 가 우선 사용하는 정본.
 * vNext.13.3 — 엔트리별 `reconciled_status`: `satisfied`(경로 충족) · `draft_only`(초안·관측만, 실행 증거 부족) ·
 * `unsatisfied`(미충족). `partial` overall은 일부 경로 satisfied·일부 미충족 혼합; `draft_only` overall은
 * 아직 실제 실행 증거가 초안 단계에 머무는 경우에 가깝다. 창업자 면 문구는 `founderTruthClosureWording`이 이 정본만 본다.
 * @param {object} run
 * @returns {{ overall_status: string, blocking_lanes: string[], manual_required_lanes: string[], completed_lanes: string[], failed_lanes: string[], next_actions: string[], truth_reconciliation_overall?: string, completion_source: string } | null}
 */
export function deriveExecutionCompletionFromTruthReconciliation(run) {
  const tr = run?.truth_reconciliation;
  if (!tr?.entries?.length) return null;

  const overall = tr.overall;
  const completed_lanes = tr.entries.filter((e) => e.reconciled_status === 'satisfied').map((e) => e.route_key);
  const failed_lanes = tr.entries.filter((e) => e.reconciled_status === 'unsatisfied').map((e) => e.route_key);
  const draft_lanes = tr.entries.filter((e) => e.reconciled_status === 'draft_only').map((e) => e.route_key);

  /** @type {string} */
  let overall_status;
  switch (overall) {
    case 'completed':
      overall_status = 'completed';
      break;
    case 'observe_only':
      overall_status = 'observe_only';
      break;
    case 'draft_only':
      overall_status = 'draft_only';
      break;
    case 'failed':
      overall_status = 'failed';
      break;
    case 'partial':
      overall_status = 'partial';
      break;
    default:
      overall_status = 'running';
  }

  const next_actions = [];
  for (const e of tr.entries) {
    if (e.reconciled_status === 'unsatisfied' && e.reconciliation_notes) {
      next_actions.push(`${e.attempted_action}: ${e.reconciliation_notes}`);
    }
    if (e.reconciled_status === 'draft_only' && e.reconciliation_notes) {
      next_actions.push(`${e.attempted_action} (draft): ${e.reconciliation_notes}`);
    }
  }
  if (!next_actions.length && overall_status === 'partial') {
    next_actions.push('일부 경로만 충족 — 부족한 ref를 채우면 overall이 completed로 올라갑니다.');
  }

  return {
    overall_status,
    truth_reconciliation_overall: overall,
    completion_source: 'truth_reconciliation',
    blocking_lanes: failed_lanes,
    manual_required_lanes: draft_lanes,
    completed_lanes,
    failed_lanes,
    next_actions,
  };
}
