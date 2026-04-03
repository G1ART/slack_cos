/**
 * vNext.13.2 — Skill packets attach after clarified need / approved proposal (never founder keyword routing).
 */

/** @type {Record<string, { typical_agents: string[], notes?: string }>} */
export const HARNESS_SKILL_AGENT_BINDINGS = {
  investor_thesis_fit_skill: {
    typical_agents: ['investor_research_agent', 'strategy_writer'],
    notes: 'Post-clarified investor segments',
  },
  budget_scenario_skill: {
    typical_agents: ['budget_planning_agent', 'finance_analyst_agent'],
  },
  competitor_matrix_skill: {
    typical_agents: ['competitor_teardown_agent', 'market_research_agent', 'strategy_writer'],
  },
  launch_readiness_skill: {
    typical_agents: ['qa_agent', 'deploy_ops', 'audit_reconciliation_agent', 'release_governor'],
  },
  reconciliation_audit_skill: {
    typical_agents: ['audit_reconciliation_agent'],
  },
  deck_storyline_skill: {
    typical_agents: ['strategy_writer', 'outreach_writer'],
  },
  messaging_variation_skill: {
    typical_agents: ['outreach_writer', 'investor_research_agent'],
  },
  research_synthesis_skill: {
    typical_agents: ['research_agent', 'strategy_writer'],
  },
};
