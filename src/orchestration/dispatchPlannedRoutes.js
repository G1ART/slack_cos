/**
 * vNext.12 — Execute only what `planExecutionRoutesForRun` planned (executor obeys planner).
 */

import { routeDecisionKey } from './plannerTrace.js';
import { getExecutionRunById } from '../features/executionRun.js';
import {
  generateResearchArtifact,
  generateUiuxArtifacts,
  generateQaArtifacts,
  generateSpecRefineArtifact,
  ensureGithubIssueForRun,
  ensureCursorOutboundForRun,
  tryEnsureSupabaseLiveOrDraftForRun,
  executeDeployPreviewActuator,
} from '../features/executionOutboundOrchestrator.js';

/**
 * @param {object} run
 * @param {ReturnType<import('./planExecutionRoutes.js').planExecutionRoutesForRun>} orchestrationPlan
 * @param {object|null} space
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{ results: Record<string, unknown>, dispatch_log: object[], anyFailed: boolean }>}
 */
export async function dispatchPlannedRoutes(run, orchestrationPlan, space, metadata = {}) {
  /** @type {Record<string, unknown>} */
  const results = {
    research: { mode: 'skipped', reason: 'planner_capability_off' },
    spec_refine: { mode: 'skipped', reason: 'planner_capability_off' },
    github: { mode: 'skipped', reason: 'planner_capability_off' },
    cursor: { mode: 'skipped', reason: 'planner_capability_off' },
    supabase: { mode: 'skipped', reason: 'planner_capability_off' },
    uiux: { mode: 'skipped', reason: 'planner_capability_off' },
    qa: { mode: 'skipped', reason: 'planner_capability_off' },
    deploy: { mode: 'skipped', reason: 'planner_capability_off' },
  };
  /** @type {object[]} */
  const dispatch_log = [];
  let anyFailed = false;

  const decisions = orchestrationPlan.route_decisions || [];

  const refreshRun = () => getExecutionRunById(run.run_id) || run;

  for (const d of decisions) {
    const dk = routeDecisionKey(d);

    const r0 = refreshRun();
    let out = { mode: 'skipped', reason: 'no_handler' };

    try {
      if (d.capability === 'research' && d.selected_provider === 'internal_artifact') {
        out = await generateResearchArtifact(r0);
        results.research = out;
      } else if (d.capability === 'spec_refine' && d.selected_provider === 'internal_artifact') {
        out = await generateSpecRefineArtifact(r0);
        results.spec_refine = out;
      } else if (d.capability === 'fullstack_code' && d.selected_provider === 'github') {
        out = await ensureGithubIssueForRun(r0, metadata);
        results.github = out;
      } else if (d.capability === 'fullstack_code' && d.selected_provider === 'cursor_cloud') {
        out = await ensureCursorOutboundForRun(r0, metadata);
        results.cursor = out;
      } else if (d.capability === 'db_schema' && d.selected_provider === 'supabase_dispatch') {
        out = await tryEnsureSupabaseLiveOrDraftForRun(r0);
        results.supabase = out;
      } else if (d.capability === 'uiux_design' && d.selected_provider === 'internal_artifact') {
        out = await generateUiuxArtifacts(r0);
        results.uiux = out;
      } else if (d.capability === 'qa_validation' && d.selected_provider === 'internal_artifact') {
        out = await generateQaArtifacts(r0);
        results.qa = out;
      } else if (d.capability === 'deploy_preview') {
        out = await executeDeployPreviewActuator(r0, space, d);
        results.deploy = out;
      }
    } catch (e) {
      out = { mode: 'error', error_summary: String(e?.message || e).slice(0, 200) };
      anyFailed = true;
    }

    if (out.mode === 'error') anyFailed = true;

    dispatch_log.push({
      route_key: dk,
      capability: d.capability,
      selected_provider: d.selected_provider,
      attempted_action: `${d.capability}/${d.selected_provider}`,
      reported_result: out,
    });
  }

  return { results, dispatch_log, anyFailed };
}
