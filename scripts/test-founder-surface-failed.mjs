/**
 * W4 — failed surface: shell.status=failed → intent=failed + 헤더; 산출물·근거 trailer 는 붙지 않는다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_6',
  run_id: 'cos_6',
  thread_key: 'dm:C6',
  status: 'failed',
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C6',
  modelText: '이번 실행은 중단됐습니다. 필요한 재시도 경로를 정리해 봤어요.',
  activeRunShell: shell,
  artifacts: [
    {
      type: 'tool_result',
      payload: { tool: 'github', action: 'push', artifact_path: 'artifacts/failed-push.log', result_summary: '푸시 실패' },
    },
  ],
});

assert.equal(sm.surface_intent, 'failed');
const r = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '이번 실행은 중단됐습니다. 필요한 재시도 경로를 정리해 봤어요.',
});

assert.ok(r.text.startsWith('실행이 실패로 마감됐습니다.'), 'failed header');
assert.ok(!r.text.includes('산출물:'), 'completed-only trailer does not leak into failed');
assert.ok(!r.text.includes('확인 근거:'), 'review-only trailer does not leak into failed');

console.log('test-founder-surface-failed: ok');
