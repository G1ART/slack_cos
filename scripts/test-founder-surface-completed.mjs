/**
 * W4 — completed surface.
 *
 * 1차(primary): W2-B 실제 workcell_runtime shape (`status=completed`, packets·summary_lines) +
 *   shell.status=completed → 헤더 prepend + 실제 artifact_path 기반 산출물 trailer.
 *   workcell truth 가 review/blocked/escalated 이면 completed 로 올리지 않는다 (Gap A 참고).
 * fabricate 금지: artifact 가 비면 trailer 안 붙고, 모델이 이미 언급한 파일명은 중복 출력하지 않는다 (C4).
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_5',
  run_id: 'cos_5',
  thread_key: 'dm:C5',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_d5',
    dispatch_id: 'd5',
    status: 'completed',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_done', persona: 'pm', owner_persona: 'pm', status: 'completed', review_required: false },
    ],
    summary_lines: ['리뷰 요약 파일을 저장소에 남겼습니다.'],
  },
};

const artifacts = [
  {
    type: 'tool_invocation',
    payload: { tool: 'cursor', action: 'emit_patch', cos_run_id: 'cos_5' },
  },
  {
    type: 'tool_result',
    payload: {
      tool: 'github',
      action: 'create_file',
      cos_run_id: 'cos_5',
      artifact_path: 'artifacts/ops/run-notes.md',
      result_summary: '운영 노트 초안 작성',
    },
  },
  {
    type: 'tool_result',
    payload: {
      tool: 'cursor',
      action: 'emit_patch',
      cos_run_id: 'cos_5',
      artifact_path: '/tmp/cursor/payload/review_summary.md',
      result_summary: '리뷰 요약 파일 생성',
    },
  },
];

const sm = buildFounderSurfaceModel({ threadKey: 'dm:C5', modelText: '최종 산출물 정리했습니다.', activeRunShell: shell, artifacts });
assert.equal(sm.surface_intent, 'completed');
const labels = sm.deliverables.map((d) => d.label);
assert.ok(labels.includes('run-notes.md'), `expected run-notes.md, got ${labels.join(',')}`);
assert.ok(labels.includes('review_summary.md'), `expected review_summary.md, got ${labels.join(',')}`);

const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: '최종 산출물 정리했습니다.' });
assert.ok(r.text.startsWith('요청을 완료했습니다.'), 'completed header');
assert.ok(r.text.includes('산출물:'), 'deliverables trailer present');
assert.ok(r.text.includes('run-notes.md'), 'deliverable filename surfaces');

// fabricate 금지: artifact 가 없으면 trailer 는 안 붙는다
const smEmpty = buildFounderSurfaceModel({ threadKey: 'dm:C5', modelText: '완료', activeRunShell: shell, artifacts: [] });
assert.deepEqual(smEmpty.deliverables, []);
const rEmpty = renderFounderSurfaceText({ surfaceModel: smEmpty, modelText: '완료' });
assert.ok(!rEmpty.text.includes('산출물:'), 'no deliverable trailer when none exist');

// model 이 이미 파일명을 언급하면 중복하지 않는다 (C4)
const rDup = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '정리했습니다. run-notes.md 와 review_summary.md 보시면 됩니다.',
});
assert.ok(!rDup.text.includes('산출물:'), 'skip trailer when model already names deliverables');

// Gap A 교차 가드: workcell_runtime 이 review_required 면 shell.status=completed 여도 completed 금지
const shellCrossGuard = {
  id: 'cos_5g',
  run_id: 'cos_5g',
  thread_key: 'dm:C5g',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_d5g',
    dispatch_id: 'd5g',
    status: 'review_required',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 1,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_rv', persona: 'pm', owner_persona: 'pm', status: 'review_required', review_required: true },
    ],
    summary_lines: ['사람 검토가 한 번 더 필요합니다.'],
  },
};
const smCrossGuard = buildFounderSurfaceModel({
  threadKey: 'dm:C5g',
  modelText: '완료라고 생각했지만 확인이 필요해 보입니다.',
  activeRunShell: shellCrossGuard,
});
assert.notEqual(smCrossGuard.surface_intent, 'completed', 'workcell review_required must not collapse to completed');
assert.equal(smCrossGuard.surface_intent, 'review_required');

console.log('test-founder-surface-completed: ok');
