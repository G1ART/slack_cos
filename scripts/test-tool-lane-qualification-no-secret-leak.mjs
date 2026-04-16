#!/usr/bin/env node
/**
 * W7-B regression #5 — no secret leak.
 *
 * 환경에 시크릿 값이 들어있어도 buildToolLaneQualifications / formatToolQualificationSummaryLines /
 * buildToolQualificationSummaryLines 결과 텍스트에 그 시크릿 원시값이 절대 포함되어선 안 된다.
 *
 * 또한 founder-facing 토큰(`resolution_class`, `human_gate_required`) 도 노출되지 않는다.
 */

import assert from 'node:assert/strict';

import {
  buildToolLaneQualifications,
  formatToolQualificationSummaryLines,
  buildToolQualificationSummaryLines,
} from '../src/founder/toolPlane/toolLaneQualification.js';

const SECRET_TOKEN = 'ghp_1234567890abcdefghijklmnopqrstuvwx';
const SUPABASE_KEY = 'eyJ.SECRET_PAYLOAD.value_xyz_DO_NOT_LEAK';

const env = {
  GITHUB_TOKEN: SECRET_TOKEN,
  GITHUB_REPOSITORY: 'org/repo',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: SUPABASE_KEY,
};

const quals = await buildToolLaneQualifications({
  env,
  latest_precheck_by_tool: {
    github: {
      blocked: true,
      blocked_reason: `cannot reach api.github.com — invalid token starting with ${SECRET_TOKEN.slice(0, 8)}…`,
      next_required_input: null,
      failure_classification: { resolution_class: 'hil_required_external_auth' },
    },
  },
  surface_model: { human_gate_required: true, human_gate_reason: 'r', human_gate_action: 'a' },
});

const lines = formatToolQualificationSummaryLines(quals, 12);
const merged = JSON.stringify(quals) + '\n' + lines.join('\n');

const FORBIDDEN_RAW = [SECRET_TOKEN, SUPABASE_KEY];
for (const token of FORBIDDEN_RAW) {
  assert.ok(!merged.includes(token), `must not leak raw secret: ${token.slice(0, 12)}…`);
}

// founder-facing jargon 도 compact lines 본문에 그대로 흘리지 않는다(단, internal class= 태그는 허용)
const FORBIDDEN_PHRASES_IN_LINES = [
  'human_gate_required',
  'resolution_class=',
  '"human_gate_action"',
];
for (const phrase of FORBIDDEN_PHRASES_IN_LINES) {
  for (const l of lines) {
    assert.ok(!l.includes(phrase), `compact line must not contain "${phrase}": ${l}`);
  }
}

// buildToolQualificationSummaryLines (handler 가 호출하는 경로) 도 동일
const lines2 = await buildToolQualificationSummaryLines({
  env,
  latest_precheck_by_tool: {
    supabase: {
      blocked: true,
      blocked_reason: 'project billing quota exceeded',
      next_required_input: null,
    },
  },
  surface_model: null,
  max: 8,
});
const merged2 = lines2.join('\n');
for (const token of FORBIDDEN_RAW) {
  assert.ok(!merged2.includes(token), `summary lines must not leak raw secret: ${token.slice(0, 12)}…`);
}

console.log('test-tool-lane-qualification-no-secret-leak: ok');
