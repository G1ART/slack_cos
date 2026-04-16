/**
 * W4 — completed surface: shell.status=completed → 헤더 prepend + 실제 artifact 기반 산출물 trailer.
 *       fabricate 금지: artifact_path 없으면 deliverables 가 비어야 한다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_5',
  run_id: 'cos_5',
  thread_key: 'dm:C5',
  status: 'completed',
};

const artifacts = [
  {
    type: 'tool_invocation',
    payload: { tool: 'cursor', action: 'emit_patch' },
  },
  {
    type: 'tool_result',
    payload: {
      tool: 'github',
      action: 'create_file',
      artifact_path: 'artifacts/ops/run-notes.md',
      result_summary: '운영 노트 초안 작성',
    },
  },
  {
    type: 'tool_result',
    payload: {
      tool: 'cursor',
      action: 'emit_patch',
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

console.log('test-founder-surface-completed: ok');
