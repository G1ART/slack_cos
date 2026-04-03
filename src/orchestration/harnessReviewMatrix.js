/**
 * vNext.13.2 revised — Constructive tension: who must review whom.
 */

export const HARNESS_REVIEW_PAIRS = [
  ['research_agent', 'strategy_writer'],
  ['competitor_teardown_agent', 'market_research_agent'],
  ['technical_feasibility_agent', 'strategy_writer'],
  ['finance_analyst_agent', 'strategy_writer'],
  ['investor_research_agent', 'outreach_writer'],
  ['fullstack_swe', 'qa_agent'],
  ['db_ops', 'qa_agent'],
  ['deploy_ops', 'audit_reconciliation_agent'],
  ['deploy_ops', 'release_governor'],
];

export const HARNESS_REVIEW_MATRIX = {
  cos_planner: { reviews: [], challenged_by: ['qa_agent', 'audit_reconciliation_agent'] },
  research_agent: { reviews: [], challenged_by: ['strategy_writer'] },
  market_research_agent: { reviews: ['competitor_teardown cross-check'], challenged_by: ['strategy_writer'] },
  competitor_teardown_agent: { reviews: [], challenged_by: ['market_research_agent', 'strategy_writer'] },
  technical_feasibility_agent: { reviews: [], challenged_by: ['strategy_writer', 'product_spec_architect'] },
  strategy_writer: { reviews: ['research/finance/tech inputs'], challenged_by: ['cos_planner', 'qa_agent'] },
  finance_analyst_agent: { reviews: [], challenged_by: ['strategy_writer', 'budget_planning_agent'] },
  budget_planning_agent: { reviews: [], challenged_by: ['finance_analyst_agent', 'strategy_writer'] },
  investor_research_agent: { reviews: [], challenged_by: ['outreach_writer'] },
  outreach_writer: { reviews: [], challenged_by: ['investor_research_agent', 'qa_agent'] },
  product_spec_architect: { reviews: [], challenged_by: ['technical_feasibility_agent', 'qa_agent'] },
  fullstack_swe: { reviews: [], challenged_by: ['qa_agent', 'db_ops'] },
  db_ops: { reviews: [], challenged_by: ['qa_agent', 'audit_reconciliation_agent'] },
  uiux_designer: { reviews: [], challenged_by: ['qa_agent', 'product_spec_architect'] },
  qa_agent: { reviews: ['fullstack_swe', 'db_ops', 'deploy_ops'], challenged_by: ['audit_reconciliation_agent'] },
  deploy_ops: { reviews: [], challenged_by: ['audit_reconciliation_agent', 'release_governor', 'qa_agent'] },
  audit_reconciliation_agent: { reviews: ['deploy truth cross-check'], challenged_by: ['cos_planner'] },
  release_governor: { reviews: [], challenged_by: ['audit_reconciliation_agent', 'qa_agent'] },
};
