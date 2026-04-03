/**
 * vNext.11 — Capability-routed execution plan (inputs provider truth, outputs route_decisions).
 */

import { buildProviderTruthSnapshot } from '../core/providerTruthSnapshot.js';
import { extractRunCapabilities } from './runCapabilityExtractor.js';

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
    route_decisions.push({
      capability: 'research',
      selected_agent: 'research_agent',
      selected_provider: 'internal_artifact',
      preconditions_passed: true,
      fallback_used: false,
      rationale: 'run text signals benchmark or market scan',
      produced_artifacts: ['research_note'],
    });
  }

  if (capabilities.fullstack_code) {
    const gh = by.github || 'not_configured';
    const cur = by.cursor_cloud || 'unavailable';
    route_decisions.push({
      capability: 'fullstack_code',
      selected_agent: 'fullstack_swe',
      selected_provider: 'github',
      preconditions_passed: gh === 'live' || gh === 'draft_only' || gh === 'manual_bridge',
      fallback_used: gh !== 'live',
      rationale: `provider github status=${gh}`,
      produced_artifacts: ['github_issue_or_draft', 'branch_pr_seed'],
    });
    route_decisions.push({
      capability: 'fullstack_code',
      selected_agent: 'fullstack_swe',
      selected_provider: 'cursor_cloud',
      preconditions_passed: ['live', 'live_ready', 'manual_bridge', 'unavailable'].includes(cur),
      fallback_used: cur === 'manual_bridge' || cur === 'unavailable',
      rationale: `provider cursor_cloud status=${cur}`,
      produced_artifacts: cur === 'live' ? ['cursor_live'] : ['cursor_handoff_or_skip'],
    });
  }

  if (capabilities.db_schema) {
    const sb = by.supabase || 'not_configured';
    route_decisions.push({
      capability: 'db_schema',
      selected_agent: 'db_ops',
      selected_provider: 'supabase_dispatch',
      preconditions_passed: ['live', 'live_ready', 'draft_only', 'not_configured'].includes(sb),
      fallback_used: sb === 'draft_only' || sb === 'not_configured',
      rationale: `provider supabase status=${sb}`,
      produced_artifacts: sb === 'live'
        ? ['schema_draft', 'migration_stub', 'apply_ref']
        : ['schema_draft', 'migration_stub'],
    });
  }

  if (capabilities.uiux_design) {
    route_decisions.push({
      capability: 'uiux_design',
      selected_agent: 'uiux_designer',
      selected_provider: 'internal_artifact',
      preconditions_passed: true,
      fallback_used: false,
      rationale: 'UI/UX scope detected in locked run text',
      produced_artifacts: ['ui_spec', 'wireframe', 'components'],
    });
  }

  if (capabilities.deploy_preview) {
    const v = by.vercel;
    const r = by.railway;
    const pick = v === 'live' ? 'vercel' : r === 'live' ? 'railway' : 'none';
    route_decisions.push({
      capability: 'deploy_preview',
      selected_agent: 'deploy_ops',
      selected_provider: pick,
      preconditions_passed: pick !== 'none',
      fallback_used: pick === 'none',
      rationale: `deploy path vercel=${v} railway=${r}`,
      produced_artifacts: [],
    });
  }

  if (capabilities.qa_validation) {
    route_decisions.push({
      capability: 'qa_validation',
      selected_agent: 'qa_agent',
      selected_provider: 'internal_artifact',
      preconditions_passed: true,
      fallback_used: false,
      rationale: 'code/db/ui/deploy surface implies QA artifacts',
      produced_artifacts: ['acceptance', 'regression', 'smoke'],
    });
  }

  return { capabilities, route_decisions, provider_truth_snapshot };
}
