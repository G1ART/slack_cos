/**
 * W11-E — scorecard 에 break_reason_cause_counts 히스토그램이 붙고,
 * toScorecardCompactLines 가 상위 cause 1개를 한국어 요약으로 노출한다.
 * founder 본문 토큰 금지 — 자연어 요약만.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const {
  buildScenarioProofScorecard,
  toScorecardCompactLines,
} = await import('../src/founder/scenarioProofScorecard.js');

function env(outcome, resolution_class, cause) {
  return {
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome,
    break_location: outcome === 'succeeded' ? 'none' : 'human_gate',
    break_reason_cause: cause,
    steps: [],
    isolation: { project_space_keys_observed: [], cross_project_contamination_detected: false },
    deliverable: { kind: null, bundle_ref: null },
    failure_classification: resolution_class ? { resolution_class } : null,
    founder_surface_slice: { headline: 'x' },
  };
}

const envs = [
  env('broken', 'hil_required_external_auth', 'external_auth_gate'),
  env('broken', 'hil_required_external_auth', 'external_auth_gate'),
  env('broken', 'hil_required_subscription_or_billing', 'subscription_billing_gate'),
  env('succeeded', null, 'none'),
];

const sc = buildScenarioProofScorecard(envs);
assert.equal(sc.total, 4);
assert.ok(sc.break_reason_cause_counts);
assert.equal(sc.break_reason_cause_counts.external_auth_gate, 2);
assert.equal(sc.break_reason_cause_counts.subscription_billing_gate, 1);
assert.equal(sc.break_reason_cause_counts.none, 1);

// entries 에도 cause 가 병치
for (const e of sc.entries) assert.ok('break_reason_cause' in e);

// compact line 상위 cause 한 줄
const lines = toScorecardCompactLines(sc);
const joined = lines.join('\n');
assert.ok(/주된 원인:/.test(joined), `expected 주된 원인 line, got:\n${joined}`);
assert.ok(/외부 인증 게이트/.test(joined), 'dominant cause humanized in Korean');

// 토큰/내부 jargon 금지
assert.ok(!/external_auth_gate/.test(joined), 'no raw enum token in compact line');
assert.ok(!/resolution_class/.test(joined), 'no raw jargon in compact line');

console.log('test-scenario-proof-scorecard-cause-histogram: ok');
