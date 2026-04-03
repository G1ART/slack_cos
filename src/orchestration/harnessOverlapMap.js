/**
 * vNext.13.2 — Intentional harness overlap for mutual review.
 */

export const HARNESS_OVERLAP_PAIRS = [
  { pair: ['research_agent', 'strategy_writer'], rationale: 'evidence vs narrative' },
  { pair: ['fullstack_swe', 'qa_agent'], rationale: 'implementation vs independent verification' },
  { pair: ['db_ops', 'qa_agent'], rationale: 'schema/data vs regression' },
  { pair: ['deploy_ops', 'audit_reconciliation_agent'], rationale: 'release surface vs tool truth' },
  { pair: ['investor_research_agent', 'outreach_writer'], rationale: 'fund fit vs message tone' },
  { pair: ['finance_analyst_agent', 'strategy_writer'], rationale: 'numbers vs priorities' },
];
