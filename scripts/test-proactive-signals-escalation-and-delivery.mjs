#!/usr/bin/env node
/**
 * W7-A regression #2 — unresolved_escalation + delivery_ready 가 workcell_runtime·surface_model 로부터
 * 정확히 도출되고, 동일 shape 에서 상호 배타적이어도 모두 독립적으로 산출된다.
 */

import assert from 'node:assert/strict';

import { buildProactiveSignals } from '../src/founder/proactiveSignals.js';

// A) unresolved_escalation: workcell_runtime 의 escalation_open 이 true
{
  const { signals } = buildProactiveSignals({
    active_run_shell: { id: 'r1', status: 'running', updated_at: new Date().toISOString() },
    workcell_runtime: {
      status: 'escalated',
      escalation_open: true,
      escalation_targets: ['owner', 'reviewer'],
    },
  });
  const esc = signals.find((s) => s.kind === 'unresolved_escalation');
  assert.ok(esc, 'escalation signal emitted');
  assert.equal(esc.severity, 'blocker');
  assert.ok(/에스컬레이션/.test(esc.summary_line));
}

// B) delivery_ready: surface_model completed + deliverables + no blocker
{
  const { signals } = buildProactiveSignals({
    active_run_shell: { id: 'r2', status: 'completed', updated_at: new Date().toISOString() },
    surface_model: {
      surface_intent: 'completed',
      deliverables: [{ label: 'bundle_a.zip' }, { label: 'report.md' }],
      blocker_reason: null,
      human_gate_required: false,
    },
  });
  const dr = signals.find((s) => s.kind === 'delivery_ready');
  assert.ok(dr, 'delivery_ready signal emitted');
  assert.equal(dr.severity, 'info');
  assert.ok(/산출물/.test(dr.summary_line));
  // 에스컬레이션 신호는 없어야 함
  assert.ok(!signals.some((s) => s.kind === 'unresolved_escalation'));
}

// C) delivery_ready 는 escalation_open 이 true 이면 suppressed
{
  const { signals } = buildProactiveSignals({
    active_run_shell: { id: 'r3', status: 'completed', updated_at: new Date().toISOString() },
    workcell_runtime: { status: 'escalated', escalation_open: true, escalation_targets: ['owner'] },
    surface_model: {
      surface_intent: 'completed',
      deliverables: [{ label: 'x' }],
      blocker_reason: null,
    },
  });
  assert.ok(!signals.some((s) => s.kind === 'delivery_ready'));
  assert.ok(signals.some((s) => s.kind === 'unresolved_escalation'));
}

console.log('test-proactive-signals-escalation-and-delivery: ok');
