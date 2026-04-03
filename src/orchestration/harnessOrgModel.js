/**
 * vNext.13.2 — Lightweight org lanes for harness (governance, not COS reasoning).
 */

export const HARNESS_ORG_LANES = {
  cognition: ['cos_planner'],
  insight: [
    'research_agent',
    'market_research_agent',
    'competitor_teardown_agent',
    'technical_feasibility_agent',
    'strategy_writer',
  ],
  finance: ['finance_analyst_agent', 'budget_planning_agent'],
  capital_comms: ['investor_research_agent', 'outreach_writer'],
  product_engineering: ['product_spec_architect', 'fullstack_swe', 'db_ops', 'uiux_designer'],
  quality_release: ['qa_agent', 'deploy_ops', 'audit_reconciliation_agent', 'release_governor'],
};

export const HARNESS_ORG_LANE_ORDER = Object.keys(HARNESS_ORG_LANES);
