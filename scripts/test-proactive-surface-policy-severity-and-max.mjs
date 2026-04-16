#!/usr/bin/env node
/**
 * W10-A regression — proactiveSurfacePolicy: 심각도 필터 + max_surfaced + dedup.
 */

import assert from 'node:assert/strict';

import { applyProactiveSurfacePolicy } from '../src/founder/proactiveSurfacePolicy.js';

const signals = [
  { kind: 'stale_run', severity: 'attention', summary_line: '실행이 45분째 멈춰 있음' },
  { kind: 'unresolved_escalation', severity: 'blocker', summary_line: '해결되지 않은 에스컬레이션 2건' },
  { kind: 'missing_binding', severity: 'attention', summary_line: '프로젝트 공간에 필요한 연결이 아직 없음' },
  { kind: 'delivery_ready', severity: 'info', summary_line: '전달 준비 완료' },
  { kind: 'stale_run', severity: 'blocker', summary_line: '실행이 300분째 완전 정지 (dup kind)' },
];

const out = applyProactiveSurfacePolicy({ signals, max_surfaced: 2 });
assert.equal(out.selected_signals.length, 2, 'max_surfaced=2');
// blocker 가 먼저
assert.equal(out.selected_signals[0].kind, 'unresolved_escalation');
// stale_run dup 중 하나만 선택, info 는 탈락
const kinds = out.selected_signals.map((s) => s.kind);
assert.ok(kinds.includes('unresolved_escalation'));
assert.ok(kinds.includes('stale_run'));
// info severity 는 제외
assert.ok(!kinds.includes('delivery_ready'));
// suppression 사유에 severity_below_surface_threshold / duplicate_kind / max_surfaced_reached 등이 있어야 한다
const reasons = out.suppressed_signals.map((s) => s.reason);
assert.ok(reasons.includes('severity_below_surface_threshold'));
assert.ok(reasons.includes('duplicate_kind') || reasons.includes('max_surfaced_reached'));
assert.equal(out.compact_lines.length, 2);

console.log('test-proactive-surface-policy-severity-and-max: ok');
