#!/usr/bin/env node
/**
 * W6-A regression: scenario proof envelope SSOT 스키마/검증/W5-A 연동을 고정한다.
 *  - valid envelope 빌드 + 불변 필드 형태 확인
 *  - outcome vs break_location 상호 제약
 *  - broken → resolution_class 강제 + W5-A buildFailureClassification 연동
 *  - founder_surface_slice 내부 jargon 금지
 *  - toFounderCompactLines 가 "다음 조치:" 한 줄을 포함하고 internal 토큰 없음
 */

import assert from 'node:assert/strict';

import {
  SCENARIO_PROOF_ENVELOPE_SCHEMA_VERSION,
  SCENARIO_IDS,
  SCENARIO_OUTCOMES,
  BREAK_LOCATIONS,
  SCENARIO_RUN_MODES,
  buildScenarioProofEnvelope,
  toFounderCompactLines,
} from './scenario/scenarioProofEnvelope.js';

// 1) 고정 enums: 값 순서/멤버가 흔들리지 않는지
assert.equal(SCENARIO_PROOF_ENVELOPE_SCHEMA_VERSION, 1);
assert.deepEqual(SCENARIO_IDS, ['scenario_1_multi_project_spinup', 'scenario_2_research_to_bundle']);
assert.deepEqual(SCENARIO_OUTCOMES, ['succeeded', 'broken', 'inconclusive']);
assert.ok(BREAK_LOCATIONS.includes('none'));
assert.ok(BREAK_LOCATIONS.includes('human_gate'));
assert.deepEqual(SCENARIO_RUN_MODES, ['fixture_replay', 'live_openai']);

// 2) succeeded 기본 케이스
const okRes = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  run_mode: 'fixture_replay',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:01:00Z',
  outcome: 'succeeded',
  break_location: 'none',
  steps: [
    { step_id: 'open_project_space_a', status: 'ok', evidence_ref: 'ps_A' },
    { step_id: 'open_project_space_b', status: 'ok', evidence_ref: 'ps_B' },
  ],
  isolation: {
    project_space_keys_observed: ['ps_A', 'ps_B', 'ps_A'],
    cross_project_contamination_detected: false,
  },
  founder_surface_slice: { headline: '두 프로젝트가 깔끔하게 열렸습니다.' },
});
assert.equal(okRes.ok, true, 'valid envelope should build');
const env = okRes.envelope;
assert.equal(env.schema_version, 1);
assert.equal(env.outcome, 'succeeded');
assert.equal(env.break_location, 'none');
assert.equal(env.failure_classification, null, 'succeeded 은 분류 없음');
assert.deepEqual(env.isolation.project_space_keys_observed, ['ps_A', 'ps_B'], '중복 제거');
assert.equal(env.isolation.cross_project_contamination_detected, false);
assert.equal(env.steps.length, 2);
assert.equal(env.steps[0].failure_classification, null);

// 3) outcome 제약
const bad1 = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:01:00Z',
  outcome: 'succeeded',
  break_location: 'human_gate',
});
assert.equal(bad1.ok, false);
assert.ok(bad1.errors.some((e) => /succeeded_outcome_requires_break_location_none/.test(e)));

const bad2 = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:01:00Z',
  outcome: 'broken',
  break_location: 'none',
});
assert.equal(bad2.ok, false);
assert.ok(bad2.errors.some((e) => /broken_outcome_must_have_break_location/.test(e)));

// 4) broken → resolution_class 강제
const brokenMissingClass = buildScenarioProofEnvelope({
  scenario_id: 'scenario_2_research_to_bundle',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:02:00Z',
  outcome: 'broken',
  break_location: 'deliverable_bundle',
});
assert.equal(brokenMissingClass.ok, false);
assert.ok(brokenMissingClass.errors.some((e) => /broken_outcome_requires_resolution_class/.test(e)));

// 5) broken + 알려진 resolution_class → 정상 분류 + W5-A derive 결과 반영
const brokenWithClass = buildScenarioProofEnvelope({
  scenario_id: 'scenario_2_research_to_bundle',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:02:00Z',
  outcome: 'broken',
  break_location: 'human_gate',
  failure_classification: {
    resolution_class: 'hil_required_subscription_or_billing',
    human_gate_reason: 'Supabase 유료 플랜이 필요합니다.',
    human_gate_action: 'Supabase 빌링을 활성화해 주세요.',
  },
  founder_surface_slice: { headline: '결제 승인 대기로 멈췄습니다.' },
});
assert.equal(brokenWithClass.ok, true);
assert.equal(brokenWithClass.envelope.failure_classification.resolution_class, 'hil_required_subscription_or_billing');
assert.equal(brokenWithClass.envelope.failure_classification.human_gate_required, true);
assert.equal(brokenWithClass.envelope.failure_classification.retryable, false);
assert.equal(brokenWithClass.envelope.founder_surface_slice.human_gate_action, 'Supabase 빌링을 활성화해 주세요.');

// 6) 알 수 없는 resolution_class 는 거부
const brokenUnknownClass = buildScenarioProofEnvelope({
  scenario_id: 'scenario_2_research_to_bundle',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:02:00Z',
  outcome: 'broken',
  break_location: 'deliverable_bundle',
  failure_classification: { resolution_class: 'not_a_real_class' },
});
assert.equal(brokenUnknownClass.ok, false);
assert.ok(brokenUnknownClass.errors.some((e) => /resolution_class_unknown/.test(e)));

// 7) founder_surface_slice 에 내부 jargon 금지
const jargonLeak = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:01:00Z',
  outcome: 'succeeded',
  break_location: 'none',
  founder_surface_slice: { headline: '프로젝트 공간 project_space_key ps_A 연결 완료' },
});
assert.equal(jargonLeak.ok, false);
assert.ok(jargonLeak.errors.some((e) => /founder_surface_slice.*internal_jargon/.test(e)));

// 8) step 단위 실패 분류도 W5-A 를 통해 정규화된다
const stepFailure = buildScenarioProofEnvelope({
  scenario_id: 'scenario_1_multi_project_spinup',
  started_at: '2026-04-16T21:00:00Z',
  finished_at: '2026-04-16T21:02:00Z',
  outcome: 'broken',
  break_location: 'callback_closure',
  failure_classification: { resolution_class: 'provider_transient_failure' },
  steps: [
    {
      step_id: 'wait_cursor_callback',
      status: 'failed',
      failure_classification: { resolution_class: 'provider_transient_failure' },
    },
  ],
  founder_surface_slice: { headline: 'Cursor 콜백이 늦어 재시도가 필요합니다.' },
});
assert.equal(stepFailure.ok, true);
assert.equal(stepFailure.envelope.failure_classification.retryable, true);
assert.equal(stepFailure.envelope.steps[0].failure_classification.retryable, true);

// 9) toFounderCompactLines 는 내부 토큰을 포함하지 않고 "다음 조치:" 를 포함한다
const lines = toFounderCompactLines(brokenWithClass.envelope);
assert.ok(lines.length >= 2, 'two compact lines expected');
assert.ok(lines.some((l) => /다음 조치:/.test(l)), '다음 조치 trailer');
for (const line of lines) {
  assert.ok(!/resolution_class/.test(line), 'internal token must not leak');
  assert.ok(!/project_space_key/.test(line), 'internal token must not leak');
}

console.log('test-scenario-proof-envelope-schema: ok');
