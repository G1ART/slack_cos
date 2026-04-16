/**
 * W4 — 동일 스레드 연속성: 직전 assistant 턴이 같은 헤더로 시작했다면 다음 턴에서 헤더를 생략한다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_7',
  run_id: 'cos_7',
  thread_key: 'dm:C7',
  status: 'running',
};

const sm = buildFounderSurfaceModel({ threadKey: 'dm:C7', modelText: '진행 상황을 이어서 붙잡고 있어요.', activeRunShell: shell });
assert.equal(sm.surface_intent, 'running');

// 첫 턴: 헤더 prepend
const r1 = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '진행 상황을 이어서 붙잡고 있어요.',
  recentTurns: [],
});
assert.ok(r1.text.startsWith('아직 실행이 진행 중입니다.'), 'first turn gets header');

// 두 번째 턴: 직전 assistant 턴이 같은 헤더로 시작 → 헤더 생략
const r2 = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '작업이 계속 이어지고 있어요.',
  recentTurns: [
    { role: 'user', text: '상황 공유해줘' },
    { role: 'assistant', text: r1.text },
  ],
});
assert.equal(r2.skipped_header_for_continuity, true, 'header skipped for continuity');
assert.equal(r2.rendered_by, 'model_passthrough');
assert.equal(r2.text, '작업이 계속 이어지고 있어요.');

// intent 가 바뀌면 (running → completed) 헤더 다시 등장
const completedShell = { ...shell, status: 'completed' };
const smCompleted = buildFounderSurfaceModel({ threadKey: 'dm:C7', modelText: '요약 끝냈어요.', activeRunShell: completedShell });
const r3 = renderFounderSurfaceText({
  surfaceModel: smCompleted,
  modelText: '요약 끝냈어요.',
  recentTurns: [{ role: 'assistant', text: r1.text }],
});
assert.ok(r3.text.startsWith('요청을 완료했습니다.'), 'new intent reintroduces header');

console.log('test-founder-surface-same-thread-continuity: ok');
