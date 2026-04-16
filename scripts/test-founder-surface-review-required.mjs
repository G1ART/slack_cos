/**
 * W4 — review_required surface: workcell_runtime.status=review_required 가 shell.status 를 덮지 않고 공존,
 *       evidence_lines 중 jargon 은 걸러내고 자연어만 표면에 붙는다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_4',
  run_id: 'cos_4',
  thread_key: 'dm:C4',
  status: 'running',
  workcell_runtime: {
    status: 'review_required',
    summary_lines: ['pm|review_required|packet_id=pkt_1', '리서치 메모 초안이 준비됐으니 사람이 확인해 주세요.'],
    escalation_state: { status: 'review_required', reasons: ['사람 확인 필요'] },
  },
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C4',
  modelText: '초안이 준비됐고, 확인이 필요해요.',
  activeRunShell: shell,
  readModel: { workcell_summary_lines: shell.workcell_runtime.summary_lines },
});

assert.equal(sm.surface_intent, 'review_required');
assert.equal(sm.review_reason, '사람 확인 필요');
// jargon 포함 줄은 evidence 에서 제거되었는지
assert.ok(!sm.evidence_lines.some((l) => /packet_id|pkt_1|pm\|/.test(l)), 'jargon lines excluded');
assert.ok(sm.evidence_lines.some((l) => l.includes('사람이 확인')), 'natural evidence kept');

const r = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '초안이 준비됐으니 살펴봐 주세요.',
});

assert.ok(r.text.startsWith('확인이 필요한 상태입니다.'), 'review_required header');
assert.ok(r.text.includes('사람 확인 필요'), 'review_reason surfaces');
assert.ok(r.text.includes('확인 근거:'), 'evidence trailer included');
assert.ok(!/packet_id|emit_patch|run_id|pm\|/.test(r.text), 'no internal jargon leak');

console.log('test-founder-surface-review-required: ok');
