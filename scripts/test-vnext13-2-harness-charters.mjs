#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  HARNESS_AGENT_CHARTERS,
  HARNESS_CHARTER_AGENT_IDS,
} from '../src/orchestration/harnessAgentCharters.js';
import { HARNESS_OVERLAP_PAIRS } from '../src/orchestration/harnessOverlapMap.js';
import { HARNESS_REVIEW_MATRIX } from '../src/orchestration/harnessReviewMatrix.js';

const required = [
  'cos_planner',
  'research_agent',
  'market_research_agent',
  'strategy_writer',
  'finance_analyst_agent',
  'investor_research_agent',
  'outreach_writer',
  'fullstack_swe',
  'db_ops',
  'uiux_designer',
  'qa_agent',
  'deploy_ops',
  'audit_reconciliation_agent',
];
assert.equal(HARNESS_CHARTER_AGENT_IDS.length, required.length);
for (const id of required) {
  assert.ok(HARNESS_AGENT_CHARTERS[id], `charter ${id}`);
  const c = HARNESS_AGENT_CHARTERS[id];
  for (const k of [
    'mission',
    'scope',
    'allowed_providers',
    'forbidden_actions',
    'required_outputs',
    'success_criteria',
    'escalation_triggers',
    'review_obligations',
    'overlap_peers',
    'challenge_reviewed_by',
  ]) {
    assert.ok(c[k] !== undefined && c[k] !== null, `${id}.${k}`);
  }
}

assert.ok(HARNESS_OVERLAP_PAIRS.length >= 6);
assert.ok(HARNESS_REVIEW_MATRIX.qa_agent);
const swe = HARNESS_AGENT_CHARTERS.fullstack_swe;
assert.ok(swe.forbidden_actions.includes('deploy'));
assert.ok(swe.forbidden_actions.includes('db_live_apply'));
const db = HARNESS_AGENT_CHARTERS.db_ops;
assert.ok(db.forbidden_actions.includes('code_feature_change'));
const dep = HARNESS_AGENT_CHARTERS.deploy_ops;
assert.ok(dep.forbidden_actions.includes('feature_code_change'));

console.log('ok: vnext13_2_harness_charters');
