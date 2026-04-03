#!/usr/bin/env node
import assert from 'node:assert/strict';
import { HARNESS_REVIEW_PAIRS } from '../src/orchestration/harnessReviewMatrix.js';

const want = [
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

function norm(p) {
  return p.map(([a, b]) => (a < b ? `${a}|${b}` : `${b}|${a}`)).sort();
}

assert.deepEqual(norm(HARNESS_REVIEW_PAIRS), norm(want));

console.log('ok: vnext13_2_harness_review_matrix');
