/**
 * W4 — accepted surface: active run shell status=accepted 일 때 intent=accepted + 헤더 prepend.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const shell = {
  id: 'cos_1',
  run_id: 'cos_1',
  thread_key: 'dm:C1',
  status: 'accepted',
  workspace_key: 'T0',
  product_key: 'g1',
  project_space_key: 'ps',
  parcel_deployment_key: 'pdk',
};

const sm = buildFounderSurfaceModel({
  threadKey: 'dm:C1',
  modelText: '요청 잘 받았어요. 바로 팀에 연결해 볼게요.',
  activeRunShell: shell,
  readModel: { tenancy_slice: {}, workcell_summary_lines: [] },
  artifacts: [],
  recentTurns: [],
});

assert.equal(sm.surface_intent, 'accepted');
assert.equal(sm.workspace_key, 'T0');
assert.equal(sm.product_key, 'g1');
assert.deepEqual(sm.deliverables, []);

const r = renderFounderSurfaceText({
  surfaceModel: sm,
  modelText: '요청 잘 받았어요. 바로 팀에 연결해 볼게요.',
  recentTurns: [],
});

assert.equal(r.rendered_by, 'surface_state');
assert.ok(r.text.startsWith('요청을 접수했습니다.'), `expected accepted header, got: ${r.text.slice(0, 40)}`);
assert.ok(r.text.includes('요청 잘 받았어요'), 'model text preserved below header');

console.log('test-founder-surface-accepted: ok');
