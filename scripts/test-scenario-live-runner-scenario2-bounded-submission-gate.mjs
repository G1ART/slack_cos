/**
 * W12-D — scenario 2 의 live 모드는 fixture 에 manual_submission_gate 가 없어도
 * 자동 제출하지 않고 수동 제출 게이트를 강제 주입한다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';
process.env.COS_SCENARIO_LIVE_OPENAI = '1';

const { runScenarioTwo } = await import('../scripts/scenario/run-scenario-2-research-to-bundle.mjs');

const fixture = {
  project_space_key: 'ps_w12d',
  stages: {
    research: { status: 'ok', sources: ['s1', 's2'], evidence_ref: 'r1' },
    draft: { status: 'ok', revisions: 1, evidence_ref: 'd1' },
    review: { status: 'ok', findings: 0, evidence_ref: 'rv1' },
    bundle: {
      status: 'ok',
      bundle_ref: 'ops/scenario_runs/w12d.zip',
      // no manual_submission_gate provided on purpose
    },
  },
};

const res = await runScenarioTwo({
  runMode: 'live_openai',
  fixture,
  writeToDisk: false,
});
assert.ok(res && res.ok, 'envelope built');
const env = res.envelope;
assert.equal(env.outcome, 'broken');
assert.equal(env.break_location, 'human_gate');
assert.equal(
  env.failure_classification.resolution_class,
  'hil_required_policy_or_product_decision',
);
const hasManualStep = env.steps.some((s) => s.step_id === 'bundle:manual_submission_gate');
assert.ok(hasManualStep, 'manual submission gate step present');

console.log('test-scenario-live-runner-scenario2-bounded-submission-gate: ok');
