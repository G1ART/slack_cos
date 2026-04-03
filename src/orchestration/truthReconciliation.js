/**
 * vNext.12 — Reconcile planned routes against tool state on the run (not LLM self-report).
 */

import { getExecutionRunById } from '../features/executionRun.js';
import { routeDecisionKey } from './plannerTrace.js';

/**
 * @param {object} run
 * @param {object} decision
 * @returns {{ observed_tool_refs: Record<string, unknown>, reconciled_status: string, reconciliation_notes: string }}
 */
function reconcileOneDecision(run, decision) {
  const a = run.artifacts || {};
  const fs = a.fullstack_swe || {};
  const obs = {};
  let ok = true;
  let notes = '';

  const cap = decision.capability;
  const prov = decision.selected_provider;

  if (cap === 'research' && prov === 'internal_artifact') {
    obs.research_note_path = a.research_benchmark?.research_note_path || null;
    ok = Boolean(obs.research_note_path);
    if (!ok) notes = 'research_note_path missing';
  } else if (cap === 'spec_refine' && prov === 'internal_artifact') {
    obs.spec_outline_path = a.spec_refine?.outline_path || null;
    ok = Boolean(obs.spec_outline_path);
    if (!ok) notes = 'spec outline path missing';
  } else if (cap === 'fullstack_code' && prov === 'github') {
    obs.github_issue_id = fs.github_issue_id || null;
    obs.github_draft_payload = fs.github_draft_payload || null;
    obs.branch = run.git_trace?.branch || fs.branch_name || null;
    ok = Boolean(obs.github_issue_id || obs.github_draft_payload);
    if (!ok) notes = 'github issue/draft ref missing';
  } else if (cap === 'fullstack_code' && prov === 'cursor_cloud') {
    obs.cursor_handoff_path = fs.cursor_handoff_path || null;
    obs.cursor_cloud_run_ref = fs.cursor_cloud_run_ref || null;
    ok = Boolean(obs.cursor_handoff_path || obs.cursor_cloud_run_ref);
    if (!ok) notes = 'cursor handoff or live ref missing';
  } else if (cap === 'db_schema' && prov === 'supabase_dispatch') {
    obs.supabase_draft = fs.supabase_schema_draft_path || fs.supabase_migration_file_path || null;
    obs.apply_ref = fs.supabase_live_apply_ref || null;
    ok = Boolean(obs.supabase_draft || obs.apply_ref);
    if (!ok) notes = 'supabase draft or apply ref missing';
  } else if (cap === 'uiux_design' && prov === 'internal_artifact') {
    obs.ui_spec = a.uiux_design?.ui_spec_delta_path || null;
    ok = Boolean(obs.ui_spec);
    if (!ok) notes = 'uiux spec path missing';
  } else if (cap === 'qa_validation' && prov === 'internal_artifact') {
    obs.qa_acceptance = a.qa_qc?.acceptance_checklist_path || null;
    ok = Boolean(obs.qa_acceptance);
    if (!ok) notes = 'qa acceptance path missing';
  } else if (cap === 'deploy_preview' && prov === 'vercel') {
    obs.vercel_packet_path = a.deploy_preview?.vercel_packet_path || null;
    ok = Boolean(obs.vercel_packet_path);
    if (!ok) notes = 'vercel deploy packet path missing';
  } else if (cap === 'deploy_preview' && prov === 'railway') {
    obs.railway_packet_path = a.deploy_preview?.railway_packet_path || null;
    ok = Boolean(obs.railway_packet_path);
    if (!ok) notes = 'railway deploy packet path missing';
  } else if (cap === 'deploy_preview' && prov === 'observe_only') {
    obs.observe_summary_path = a.deploy_preview?.observe_summary_path || null;
    ok = Boolean(obs.observe_summary_path);
    if (!ok) notes = 'deploy observe summary missing';
  } else {
    ok = false;
    notes = 'unknown route decision shape';
  }

  return {
    route_key: routeDecisionKey(decision),
    attempted_action: `${cap}/${prov}`,
    observed_tool_refs: obs,
    reconciled_status: ok ? 'satisfied' : 'unsatisfied',
    reconciliation_notes: notes,
  };
}

/**
 * @param {string} runId
 * @param {{ route_decisions: object[] }} orchestrationPlan
 * @returns {{ entries: object[], overall: 'completed'|'partial'|'failed' } }
 */
export function reconcileRunTruthAfterDispatch(runId, orchestrationPlan) {
  const run = getExecutionRunById(runId);
  if (!run || !orchestrationPlan?.route_decisions?.length) {
    return { entries: [], overall: 'failed' };
  }

  const entries = orchestrationPlan.route_decisions.map((d) => reconcileOneDecision(run, d));
  const bad = entries.filter((e) => e.reconciled_status !== 'satisfied');
  let overall = 'completed';
  if (bad.length === entries.length) overall = 'failed';
  else if (bad.length > 0) overall = 'partial';

  return { entries, overall, evaluated_at: new Date().toISOString() };
}
