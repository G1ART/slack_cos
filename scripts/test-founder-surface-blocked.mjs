/**
 * W4 — blocked surface: run status=blocked → intent=blocked; sanitized reason 만 표면화 (jargon 제거).
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shellWithMachineReason = {
  id: 'cos_2',
  run_id: 'cos_2',
  thread_key: 'dm:C2',
  status: 'blocked',
  workcell_runtime: {
    status: 'blocked',
    escalation_state: { status: 'blocked', reasons: ['persona_contract_output_field_missing'] },
    summary_lines: ['pm|blocked'],
  },
};

const smA = buildFounderSurfaceModel({
  threadKey: 'dm:C2',
  modelText: '데이터 확인 단계에서 진행이 멈춰 있어요.',
  activeRunShell: shellWithMachineReason,
});
assert.equal(smA.surface_intent, 'blocked');
// machine-style reason 은 founder 표면용으로 정제되어 빈 값 처리
assert.equal(smA.blocker_reason, null, `machine reason should be dropped, got: ${smA.blocker_reason}`);

const rA = renderFounderSurfaceText({ surfaceModel: smA, modelText: '데이터 확인 단계에서 진행이 멈춰 있어요.' });
assert.equal(rA.rendered_by, 'surface_state');
assert.ok(rA.text.startsWith('현재 진행이 막혀 있습니다.'), 'blocked header present');
assert.ok(!/persona_contract_output_field_missing/.test(rA.text), 'machine token must not leak');

const shellWithNaturalReason = {
  id: 'cos_3',
  run_id: 'cos_3',
  thread_key: 'dm:C3',
  status: 'blocked',
  workcell_runtime: {
    status: 'blocked',
    escalation_state: { status: 'blocked', reasons: ['외부 API 키가 만료되었습니다'] },
  },
};

const smB = buildFounderSurfaceModel({ threadKey: 'dm:C3', modelText: '자세히 알려드릴게요.', activeRunShell: shellWithNaturalReason });
assert.equal(smB.blocker_reason, '외부 API 키가 만료되었습니다');
const rB = renderFounderSurfaceText({ surfaceModel: smB, modelText: '자세히 알려드릴게요.' });
assert.ok(rB.text.includes('사유: 외부 API 키가 만료되었습니다'), 'natural-language reason surfaces');

console.log('test-founder-surface-blocked: ok');
