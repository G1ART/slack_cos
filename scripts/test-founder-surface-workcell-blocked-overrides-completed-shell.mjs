/**
 * W4 closeout Gap A — truth precedence regression.
 *
 * active_run_shell.status=completed 이더라도 workcell_runtime.status=blocked (또는 escalated / failed)
 * 이면 founder surface 는 **반드시 blocked** 를 말해야 한다. completed 는 workcell 부정 상태를 덮지 못한다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

// 1) workcell_runtime.status === 'blocked' 는 shell.completed 를 덮는다.
const shellBlocked = {
  id: 'cos_blk',
  run_id: 'cos_blk',
  thread_key: 'dm:Cblk',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_blk',
    dispatch_id: 'd_blk',
    status: 'blocked',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: true,
    escalation_targets: ['engineering'],
    packets: [
      { packet_id: 'pkt_blk', persona: 'pm', owner_persona: 'pm', status: 'escalated', review_required: false },
    ],
    summary_lines: ['외부 팀 응답이 돌아와야 다음 단계로 갈 수 있습니다.'],
  },
};

const smBlocked = buildFounderSurfaceModel({
  threadKey: 'dm:Cblk',
  modelText: '작업을 마무리했습니다.',
  activeRunShell: shellBlocked,
});
assert.equal(
  smBlocked.surface_intent,
  'blocked',
  `workcell blocked must override completed shell, got: ${smBlocked.surface_intent}`,
);

const rBlocked = renderFounderSurfaceText({ surfaceModel: smBlocked, modelText: '작업을 마무리했습니다.' });
assert.ok(rBlocked.text.startsWith('현재 진행이 막혀 있습니다.'), 'blocked header must lead, not completed');
assert.ok(!rBlocked.text.startsWith('요청을 완료했습니다.'), 'completed header must not render');
assert.ok(rBlocked.text.includes('외부 팀 응답'), 'natural reason surfaces');

// 2) workcell_runtime.status === 'escalated' 도 동일하게 blocked 로 수렴.
const shellEscalated = {
  id: 'cos_esc',
  run_id: 'cos_esc',
  thread_key: 'dm:Cesc',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_esc',
    dispatch_id: 'd_esc',
    status: 'escalated',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: true,
    escalation_targets: ['engineering'],
    packets: [
      { packet_id: 'pkt_esc', persona: 'pm', owner_persona: 'pm', status: 'escalated', review_required: false },
    ],
    summary_lines: ['엔지니어링으로 에스컬레이션했습니다.'],
  },
};
const smEscalated = buildFounderSurfaceModel({
  threadKey: 'dm:Cesc',
  modelText: '완료라고 생각했습니다.',
  activeRunShell: shellEscalated,
});
assert.equal(smEscalated.surface_intent, 'blocked', 'escalated workcell status must override completed shell');

// 3) workcell_runtime.status === 'failed' 도 shell.completed 를 덮는다.
const shellFailed = {
  id: 'cos_fail',
  run_id: 'cos_fail',
  thread_key: 'dm:Cfail',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_fail',
    dispatch_id: 'd_fail',
    status: 'failed',
    personas: ['engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: true,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_fail', persona: 'engineering', owner_persona: 'engineering', status: 'escalated', review_required: false },
    ],
    summary_lines: ['실행 도중 예상치 못한 오류가 있었습니다.'],
  },
};
const smFailed = buildFounderSurfaceModel({
  threadKey: 'dm:Cfail',
  modelText: '완료 처리했지만 확인이 필요합니다.',
  activeRunShell: shellFailed,
});
assert.equal(smFailed.surface_intent, 'failed', 'failed workcell status must override completed shell');

console.log('test-founder-surface-workcell-blocked-overrides-completed-shell: ok');
