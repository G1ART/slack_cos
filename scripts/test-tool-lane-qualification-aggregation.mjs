#!/usr/bin/env node
/**
 * W7-B regression #2 — aggregation: readiness + precheck + surface_model 이
 * 각 레인 qualification 으로 올바르게 roll-up 된다(기존 readiness shape 보존).
 */

import assert from 'node:assert/strict';

import { buildToolLaneQualifications } from '../src/founder/toolPlane/toolLaneQualification.js';

const quals = await buildToolLaneQualifications({
  env: {},
  latest_precheck_by_tool: {},
  surface_model: {
    human_gate_required: true,
    human_gate_reason: 'GitHub 조직 승인 대기',
    human_gate_action: 'org admin 에게 레포 생성 권한을 요청해 주세요.',
  },
});

// 모든 레인에 surface_model 의 human_gate mirror 가 반영되어야 함
for (const q of quals) {
  assert.equal(q.human_gate_required_mirror, true, `${q.tool} mirror`);
  assert.equal(q.human_gate_reason, 'GitHub 조직 승인 대기');
  assert.equal(q.human_gate_action, 'org admin 에게 레포 생성 권한을 요청해 주세요.');
}

// declared 순서 정렬 — 모두 선언된 경우 알파벳 순
for (let i = 1; i < quals.length; i += 1) {
  if (quals[i - 1].declared === quals[i].declared) {
    assert.ok(quals[i - 1].tool.localeCompare(quals[i].tool) <= 0, 'declared 레인은 알파벳 순');
  } else {
    assert.ok(quals[i - 1].declared && !quals[i].declared, 'declared 레인이 먼저 옴');
  }
}

// surface_model 없이도 readiness shape 은 유지
const quals2 = await buildToolLaneQualifications({ env: {}, latest_precheck_by_tool: {}, surface_model: null });
for (const q of quals2) {
  assert.equal(q.human_gate_required_mirror, false, `${q.tool} mirror default`);
  assert.equal(q.human_gate_reason, null);
  assert.equal(q.human_gate_action, null);
}

console.log('test-tool-lane-qualification-aggregation: ok');
