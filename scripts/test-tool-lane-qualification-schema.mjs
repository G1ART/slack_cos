#!/usr/bin/env node
/**
 * W7-B regression #1 — schema: buildToolLaneQualifications 가 고정 필드 shape 를 반환하고
 * listQualifiableLaneNames 가 알려진 레인 이름을 돌려준다.
 */

import assert from 'node:assert/strict';

import {
  buildToolLaneQualifications,
  formatToolQualificationSummaryLines,
  listQualifiableLaneNames,
} from '../src/founder/toolPlane/toolLaneQualification.js';

// lane registry 와 정합 — 최소 github/supabase/cursor/railway 는 포함
const names = listQualifiableLaneNames();
for (const n of ['github', 'supabase', 'cursor', 'railway']) {
  assert.ok(names.includes(n), `lane ${n} declared`);
}

const quals = await buildToolLaneQualifications({ env: {}, latest_precheck_by_tool: {}, surface_model: null });
assert.ok(Array.isArray(quals));
assert.ok(quals.length >= 4);

const REQUIRED_KEYS = [
  'tool',
  'declared',
  'live_capable',
  'configured',
  'reason',
  'missing',
  'latest_precheck_resolution_class',
  'human_gate_required_mirror',
  'human_gate_reason',
  'human_gate_action',
];
for (const q of quals) {
  for (const k of REQUIRED_KEYS) {
    assert.ok(Object.prototype.hasOwnProperty.call(q, k), `qualification entry missing key: ${k}`);
  }
  assert.equal(typeof q.tool, 'string');
  assert.equal(typeof q.live_capable, 'boolean');
  assert.equal(typeof q.human_gate_required_mirror, 'boolean');
  assert.ok(Array.isArray(q.missing));
}

const lines = formatToolQualificationSummaryLines(quals, 8);
assert.ok(Array.isArray(lines));
assert.ok(lines.length >= 4);
for (const l of lines) {
  assert.equal(typeof l, 'string');
  assert.ok(l.length > 0);
}

console.log('test-tool-lane-qualification-schema: ok');
