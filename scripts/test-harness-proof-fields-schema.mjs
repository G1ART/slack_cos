#!/usr/bin/env node
/**
 * W6-B regression #1 — schema: harnessWorkcellRuntime 결과에 proof 필드가 고정된 shape 로 나오고,
 * validateHarnessWorkcellRuntime 이 이를 검증한다.
 */

import assert from 'node:assert/strict';

import {
  buildHarnessWorkcellRuntime,
  validateHarnessWorkcellRuntime,
  REWORK_CAUSE_CODES,
  ACCEPTANCE_EVIDENCE_KINDS,
} from '../src/founder/harnessWorkcellRuntime.js';

// enums 고정
assert.deepEqual(REWORK_CAUSE_CODES, [
  'reviewer_finding',
  'disagreement_unresolved',
  'external_regression',
  'unclear_spec',
  'other',
]);
assert.deepEqual(ACCEPTANCE_EVIDENCE_KINDS, [
  'artifact_diff',
  'test_pass',
  'reviewer_sign_off',
  'live_demo',
  'bundle_attached',
]);

const basePackets = [
  {
    packet_id: 'p1',
    persona: 'research',
    owner_persona: 'research',
    review_required: false,
  },
];

const res = buildHarnessWorkcellRuntime({
  dispatch_id: 'd_schema',
  personas: ['research'],
  packets: basePackets,
  persona_contract_runtime_snapshot: ['research: analyze'],
});
assert.equal(res.ok, true, 'runtime builds');
const wc = res.workcell_runtime;

// proof 필드가 항상 존재하고 기본값은 0/null
assert.equal(wc.reviewer_findings_count, 0);
assert.equal(wc.unresolved_disagreements, 0);
assert.equal(wc.rework_cause_code, null);
assert.equal(wc.acceptance_evidence_kind, null);
assert.equal(wc.correction_hit_rate, null);
assert.equal(wc.patch_quality_delta, null);

// validator 통과
assert.equal(validateHarnessWorkcellRuntime(wc).ok, true);

// 음수 reviewer_findings_count 는 거부
const bad1 = { ...wc, reviewer_findings_count: -1 };
const v1 = validateHarnessWorkcellRuntime(bad1);
assert.equal(v1.ok, false);
assert.ok(/reviewer_findings_count/.test(v1.blocked_reason));

// 알 수 없는 rework_cause_code 거부
const bad2 = { ...wc, rework_cause_code: 'unknown_cause' };
const v2 = validateHarnessWorkcellRuntime(bad2);
assert.equal(v2.ok, false);
assert.ok(/rework_cause_code/.test(v2.blocked_reason));

// 알 수 없는 acceptance_evidence_kind 거부
const bad3 = { ...wc, acceptance_evidence_kind: 'handshake' };
const v3 = validateHarnessWorkcellRuntime(bad3);
assert.equal(v3.ok, false);
assert.ok(/acceptance_evidence_kind/.test(v3.blocked_reason));

// correction_hit_rate 범위 [0,1] 밖 거부
const bad4 = { ...wc, correction_hit_rate: 1.2 };
const v4 = validateHarnessWorkcellRuntime(bad4);
assert.equal(v4.ok, false);
assert.ok(/correction_hit_rate/.test(v4.blocked_reason));

// patch_quality_delta 숫자 아님 거부
const bad5 = { ...wc, patch_quality_delta: 'big' };
const v5 = validateHarnessWorkcellRuntime(bad5);
assert.equal(v5.ok, false);
assert.ok(/patch_quality_delta/.test(v5.blocked_reason));

console.log('test-harness-proof-fields-schema: ok');
