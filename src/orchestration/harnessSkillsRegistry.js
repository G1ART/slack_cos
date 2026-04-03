/**
 * vNext.13.2 — Skill packets: planner attaches after clarified need / approved work (not founder keyword map).
 */

/** @typedef {{ id: string, summary: string, jit_context_refs: string[], typical_agents: string[] }} HarnessSkillDef */

/** @type {Record<string, HarnessSkillDef>} */
export const HARNESS_SKILLS_REGISTRY = {
  investor_thesis_fit_skill: {
    id: 'investor_thesis_fit_skill',
    summary: 'Fund thesis / fit matrix — attach with investor_research + strategy_writer',
    jit_context_refs: ['approved_task_ids', 'goal_line_hint', 'investor_segments'],
    typical_agents: ['investor_research_agent', 'strategy_writer'],
  },
  budget_scenario_skill: {
    id: 'budget_scenario_skill',
    summary: 'Aggressive / base / conservative scenarios',
    jit_context_refs: ['approved_task_ids', 'runway_assumptions_ref'],
    typical_agents: ['budget_planning_agent', 'finance_analyst_agent', 'strategy_writer'],
  },
  competitor_matrix_skill: {
    id: 'competitor_matrix_skill',
    summary: 'Competitor benchmarking matrix and differentiation axes',
    jit_context_refs: ['competitor_list_ref', 'differentiation_axes'],
    typical_agents: ['competitor_teardown_agent', 'market_research_agent', 'strategy_writer'],
  },
  launch_readiness_skill: {
    id: 'launch_readiness_skill',
    summary: 'Pre-launch checklist aligned to kill point / release governor',
    jit_context_refs: ['provider_truth_snapshot_ref', 'run_id'],
    typical_agents: ['qa_agent', 'deploy_ops', 'audit_reconciliation_agent', 'release_governor'],
  },
  reconciliation_audit_skill: {
    id: 'reconciliation_audit_skill',
    summary: 'Tool-truth reconciliation; distrust naive self-report',
    jit_context_refs: ['truth_reconciliation_ref', 'tool_refs'],
    typical_agents: ['audit_reconciliation_agent'],
  },
  deck_storyline_skill: {
    id: 'deck_storyline_skill',
    summary: 'IR deck narrative and segment tone — COS_ONLY first',
    jit_context_refs: ['narrative_goal', 'deck_outline_ref'],
    typical_agents: ['strategy_writer', 'outreach_writer'],
  },
  messaging_variation_skill: {
    id: 'messaging_variation_skill',
    summary: 'Segment-specific messaging variants with guardrails',
    jit_context_refs: ['approved_messaging_scope', 'segment_list_ref'],
    typical_agents: ['outreach_writer', 'investor_research_agent'],
  },
  research_synthesis_skill: {
    id: 'research_synthesis_skill',
    summary: 'Synthesize multi-source research into decision-ready memo',
    jit_context_refs: ['source_bundle_ref', 'decision_question'],
    typical_agents: ['research_agent', 'strategy_writer'],
  },
};

/** Legacy alias id for docs/tests */
export const TEARDOWN_MATRIX_SKILL_ID = 'competitor_matrix_skill';

export const HARNESS_SKILL_IDS = Object.keys(HARNESS_SKILLS_REGISTRY);
