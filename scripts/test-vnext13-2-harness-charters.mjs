#!/usr/bin/env node
import assert from 'node:assert/strict';
import {
  HARNESS_AGENT_CHARTERS,
  HARNESS_CHARTER_AGENT_IDS,
} from '../src/orchestration/harnessAgentCharters.js';
import { HARNESS_OVERLAP_PAIRS } from '../src/orchestration/harnessOverlapMap.js';
import { HARNESS_REVIEW_MATRIX } from '../src/orchestration/harnessReviewMatrix.js';
import { HARNESS_ORG_LANES } from '../src/orchestration/harnessOrgModel.js';

const required = [
  'cos_planner',
  'research_agent',
  'market_research_agent',
  'competitor_teardown_agent',
  'technical_feasibility_agent',
  'strategy_writer',
  'finance_analyst_agent',
  'budget_planning_agent',
  'investor_research_agent',
  'outreach_writer',
  'product_spec_architect',
  'fullstack_swe',
  'db_ops',
  'uiux_designer',
  'qa_agent',
  'deploy_ops',
  'audit_reconciliation_agent',
  'release_governor',
];

assert.equal(HARNESS_CHARTER_AGENT_IDS.length, required.length);

const charterKeys = [
  'agent_id',
  'mission',
  'primary_scope',
  'non_goals',
  'allowed_providers',
  'forbidden_actions',
  'expected_outputs',
  'success_criteria',
  'escalation_triggers',
  'required_review_from',
  'overlap_peers',
  'truth_source',
  'can_request_reorg',
  'can_request_new_tooling',
];

for (const id of required) {
  assert.ok(HARNESS_AGENT_CHARTERS[id], `charter ${id}`);
  const c = HARNESS_AGENT_CHARTERS[id];
  for (const k of charterKeys) {
    assert.ok(c[k] !== undefined && c[k] !== null, `${id}.${k}`);
  }
  assert.equal(c.agent_id, id);
}

assert.ok(HARNESS_OVERLAP_PAIRS.length >= 9);
assert.ok(HARNESS_ORG_LANES.quality_release.includes('release_governor'));
assert.ok(HARNESS_REVIEW_MATRIX.release_governor);
assert.ok(HARNESS_REVIEW_MATRIX.competitor_teardown_agent);

const swe = HARNESS_AGENT_CHARTERS.fullstack_swe;
assert.ok(swe.forbidden_actions.includes('deploy'));
assert.ok(swe.forbidden_actions.includes('db_live_apply'));
const db = HARNESS_AGENT_CHARTERS.db_ops;
assert.ok(db.forbidden_actions.includes('app_code_change'));
const dep = HARNESS_AGENT_CHARTERS.deploy_ops;
assert.ok(dep.forbidden_actions.includes('final_release_gate_sole_approval'));
const rg = HARNESS_AGENT_CHARTERS.release_governor;
assert.ok(rg.mission.toLowerCase().includes('kill') || rg.primary_scope.toLowerCase().includes('kill'));

console.log('ok: vnext13_2_harness_charters');
