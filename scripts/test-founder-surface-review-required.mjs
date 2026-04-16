/**
 * W4 — review_required surface.
 *
 * 1차(primary): W2-B 실제 workcell_runtime shape (`status=review_required`,
 *   `packets[].review_required=true`, `summary_lines`, `review_checkpoint_count`).
 *   shell.status 가 완료·진행 중이어도 workcell truth 가 review_required 면 surface 는 review_required.
 * 2차(legacy fallback): `escalation_state.reasons` 는 자연어 줄이 있을 때만 review_reason 으로 허용.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shellPrimary = {
  id: 'cos_4',
  run_id: 'cos_4',
  thread_key: 'dm:C4',
  status: 'running',
  workcell_runtime: {
    workcell_id: 'wc_d4',
    dispatch_id: 'd4',
    status: 'review_required',
    personas: ['pm', 'engineering'],
    packet_count: 1,
    review_checkpoint_count: 1,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      {
        packet_id: 'pkt_review',
        persona: 'pm',
        owner_persona: 'pm',
        status: 'review_required',
        review_required: true,
      },
    ],
    summary_lines: [
      'workcell: review_required | personas=pm,engineering | packets=1',
      'packet pm:pkt_review | review_required | tool=na | action=na',
      '리서치 메모 초안이 준비됐으니 사람이 확인해 주세요.',
    ],
  },
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C4',
  modelText: '초안이 준비됐고, 확인이 필요해요.',
  activeRunShell: shellPrimary,
  readModel: { workcell_summary_lines: shellPrimary.workcell_runtime.summary_lines },
});

assert.equal(sm.surface_intent, 'review_required', 'W2-B review_required overrides running shell');
assert.ok(
  sm.review_reason && sm.review_reason.includes('사람이 확인'),
  `natural summary line should surface as review_reason, got: ${sm.review_reason}`,
);
assert.ok(!sm.evidence_lines.some((l) => /packet|pkt_review|tool=|action=|workcell:/.test(l)), 'jargon lines excluded');
assert.ok(sm.evidence_lines.some((l) => l.includes('사람이 확인')), 'natural evidence kept');

const r = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '초안이 준비됐으니 살펴봐 주세요.',
});

assert.ok(r.text.startsWith('확인이 필요한 상태입니다.'), 'review_required header');
assert.ok(r.text.includes('사람이 확인'), 'natural review reason surfaces');
assert.ok(r.text.includes('확인 근거:'), 'evidence trailer included');
assert.ok(!/packet_id|pkt_review|emit_patch|run_id|tool=|action=|workcell:/.test(r.text), 'no internal jargon leak');

// rework_requested 도 founder 면에서는 review_required 로 수렴
const shellRework = {
  id: 'cos_4r',
  run_id: 'cos_4r',
  thread_key: 'dm:C4r',
  status: 'running',
  workcell_runtime: {
    workcell_id: 'wc_d4r',
    dispatch_id: 'd4r',
    status: 'rework_requested',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_rw', persona: 'pm', owner_persona: 'pm', status: 'rework_requested', review_required: false },
    ],
    summary_lines: ['리뷰어가 재작업을 요청했습니다.'],
  },
};
const smRework = buildFounderSurfaceModel({
  threadKey: 'dm:C4r',
  modelText: '리뷰 피드백을 반영할 준비 중입니다.',
  activeRunShell: shellRework,
});
assert.equal(smRework.surface_intent, 'review_required', 'rework_requested collapses to review_required');
assert.ok(
  smRework.review_reason && smRework.review_reason.includes('재작업'),
  `natural rework line should surface, got: ${smRework.review_reason}`,
);

console.log('test-founder-surface-review-required: ok');
