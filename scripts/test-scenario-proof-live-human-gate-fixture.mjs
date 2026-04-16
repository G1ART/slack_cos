#!/usr/bin/env node
/**
 * W9 regression — human_gate fixture 가 scorecard 에 올바르게 반영된다.
 *
 * scenario 1 fixture 에 billing gate 를 주입 → broken + human 영역 + continuation_available>=1.
 */

import assert from 'node:assert/strict';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

__resetProjectSpaceBindingMemoryForTests();

const fixture1 = {
  project_spaces: [
    {
      project_space_key: 'scenario1_ps_billing',
      display_name: '빌링 대기 프로젝트',
      product_key: 'scenario1_billing',
      repo_ref: 'owner/billing-repo',
      deploy_ref: 'railway:billing-prod',
      db_ref: 'supabase:billing',
      human_gate: {
        gate_kind: 'billing_or_subscription',
        reason: 'Supabase 유료 플랜이 아직 없습니다.',
        action: 'Supabase 빌링을 활성화해 주세요.',
      },
    },
  ],
};

const out = await runScenarioProofLive({
  runMode: 'fixture_replay',
  writeToDisk: false,
  fixtures: { scenario1: fixture1 },
  scenarios: ['scenario_1_multi_project_spinup'],
});
assert.equal(out.runs.length, 1);
const r = out.runs[0];
assert.ok(r.envelope);
assert.equal(r.envelope.outcome, 'broken');
assert.equal(r.envelope.break_location, 'human_gate');
assert.equal(r.classification.break_category, 'human');
assert.equal(r.classification.human_gate_required, true);
assert.equal(r.classification.continuation_path_exists, true);
assert.equal(out.scorecard.broken, 1);
assert.equal(out.scorecard.human_gate_required, 1);
assert.ok(out.scorecard.break_category_counts.human >= 1);

console.log('test-scenario-proof-live-human-gate-fixture: ok');
