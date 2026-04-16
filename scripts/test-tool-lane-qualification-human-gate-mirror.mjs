#!/usr/bin/env node
/**
 * W7-B regression #4 — human_gate_required mirror.
 *
 *  - surface_model.human_gate_required=true 면 모든 lane qualification 의 mirror 가 true
 *  - surface_model 이 없어도 latest_precheck 가 hil 계열 resolution_class 면 해당 lane mirror 가 true
 *  - 비-hil resolution_class(예: provider_transient_failure) 는 mirror 켜지지 않음
 */

import assert from 'node:assert/strict';

import { buildToolLaneQualifications } from '../src/founder/toolPlane/toolLaneQualification.js';

// 1) surface_model.human_gate_required=true → 전 lane mirror=true
{
  const quals = await buildToolLaneQualifications({
    env: {},
    surface_model: { human_gate_required: true, human_gate_reason: 'r', human_gate_action: 'a' },
    latest_precheck_by_tool: {},
  });
  for (const q of quals) {
    assert.equal(q.human_gate_required_mirror, true);
  }
}

// 2) hil 계열 resolution_class → 해당 lane 만 mirror=true
{
  const quals = await buildToolLaneQualifications({
    env: {},
    surface_model: null,
    latest_precheck_by_tool: {
      github: {
        blocked: true,
        blocked_reason: 'authorize the GitHub app',
        next_required_input: null,
      },
    },
  });
  const gh = quals.find((q) => q.tool === 'github');
  assert.ok(gh);
  assert.equal(gh.human_gate_required_mirror, true);
  for (const q of quals) {
    if (q.tool !== 'github') {
      assert.equal(q.human_gate_required_mirror, false, `${q.tool} should not mirror`);
    }
  }
}

// 3) provider transient → mirror 꺼짐
{
  const quals = await buildToolLaneQualifications({
    env: {},
    surface_model: null,
    latest_precheck_by_tool: {
      supabase: {
        blocked: true,
        blocked_reason: 'temporary 503 from upstream',
        next_required_input: null,
        failure_classification: { resolution_class: 'provider_transient_failure' },
      },
    },
  });
  const sb = quals.find((q) => q.tool === 'supabase');
  assert.ok(sb);
  assert.equal(sb.latest_precheck_resolution_class, 'provider_transient_failure');
  assert.equal(sb.human_gate_required_mirror, false);
}

console.log('test-tool-lane-qualification-human-gate-mirror: ok');
