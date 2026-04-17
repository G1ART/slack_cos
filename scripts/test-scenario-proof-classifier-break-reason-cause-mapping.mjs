/**
 * W11-E — classifier mapping (plan §7):
 *  - succeeded → 'none'
 *  - technical_capability_missing (supabase 힌트 포함) → 'product_capability_missing'
 *  - provider_transient_failure → 'provider_transient_failure'
 *  - hil_required_external_auth → 'external_auth_gate'
 *  - hil_required_subscription_or_billing → 'subscription_billing_gate'
 *  - tenancy_or_binding_ambiguity → 'binding_propagation_stop'
 *  - runtime_bug_or_regression 또는 break_category='runtime'+broken → 'runtime_regression'
 *  - 그 외 broken/inconclusive → 'unclassified'
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { classifyScenarioProofEnvelope } = await import(
  '../src/founder/scenarioProofResultClassifier.js'
);

function env(outcome, breakLoc, resolution_class, extra = {}) {
  return {
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome,
    break_location: breakLoc,
    steps: [],
    isolation: { project_space_keys_observed: [], cross_project_contamination_detected: false },
    deliverable: { kind: null, bundle_ref: null },
    failure_classification: resolution_class
      ? { resolution_class, ...extra }
      : null,
    founder_surface_slice: { headline: 'h' },
  };
}

// succeeded → none
let c = classifyScenarioProofEnvelope(env('succeeded', 'none', null));
assert.equal(c.break_reason_cause, 'none');

// technical_capability_missing + supabase 힌트 → product_capability_missing
c = classifyScenarioProofEnvelope(
  env('broken', 'tool_dispatch', 'technical_capability_missing', {
    human_gate_reason: 'supabase 관리 API 가 제공되지 않습니다.',
  }),
);
assert.equal(c.break_reason_cause, 'product_capability_missing');

// technical_capability_missing (힌트 없음) → 기본 product_capability_missing (plan 의 보수적 매핑)
c = classifyScenarioProofEnvelope(env('broken', 'tool_dispatch', 'technical_capability_missing'));
assert.equal(c.break_reason_cause, 'product_capability_missing');

// provider_transient_failure → provider_transient_failure
c = classifyScenarioProofEnvelope(env('broken', 'tool_dispatch', 'provider_transient_failure'));
assert.equal(c.break_reason_cause, 'provider_transient_failure');

// hil_required_external_auth → external_auth_gate
c = classifyScenarioProofEnvelope(env('broken', 'human_gate', 'hil_required_external_auth'));
assert.equal(c.break_reason_cause, 'external_auth_gate');

// hil_required_subscription_or_billing → subscription_billing_gate
c = classifyScenarioProofEnvelope(
  env('broken', 'human_gate', 'hil_required_subscription_or_billing'),
);
assert.equal(c.break_reason_cause, 'subscription_billing_gate');

// tenancy_or_binding_ambiguity → binding_propagation_stop
c = classifyScenarioProofEnvelope(
  env('broken', 'project_space_binding', 'tenancy_or_binding_ambiguity'),
);
assert.equal(c.break_reason_cause, 'binding_propagation_stop');

// runtime_bug_or_regression → runtime_regression
c = classifyScenarioProofEnvelope(env('broken', 'workcell_runtime', 'runtime_bug_or_regression'));
assert.equal(c.break_reason_cause, 'runtime_regression');

// 규칙 밖 inconclusive → unclassified
c = classifyScenarioProofEnvelope(env('inconclusive', 'unclassified', null));
assert.equal(c.break_reason_cause, 'unclassified');

// envelope 에 명시적 cause 가 있으면 그대로 존중
c = classifyScenarioProofEnvelope({
  ...env('broken', 'tool_dispatch', 'technical_capability_missing'),
  break_reason_cause: 'runtime_regression',
});
assert.equal(c.break_reason_cause, 'runtime_regression');

console.log('test-scenario-proof-classifier-break-reason-cause-mapping: ok');
