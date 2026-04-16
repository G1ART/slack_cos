#!/usr/bin/env node
/**
 * W6-B regression #2 — enum rollup: packet 단위 값이 workcell_runtime 상위로 정확히 집계된다.
 *  - reviewer_findings_count 합산
 *  - rework_cause_code 첫 유효값 선택 + rework_requested 없으면 null 로 귀결(정직성 규칙)
 *  - acceptance_evidence_kind 첫 유효값 선택
 *  - top-level override(correction_hit_rate/patch_quality_delta/rework_cause_code) 우선
 */

import assert from 'node:assert/strict';

import { buildHarnessWorkcellRuntime } from '../src/founder/harnessWorkcellRuntime.js';

// 1) reviewer_findings_count 합산
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum1',
    personas: ['research', 'pm'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: true,
        reviewer_findings_count: 2,
      },
      {
        packet_id: 'p2', persona: 'pm', owner_persona: 'pm',
        review_required: false,
        reviewer_findings_count: 3,
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.reviewer_findings_count, 5);
}

// 2) rework_cause_code: rework_requested 가 하나라도 있으면 첫 유효값 채택
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum2',
    personas: ['research', 'pm'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
      },
      {
        packet_id: 'p2', persona: 'pm', owner_persona: 'pm',
        review_required: false,
        rework_requested: true,
        rework_cause_code: 'reviewer_finding',
      },
    ],
    persona_contract_runtime_snapshot: ['pm: scope'],
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.rework_cause_code, 'reviewer_finding');
}

// 3) rework_cause_code 가 있지만 rework_requested 가 없으면 null (정직성)
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum3',
    personas: ['research'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
        rework_cause_code: 'external_regression',
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.rework_cause_code, null);
}

// 4) acceptance_evidence_kind 첫 유효값
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum4',
    personas: ['research'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
        acceptance_evidence_kind: 'test_pass',
      },
      {
        packet_id: 'p2', persona: 'research', owner_persona: 'research',
        review_required: false,
        acceptance_evidence_kind: 'bundle_attached',
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.acceptance_evidence_kind, 'test_pass');
}

// 5) top-level override 우선 + 범위 밖 correction_hit_rate 는 null
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum5',
    personas: ['research'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
        rework_requested: true,
        rework_cause_code: 'reviewer_finding',
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
    rework_cause_code: 'unclear_spec',
    acceptance_evidence_kind: 'reviewer_sign_off',
    correction_hit_rate: 0.75,
    patch_quality_delta: -0.25,
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.rework_cause_code, 'unclear_spec');
  assert.equal(res.workcell_runtime.acceptance_evidence_kind, 'reviewer_sign_off');
  assert.equal(res.workcell_runtime.correction_hit_rate, 0.75);
  assert.equal(res.workcell_runtime.patch_quality_delta, -0.25);
}

// 6) 범위 밖 correction_hit_rate → null
{
  const res = buildHarnessWorkcellRuntime({
    dispatch_id: 'd_enum6',
    personas: ['research'],
    packets: [
      {
        packet_id: 'p1', persona: 'research', owner_persona: 'research',
        review_required: false,
      },
    ],
    persona_contract_runtime_snapshot: ['research: analyze'],
    correction_hit_rate: 1.5,
  });
  assert.equal(res.ok, true);
  assert.equal(res.workcell_runtime.correction_hit_rate, null);
}

console.log('test-harness-proof-fields-enum-rollup: ok');
