/**
 * W4 — blocked surface.
 *
 * 1차(primary): W2-B 실제 workcell_runtime shape (`status`·`packets`·`escalation_open`·
 *   `escalation_targets`·`summary_lines`) 에서 blocked/escalated 가 나오면 surface_intent=blocked,
 *   `summary_lines` 의 자연어 줄이 `blocker_reason` 으로 선택되며 machine 토큰은 배제된다.
 * 2차(legacy fallback): 오래된 `escalation_state.reasons` shape 도 여전히 정제된다 (호환 유지).
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

// --- primary: W2-B runtime shape with status=blocked ---
const shellWithW2bBlocked = {
  id: 'cos_2',
  run_id: 'cos_2',
  thread_key: 'dm:C2',
  status: 'blocked',
  workcell_runtime: {
    workcell_id: 'wc_d1',
    dispatch_id: 'd1',
    status: 'blocked',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: true,
    escalation_targets: ['engineering'],
    packets: [
      { packet_id: 'pkt_1', persona: 'pm', owner_persona: 'pm', status: 'escalated', review_required: false },
    ],
    summary_lines: [
      'workcell: blocked | personas=pm,engineering | packets=1',
      'packet pm:pkt_1 | escalated | tool=na | action=na',
      '외부 API 키가 만료되어 추가 호출이 막혀 있습니다.',
    ],
  },
};

const smW2b = buildFounderSurfaceModel({
  threadKey: 'dm:C2',
  modelText: '진행이 멈춰 있어요.',
  activeRunShell: shellWithW2bBlocked,
});
assert.equal(smW2b.surface_intent, 'blocked', 'W2-B blocked runtime drives blocked intent');
assert.equal(
  smW2b.blocker_reason,
  '외부 API 키가 만료되어 추가 호출이 막혀 있습니다.',
  `natural summary_line should surface, got: ${smW2b.blocker_reason}`,
);

const rW2b = renderFounderSurfaceText({ surfaceModel: smW2b, modelText: '진행이 멈춰 있어요.' });
assert.equal(rW2b.rendered_by, 'surface_state');
assert.ok(rW2b.text.startsWith('현재 진행이 막혀 있습니다.'), 'blocked header present');
assert.ok(!/workcell:|packet\s|pkt_1|tool=|action=/.test(rW2b.text), 'W2-B machine jargon must not leak');

// --- primary: W2-B escalated runtime should also collapse to blocked ---
const shellWithEscalated = {
  id: 'cos_2e',
  run_id: 'cos_2e',
  thread_key: 'dm:C2e',
  status: 'running',
  workcell_runtime: {
    workcell_id: 'wc_d2',
    dispatch_id: 'd2',
    status: 'escalated',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: true,
    escalation_targets: ['engineering'],
    packets: [
      { packet_id: 'pkt_2', persona: 'pm', owner_persona: 'pm', status: 'escalated', review_required: false },
    ],
    summary_lines: ['디자인 결정이 지연돼 엔지니어링으로 에스컬레이션했습니다.'],
  },
};
const smEsc = buildFounderSurfaceModel({
  threadKey: 'dm:C2e',
  modelText: '진행 확인 중입니다.',
  activeRunShell: shellWithEscalated,
});
assert.equal(smEsc.surface_intent, 'blocked', 'escalated W2-B status collapses to blocked for founder');
assert.ok(smEsc.blocker_reason && smEsc.blocker_reason.includes('에스컬레이션'), 'natural escalation line surfaces');

// --- legacy fallback compat: escalation_state.reasons still sanitized ---
const shellWithMachineReason = {
  id: 'cos_3',
  run_id: 'cos_3',
  thread_key: 'dm:C3',
  status: 'blocked',
  workcell_runtime: {
    status: 'blocked',
    escalation_state: { status: 'blocked', reasons: ['persona_contract_output_field_missing'] },
  },
};
const smLegacyMachine = buildFounderSurfaceModel({
  threadKey: 'dm:C3',
  modelText: '확인 중입니다.',
  activeRunShell: shellWithMachineReason,
});
assert.equal(smLegacyMachine.surface_intent, 'blocked');
assert.equal(
  smLegacyMachine.blocker_reason,
  null,
  `legacy machine reason should be dropped, got: ${smLegacyMachine.blocker_reason}`,
);

const shellWithLegacyNatural = {
  id: 'cos_4',
  run_id: 'cos_4',
  thread_key: 'dm:C4',
  status: 'blocked',
  workcell_runtime: {
    status: 'blocked',
    escalation_state: { status: 'blocked', reasons: ['외부 API 키가 만료되었습니다'] },
  },
};
const smLegacyNatural = buildFounderSurfaceModel({
  threadKey: 'dm:C4',
  modelText: '자세히 알려드릴게요.',
  activeRunShell: shellWithLegacyNatural,
});
assert.equal(smLegacyNatural.blocker_reason, '외부 API 키가 만료되었습니다');
const rLegacy = renderFounderSurfaceText({ surfaceModel: smLegacyNatural, modelText: '자세히 알려드릴게요.' });
assert.ok(rLegacy.text.includes('사유: 외부 API 키가 만료되었습니다'), 'legacy natural reason surfaces');

console.log('test-founder-surface-blocked: ok');
