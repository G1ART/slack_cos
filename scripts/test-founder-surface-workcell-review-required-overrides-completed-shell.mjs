/**
 * W4 closeout Gap A — truth precedence regression (review_required variant).
 *
 * active_run_shell.status=completed 이더라도 workcell_runtime.status=review_required (또는 rework_requested)
 * 이면 founder surface 는 **반드시 review_required** 로 말한다. completed 로 먼저 발화하지 않는다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

// 1) status === 'review_required' 은 completed shell 을 덮는다.
const shellReview = {
  id: 'cos_rv',
  run_id: 'cos_rv',
  thread_key: 'dm:Crv',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_rv',
    dispatch_id: 'd_rv',
    status: 'review_required',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 1,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_rv', persona: 'pm', owner_persona: 'pm', status: 'review_required', review_required: true },
    ],
    summary_lines: ['초안을 올려두었으니 한 번만 확인해 주세요.'],
  },
};

const smReview = buildFounderSurfaceModel({
  threadKey: 'dm:Crv',
  modelText: '완료했습니다.',
  activeRunShell: shellReview,
  readModel: { workcell_summary_lines: shellReview.workcell_runtime.summary_lines },
});
assert.equal(
  smReview.surface_intent,
  'review_required',
  `workcell review_required must override completed shell, got: ${smReview.surface_intent}`,
);
assert.ok(smReview.review_reason && smReview.review_reason.includes('한 번만 확인'), 'natural review reason surfaces');

const rReview = renderFounderSurfaceText({ surfaceModel: smReview, modelText: '완료했습니다.' });
assert.ok(rReview.text.startsWith('확인이 필요한 상태입니다.'), 'review_required header must lead, not completed');
assert.ok(!rReview.text.startsWith('요청을 완료했습니다.'), 'completed header must not render');

// 2) status === 'rework_requested' 도 founder 면에선 review_required 로 수렴한다.
const shellRework = {
  id: 'cos_rw',
  run_id: 'cos_rw',
  thread_key: 'dm:Crw',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_rw',
    dispatch_id: 'd_rw',
    status: 'rework_requested',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_rw', persona: 'pm', owner_persona: 'pm', status: 'rework_requested', review_required: false },
    ],
    summary_lines: ['리뷰어가 추가 수정을 요청했습니다.'],
  },
};

const smRework = buildFounderSurfaceModel({
  threadKey: 'dm:Crw',
  modelText: '완료라고 생각했습니다.',
  activeRunShell: shellRework,
});
assert.equal(smRework.surface_intent, 'review_required', 'rework_requested overrides completed shell');

console.log('test-founder-surface-workcell-review-required-overrides-completed-shell: ok');
