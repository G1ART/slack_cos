#!/usr/bin/env node
/**
 * W7-B regression #3 — resolution_class roll-up: latest_precheck_by_tool 에 blocked 결과가
 * 들어오면 W5-A classifier 를 통해 latest_precheck_resolution_class 가 채워진다.
 * 또한 이미 제공된 failure_classification.resolution_class 가 알려진 enum 이면 그대로 쓰인다.
 */

import assert from 'node:assert/strict';

import { buildToolLaneQualifications } from '../src/founder/toolPlane/toolLaneQualification.js';
import { FAILURE_RESOLUTION_CLASSES } from '../src/founder/failureTaxonomy.js';

const KNOWN = new Set(FAILURE_RESOLUTION_CLASSES);

// A) 제공된 classification.resolution_class 가 그대로 쓰임
{
  const quals = await buildToolLaneQualifications({
    env: {},
    latest_precheck_by_tool: {
      github: {
        blocked: true,
        blocked_reason: 'org install missing',
        next_required_input: 'GITHUB_TOKEN',
        failure_classification: { resolution_class: 'hil_required_external_auth' },
      },
    },
    surface_model: null,
  });
  const gh = quals.find((q) => q.tool === 'github');
  assert.ok(gh);
  assert.equal(gh.latest_precheck_resolution_class, 'hil_required_external_auth');
  assert.ok(KNOWN.has(gh.latest_precheck_resolution_class));
  assert.equal(gh.human_gate_required_mirror, true, 'hil class → mirror on');
}

// B) classification 없이 blocked_reason 만 주어지면 LANE_STATIC_RESOLUTION_HINTS + 휴리스틱으로 유도
{
  const quals = await buildToolLaneQualifications({
    env: {},
    latest_precheck_by_tool: {
      supabase: {
        blocked: true,
        blocked_reason: 'Supabase project billing quota exceeded',
        next_required_input: null,
      },
    },
    surface_model: null,
  });
  const sb = quals.find((q) => q.tool === 'supabase');
  assert.ok(sb);
  assert.ok(sb.latest_precheck_resolution_class, 'heuristic filled');
  assert.ok(KNOWN.has(sb.latest_precheck_resolution_class));
}

// C) blocked=false → resolution_class 없음
{
  const quals = await buildToolLaneQualifications({
    env: {},
    latest_precheck_by_tool: {
      github: { blocked: false, blocked_reason: null, next_required_input: null },
    },
    surface_model: null,
  });
  const gh = quals.find((q) => q.tool === 'github');
  assert.equal(gh.latest_precheck_resolution_class, null);
}

// D) 알 수 없는 resolution_class 문자열이면 sanity 통과 시에도 무시됨(버림·재분류)
{
  const quals = await buildToolLaneQualifications({
    env: {},
    latest_precheck_by_tool: {
      github: {
        blocked: true,
        blocked_reason: 'something weird',
        next_required_input: null,
        failure_classification: { resolution_class: 'totally_made_up_class' },
      },
    },
    surface_model: null,
  });
  const gh = quals.find((q) => q.tool === 'github');
  assert.ok(!gh.latest_precheck_resolution_class || KNOWN.has(gh.latest_precheck_resolution_class));
}

console.log('test-tool-lane-qualification-resolution-class: ok');
