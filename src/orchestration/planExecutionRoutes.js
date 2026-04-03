/**
 * vNext.12 — Planner output = execution constitution (route_decisions are law for executor).
 */

import { buildProviderTruthSnapshot } from '../core/providerTruthSnapshot.js';
import { extractRunCapabilities } from './runCapabilityExtractor.js';
import { CAPABILITY_EXECUTION_CONTRACTS } from './cosCapabilityCatalog.js';

/**
 * @param {object} partial
 * @returns {object}
 */
function enrichRouteDecision(partial) {
  const contract = CAPABILITY_EXECUTION_CONTRACTS[partial.capability] || {};
  return {
    ...partial,
    owning_agent: partial.owning_agent || partial.selected_agent || contract.owning_agent || 'unknown',
    allowed_providers: partial.allowed_providers || contract.allowed_providers || [],
    forbidden_actions: partial.forbidden_actions || contract.forbidden_actions || [],
    expected_artifacts: partial.produced_artifacts || contract.expected_artifacts || [],
    truth_source: partial.truth_source || contract.truth_source || 'unknown',
    success_condition: partial.success_condition || 'required_tool_refs_or_draft_fallback_recorded',
    failure_condition: partial.failure_condition || 'adapter_threw_or_missing_required_ref',
    fallback_rule:
      partial.fallback_rule ||
      (contract.default_execution_mode === 'draft'
        ? 'fallback_to_draft_artifact'
        : 'observe_and_record'),
    execution_mode: partial.execution_mode || contract.default_execution_mode || 'draft',
    expected_refs: partial.expected_refs || [],
  };
}

/**
 * @param {object} run
 * @param {object|null} space
 * @returns {{
 *   capabilities: ReturnType<typeof extractRunCapabilities>,
 *   route_decisions: object[],
 *   provider_truth_snapshot: ReturnType<typeof buildProviderTruthSnapshot>,
 * }}
 */
export function planExecutionRoutesForRun(run, space = null) {
  const capabilities = extractRunCapabilities(run);
  const provider_truth_snapshot = buildProviderTruthSnapshot({ space, run });
  const by = Object.fromEntries(
    (provider_truth_snapshot.providers || []).map((p) => [p.provider, p.status]),
  );

  /** @type {object[]} */
  const route_decisions = [];

  if (capabilities.research) {
    route_decisions.push(
      enrichRouteDecision({
        capability: 'research',
        selected_agent: 'research_agent',
        selected_provider: 'internal_artifact',
        preconditions_passed: true,
        fallback_used: false,
        rationale: 'run text signals benchmark or market scan',
        produced_artifacts: ['research_note_path'],
        execution_mode: 'draft',
        expected_refs: ['artifacts.research_benchmark.research_note_path'],
      }),
    );
  }

  if (capabilities.spec_refine && !capabilities.research_only) {
    route_decisions.push(
      enrichRouteDecision({
        capability: 'spec_refine',
        selected_agent: 'cos_planner',
        selected_provider: 'internal_artifact',
        preconditions_passed: true,
        fallback_used: false,
        rationale: 'spec / IA / north-star wording in locked run',
        produced_artifacts: ['spec_outline_path'],
        execution_mode: 'draft',
        expected_refs: ['artifacts.spec_refine.outline_path'],
      }),
    );
  }

  if (capabilities.fullstack_code) {
    const gh = by.github || 'not_configured';
    const cur = by.cursor_cloud || 'unavailable';
    route_decisions.push(
      enrichRouteDecision({
        capability: 'fullstack_code',
        selected_agent: 'fullstack_swe',
        selected_provider: 'github',
        preconditions_passed: gh === 'live' || gh === 'draft_only' || gh === 'manual_bridge',
        fallback_used: gh !== 'live',
        rationale: `provider github status=${gh}`,
        produced_artifacts: ['github_issue_or_draft', 'branch_pr_seed'],
        execution_mode: gh === 'live' ? 'live' : 'draft',
        expected_refs: ['artifacts.fullstack_swe.github_issue_id|github_draft_payload', 'git_trace.branch'],
      }),
    );
    route_decisions.push(
      enrichRouteDecision({
        capability: 'fullstack_code',
        selected_agent: 'fullstack_swe',
        selected_provider: 'cursor_cloud',
        preconditions_passed: ['live', 'live_ready', 'manual_bridge', 'unavailable'].includes(cur),
        fallback_used: cur === 'manual_bridge' || cur === 'unavailable',
        rationale: `provider cursor_cloud status=${cur}`,
        produced_artifacts: cur === 'live' ? ['cursor_live_ref'] : ['cursor_handoff_or_skip'],
        execution_mode: cur === 'live' ? 'live' : 'draft',
        expected_refs: ['artifacts.fullstack_swe.cursor_handoff_path|cursor_cloud_run_ref'],
      }),
    );
  }

  if (capabilities.db_schema) {
    const sb = by.supabase || 'not_configured';
    route_decisions.push(
      enrichRouteDecision({
        capability: 'db_schema',
        selected_agent: 'db_ops',
        selected_provider: 'supabase_dispatch',
        preconditions_passed: ['live', 'live_ready', 'draft_only', 'not_configured'].includes(sb),
        fallback_used: sb === 'draft_only' || sb === 'not_configured',
        rationale: `provider supabase status=${sb}`,
        produced_artifacts:
          sb === 'live'
            ? ['schema_draft', 'migration_stub', 'apply_ref']
            : ['schema_draft', 'migration_stub'],
        execution_mode: sb === 'live' ? 'live' : 'draft',
        expected_refs: [
          'artifacts.fullstack_swe.supabase_schema_draft_path|supabase_migration_file_path',
          'supabase_trace',
        ],
      }),
    );
  }

  if (capabilities.uiux_design) {
    route_decisions.push(
      enrichRouteDecision({
        capability: 'uiux_design',
        selected_agent: 'uiux_designer',
        selected_provider: 'internal_artifact',
        preconditions_passed: true,
        fallback_used: false,
        rationale: 'UI/UX scope detected in locked run text',
        produced_artifacts: ['ui_spec', 'wireframe', 'components'],
        execution_mode: 'draft',
        expected_refs: [
          'artifacts.uiux_design.ui_spec_delta_path',
          'artifacts.uiux_design.wireframe_note_path',
        ],
      }),
    );
  }

  if (capabilities.deploy_preview) {
    const v = by.vercel;
    const r = by.railway;
    if (v === 'live') {
      route_decisions.push(
        enrichRouteDecision({
          capability: 'deploy_preview',
          selected_agent: 'deploy_ops',
          selected_provider: 'vercel',
          preconditions_passed: true,
          fallback_used: false,
          rationale: `deploy path vercel=${v} railway=${r}`,
          produced_artifacts: ['vercel_deploy_readiness_packet', 'optional_preview_url'],
          execution_mode: 'preview',
          expected_refs: ['artifacts.deploy_preview.vercel_packet_path', 'space.vercel_project_id'],
        }),
      );
    } else if (r === 'live') {
      route_decisions.push(
        enrichRouteDecision({
          capability: 'deploy_preview',
          selected_agent: 'deploy_ops',
          selected_provider: 'railway',
          preconditions_passed: true,
          fallback_used: false,
          rationale: `deploy path vercel=${v} railway=${r}`,
          produced_artifacts: ['railway_deploy_readiness_packet', 'optional_service_url'],
          execution_mode: 'preview',
          expected_refs: ['artifacts.deploy_preview.railway_packet_path', 'space.railway_service_id'],
        }),
      );
    } else {
      route_decisions.push(
        enrichRouteDecision({
          capability: 'deploy_preview',
          selected_agent: 'deploy_ops',
          selected_provider: 'observe_only',
          preconditions_passed: true,
          fallback_used: true,
          rationale: `no live vercel/railway in truth; record readiness observe packet`,
          produced_artifacts: ['deploy_observe_summary', 'vercel_bootstrap_stub', 'railway_bootstrap_stub'],
          execution_mode: 'observe_only',
          expected_refs: ['artifacts.deploy_preview.observe_summary_path'],
        }),
      );
    }
  }

  if (capabilities.qa_validation) {
    route_decisions.push(
      enrichRouteDecision({
        capability: 'qa_validation',
        selected_agent: 'qa_agent',
        selected_provider: 'internal_artifact',
        preconditions_passed: true,
        fallback_used: false,
        rationale: 'code/db/ui/deploy surface implies QA artifacts',
        produced_artifacts: ['acceptance', 'regression', 'smoke'],
        execution_mode: 'draft',
        expected_refs: ['artifacts.qa_qc.acceptance_checklist_path'],
      }),
    );
  }

  return { capabilities, route_decisions, provider_truth_snapshot };
}
