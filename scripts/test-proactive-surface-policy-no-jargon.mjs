#!/usr/bin/env node
/**
 * W10-A regression — 내부 jargon/secret 이 섞인 summary_line 은 policy 에서 탈락해야 한다.
 */

import assert from 'node:assert/strict';

import { applyProactiveSurfacePolicy } from '../src/founder/proactiveSurfacePolicy.js';

const signals = [
  {
    kind: 'stale_run',
    severity: 'attention',
    summary_line: '실행이 resolution_class=runtime_bug_or_regression 로 멈춤',
  },
  {
    kind: 'unresolved_escalation',
    severity: 'blocker',
    summary_line: 'run_id 84a1 에 에스컬레이션 2건 남음',
  },
  {
    kind: 'human_gate_required',
    severity: 'blocker',
    summary_line: 'OAuth 토큰 Bearer ghp_abcdef1234567890abcdef 가 만료되었습니다',
  },
  { kind: 'missing_binding', severity: 'attention', summary_line: '프로젝트 공간에 필요한 연결이 아직 없음' },
];

const out = applyProactiveSurfacePolicy({ signals, max_surfaced: 5 });
// 깨끗한 1건만 통과
assert.equal(out.selected_signals.length, 1);
assert.equal(out.selected_signals[0].kind, 'missing_binding');
const reasons = out.suppressed_signals.map((s) => s.reason);
const jargonCount = reasons.filter((r) => r === 'contains_internal_jargon').length;
assert.equal(jargonCount, 3);

// compact_lines 에도 jargon 없음
for (const line of out.compact_lines) {
  assert.ok(!/resolution_class|run_id|Bearer|ghp_|parcel_deployment_key|workcell_runtime/.test(line));
}

console.log('test-proactive-surface-policy-no-jargon: ok');
