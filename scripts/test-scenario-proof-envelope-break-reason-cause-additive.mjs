/**
 * W11-E — scenarioProofEnvelope 에 break_reason_cause 가 additive field 로 붙는다.
 * - 기존 필드(shape/순서) 는 모두 보존.
 * - succeeded 는 'none' 강제, 불분명 inconclusive/broken 은 기본 'unclassified'.
 * - 잘못된 enum 은 errors 로 분류된다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const {
  buildScenarioProofEnvelope,
  BREAK_REASON_CAUSES,
} = await import('../scripts/scenario/scenarioProofEnvelope.js');

assert.ok(Array.isArray(BREAK_REASON_CAUSES));
assert.ok(BREAK_REASON_CAUSES.includes('binding_propagation_stop'));
assert.ok(BREAK_REASON_CAUSES.includes('external_auth_gate'));
assert.ok(BREAK_REASON_CAUSES.includes('subscription_billing_gate'));
assert.ok(BREAK_REASON_CAUSES.includes('provider_transient_failure'));
assert.ok(BREAK_REASON_CAUSES.includes('product_capability_missing'));
assert.ok(BREAK_REASON_CAUSES.includes('runtime_regression'));
assert.ok(BREAK_REASON_CAUSES.includes('unclassified'));
assert.ok(BREAK_REASON_CAUSES.includes('none'));

// 기존 필드 보존 + additive break_reason_cause 필드 존재 (succeeded → none)
const ok = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T01:00:00Z',
  finished_at: '2026-04-16T01:00:01Z',
  outcome: 'succeeded',
  break_location: 'none',
  founder_surface_slice: { headline: 'Alpha / Beta 독립 운영' },
});
assert.ok(ok.ok, `build succeed, errs=${(ok.errors || []).join(',')}`);
assert.equal(ok.envelope.break_reason_cause, 'none');
// 기존 필드
assert.equal(ok.envelope.schema_version, 1);
assert.equal(ok.envelope.scenario_id, 'scenario_1_multi_project_spinup');
assert.equal(ok.envelope.outcome, 'succeeded');
assert.equal(ok.envelope.break_location, 'none');
assert.ok('isolation' in ok.envelope);
assert.ok('deliverable' in ok.envelope);
assert.ok('founder_surface_slice' in ok.envelope);
assert.ok(Array.isArray(ok.envelope.steps));

// broken without cause → default 'unclassified'
const broken = buildScenarioProofEnvelope({
  scenario_id: 'scenario_2_research_to_bundle',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T01:00:00Z',
  finished_at: '2026-04-16T01:00:02Z',
  outcome: 'broken',
  break_location: 'tool_dispatch',
  failure_classification: {
    resolution_class: 'technical_capability_missing',
    human_gate_action: '운영자가 supabase 콘솔에서 확인',
  },
  founder_surface_slice: { headline: '번들 생성 도구 누락' },
});
assert.ok(broken.ok, `build broken ok, errs=${(broken.errors || []).join(',')}`);
assert.equal(broken.envelope.break_reason_cause, 'unclassified');

// broken with explicit cause → preserved
const broken2 = buildScenarioProofEnvelope({
  scenario_id: 'scenario_2_research_to_bundle',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T01:00:00Z',
  finished_at: '2026-04-16T01:00:02Z',
  outcome: 'broken',
  break_location: 'human_gate',
  break_reason_cause: 'external_auth_gate',
  failure_classification: {
    resolution_class: 'hil_required_external_auth',
    human_gate_action: 'OAuth 승인 필요',
  },
  founder_surface_slice: { headline: '외부 인증 필요' },
});
assert.ok(broken2.ok);
assert.equal(broken2.envelope.break_reason_cause, 'external_auth_gate');

// invalid cause → errors
const bad = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T01:00:00Z',
  finished_at: '2026-04-16T01:00:02Z',
  outcome: 'broken',
  break_location: 'tool_dispatch',
  break_reason_cause: 'totally_invalid_cause',
  failure_classification: { resolution_class: 'technical_capability_missing' },
  founder_surface_slice: { headline: '잘못된 값' },
});
assert.equal(bad.ok, false);
assert.ok(bad.errors.some((e) => /break_reason_cause_must_be_one_of/.test(e)));

// succeeded + cause != none → error
const succeededMismatch = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T01:00:00Z',
  finished_at: '2026-04-16T01:00:02Z',
  outcome: 'succeeded',
  break_location: 'none',
  break_reason_cause: 'external_auth_gate',
  founder_surface_slice: { headline: '모순' },
});
assert.equal(succeededMismatch.ok, false);
assert.ok(
  succeededMismatch.errors.some((e) =>
    /succeeded_outcome_requires_break_reason_cause_none/.test(e),
  ),
);

console.log('test-scenario-proof-envelope-break-reason-cause-additive: ok');
