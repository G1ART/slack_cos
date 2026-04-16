/**
 * W4 — truth > model prose: 모델이 "완료" 라고 말해도 active_run_shell.status 가 blocked 면
 *       헤더는 blocked 로 확정되어야 한다. 가짜 완료(WHAT non-negotiable) 방지.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shellBlocked = {
  id: 'cos_9',
  run_id: 'cos_9',
  thread_key: 'dm:C9',
  status: 'blocked',
  workcell_runtime: { status: 'blocked', escalation_state: { status: 'blocked', reasons: ['외부 승인 대기 중'] } },
};

const modelProse = '모든 작업을 완료했습니다. 배포까지 끝났어요!';

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C9',
  modelText: modelProse,
  activeRunShell: shellBlocked,
});
assert.equal(sm.surface_intent, 'blocked');

const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: modelProse });
assert.ok(r.text.startsWith('현재 진행이 막혀 있습니다.'), 'truth-side blocked header overrides model prose');
assert.ok(r.text.includes('사유: 외부 승인 대기 중'), 'blocker reason from truth surfaces');
// 모델이 "완료" 라고 말해도 완료 헤더는 붙지 않는다
assert.ok(!r.text.startsWith('요청을 완료했습니다.'), 'model prose does not promote to completed');

// shell 이 없으면 informational (가짜 headers 를 끌어오지 않음)
const smNone = buildFounderSurfaceModel({ threadKey: 'dm:C9', modelText: modelProse, activeRunShell: null });
assert.equal(smNone.surface_intent, 'informational');
const rNone = renderFounderSurfaceText({ surfaceModel: smNone, modelText: modelProse });
assert.equal(rNone.rendered_by, 'model_passthrough');
assert.equal(rNone.text, modelProse);

console.log('test-founder-surface-truth-over-model-prose: ok');
