#!/usr/bin/env node
/**
 * W7-A regression #1 — stale_run: running 상태에서 updated_at 이 임계를 넘겨 정지로 보이는 경우
 * PROACTIVE_SIGNAL_KINDS 에 정의된 stale_run 신호가 발생한다.
 */

import assert from 'node:assert/strict';

import { buildProactiveSignals, PROACTIVE_SIGNAL_KINDS } from '../src/founder/proactiveSignals.js';

assert.deepEqual(PROACTIVE_SIGNAL_KINDS, [
  'stale_run',
  'unresolved_escalation',
  'missing_binding',
  'delivery_ready',
  'human_gate_required',
  'multi_project_health',
]);

// running, 45 분 전 업데이트
const shell = {
  id: 'run_stale',
  status: 'running',
  updated_at: '2026-04-16T20:00:00.000Z',
  workcell_runtime: null,
};
const { signals, compact_lines } = buildProactiveSignals({
  active_run_shell: shell,
  now_iso: '2026-04-16T20:45:00.000Z',
  stale_run_minutes: 30,
});
const stale = signals.find((s) => s.kind === 'stale_run');
assert.ok(stale, 'stale_run signal emitted');
assert.equal(stale.severity, 'attention');
assert.ok(stale.summary_line.includes('45분') || stale.summary_line.includes('44분'));
assert.ok(compact_lines.some((l) => l.startsWith('[stale_run]')));

// running 이지만 10 분 전 업데이트 — stale 이 아님
const fresh = buildProactiveSignals({
  active_run_shell: { ...shell, updated_at: '2026-04-16T20:35:00.000Z' },
  now_iso: '2026-04-16T20:45:00.000Z',
  stale_run_minutes: 30,
});
assert.ok(!fresh.signals.some((s) => s.kind === 'stale_run'));

// completed 상태는 stale 이 아님
const completed = buildProactiveSignals({
  active_run_shell: { ...shell, status: 'completed' },
  now_iso: '2026-04-16T21:00:00.000Z',
  stale_run_minutes: 30,
});
assert.ok(!completed.signals.some((s) => s.kind === 'stale_run'));

console.log('test-proactive-signals-stale-run: ok');
