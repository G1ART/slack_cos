/**
 * vNext.13.2 — Who reviews / challenges whom.
 */

export const HARNESS_REVIEW_MATRIX = {
  cos_planner: { reviews: [], challenged_by: ['qa_agent', 'audit_reconciliation_agent'] },
  research_agent: { reviews: ['strategy narrative check'], challenged_by: ['strategy_writer', 'qa_agent'] },
  market_research_agent: { reviews: [], challenged_by: ['strategy_writer', 'finance_analyst_agent'] },
  strategy_writer: { reviews: ['research/finance assumptions'], challenged_by: ['cos_planner', 'qa_agent'] },
  finance_analyst_agent: { reviews: [], challenged_by: ['strategy_writer', 'audit_reconciliation_agent'] },
  investor_research_agent: { reviews: [], challenged_by: ['outreach_writer', 'qa_agent'] },
  outreach_writer: { reviews: [], challenged_by: ['qa_agent', 'strategy_writer'] },
  fullstack_swe: { reviews: [], challenged_by: ['qa_agent', 'db_ops'] },
  db_ops: { reviews: [], challenged_by: ['qa_agent', 'audit_reconciliation_agent'] },
  uiux_designer: { reviews: [], challenged_by: ['qa_agent'] },
  qa_agent: { reviews: ['fullstack_swe', 'db_ops', 'deploy_ops'], challenged_by: ['audit_reconciliation_agent', 'cos_planner'] },
  deploy_ops: { reviews: [], challenged_by: ['audit_reconciliation_agent', 'qa_agent'] },
  audit_reconciliation_agent: { reviews: ['deploy/truth'], challenged_by: ['cos_planner'] },
};
