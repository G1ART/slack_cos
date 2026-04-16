/**
 * W4 closeout Gap B — completed trailer is active-run-scoped.
 *
 * 같은 스레드에 과거 런의 아티팩트가 남아 있어도, 활성 런 식별이 가능하면 `scopeArtifactsToActiveRun`
 * 이 과거 런 행을 배제해야 한다. 그 결과 `buildFounderSurfaceModel` 의 `deliverables` trailer 는
 * **현재 활성 런** 파일명만 보여주고 과거 런 파일명은 새어 나오지 않는다.
 *
 * 또한 활성 런 식별이 없을 때(fallback 시나리오)는 기존 스레드 스코프 동작을 유지한다.
 */
import assert from 'node:assert/strict';
import { scopeArtifactsToActiveRun } from '../src/founder/runFounderDirectConversation.js';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const oldRunArtifact = {
  type: 'tool_result',
  payload: {
    tool: 'github',
    action: 'create_file',
    cos_run_id: 'cos_old',
    artifact_path: 'artifacts/old/old-run-output.md',
    result_summary: '과거 런의 산출물',
  },
};
const currentRunArtifactA = {
  type: 'tool_result',
  payload: {
    tool: 'github',
    action: 'create_file',
    cos_run_id: 'cos_current',
    artifact_path: 'artifacts/ops/current-notes.md',
    result_summary: '현재 런 노트',
  },
};
const currentRunArtifactB = {
  type: 'tool_result',
  payload: {
    tool: 'cursor',
    action: 'emit_patch',
    cos_run_id: 'cos_current',
    artifact_path: '/tmp/cursor/payload/current-review.md',
    result_summary: '현재 런 리뷰',
  },
};
const allThreadArtifacts = [oldRunArtifact, currentRunArtifactA, currentRunArtifactB];

// 1) 활성 런 식별이 있으면 과거 런 행이 제거된다.
const activeRow = {
  id: 'cos_current',
  dispatch_id: 'd_current',
  required_packet_ids: [],
  thread_key: 'dm:Cscope',
  status: 'completed',
};
const scoped = scopeArtifactsToActiveRun(allThreadArtifacts, activeRow);
const scopedPaths = scoped
  .map((a) => (a && a.payload ? String(a.payload.artifact_path || '') : ''))
  .filter(Boolean);
assert.ok(!scopedPaths.some((p) => p.includes('old-run-output.md')), `old-run artifact leaked: ${scopedPaths.join(',')}`);
assert.ok(scopedPaths.some((p) => p.includes('current-notes.md')), 'current-run artifact missing');
assert.ok(scopedPaths.some((p) => p.includes('current-review.md')), 'current-run artifact missing');

// 2) Surface model 의 deliverables trailer 는 활성 런 파일명만 보여준다.
const shell = {
  id: 'cos_current',
  run_id: 'cos_current',
  thread_key: 'dm:Cscope',
  status: 'completed',
  workcell_runtime: {
    workcell_id: 'wc_current',
    dispatch_id: 'd_current',
    status: 'completed',
    personas: ['pm'],
    packet_count: 1,
    review_checkpoint_count: 0,
    escalation_open: false,
    escalation_targets: [],
    packets: [
      { packet_id: 'pkt_c', persona: 'pm', owner_persona: 'pm', status: 'completed', review_required: false },
    ],
    summary_lines: ['현재 런 산출물을 남겼습니다.'],
  },
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:Cscope',
  modelText: '정리 완료했습니다.',
  activeRunShell: shell,
  artifacts: scoped,
});
const labels = sm.deliverables.map((d) => d.label);
assert.ok(labels.includes('current-notes.md'), `expected current-notes.md, got ${labels.join(',')}`);
assert.ok(labels.includes('current-review.md'), `expected current-review.md, got ${labels.join(',')}`);
assert.ok(!labels.includes('old-run-output.md'), `old-run deliverable leaked: ${labels.join(',')}`);

const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: '정리 완료했습니다.' });
assert.ok(r.text.includes('산출물:'), 'deliverables trailer present');
assert.ok(!/old-run-output\.md/.test(r.text), 'old-run filename must not appear in rendered surface');
assert.ok(r.text.includes('current-notes.md') || r.text.includes('current-review.md'), 'current-run deliverable appears');

// 3) 활성 런 식별이 없으면 기존 스레드 스코프 fallback 유지(그대로 통과).
const fallback = scopeArtifactsToActiveRun(allThreadArtifacts, null);
assert.equal(fallback.length, allThreadArtifacts.length, 'without active run, all thread artifacts pass through');

// 4) 활성 런이 있어도 id 가 비면 fallback 으로 스레드 스코프 유지.
const fallbackNoId = scopeArtifactsToActiveRun(allThreadArtifacts, { dispatch_id: 'd_x' });
assert.equal(fallbackNoId.length, allThreadArtifacts.length, 'without run id, fallback to thread scope');

console.log('test-founder-surface-completed-trailer-is-active-run-scoped: ok');
