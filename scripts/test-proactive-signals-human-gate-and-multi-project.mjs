#!/usr/bin/env node
/**
 * W7-A regression #4 — human_gate_required mirror + multi_project_health divergence.
 *  - surface_model.human_gate_required=true 일 때 mirror 신호 발생
 *  - surface_model 이 없으면 active_project_space.open_human_gate_count 로 fallback
 *  - 최근 run shells 에 두 개 이상 다른 project_space_key 가 있고
 *    하나는 running, 다른 하나는 blocked 이면 multi_project_health 신호 발생
 */

import assert from 'node:assert/strict';

import { buildProactiveSignals } from '../src/founder/proactiveSignals.js';

// A) surface_model mirror
{
  const { signals } = buildProactiveSignals({
    surface_model: {
      surface_intent: 'blocked',
      human_gate_required: true,
      human_gate_reason: 'GitHub 조직 승인 대기',
      human_gate_action: 'org admin 에게 레포 생성 권한을 요청해 주세요.',
    },
  });
  const hg = signals.find((s) => s.kind === 'human_gate_required');
  assert.ok(hg);
  assert.equal(hg.severity, 'blocker');
  assert.ok(hg.summary_line.includes('org admin'));
}

// B) fallback via active_project_space.open_human_gate_count
{
  const { signals } = buildProactiveSignals({
    active_project_space_slice: {
      project_space_key: 'sp',
      binding_count: 3,
      open_human_gate_count: 2,
      bindings_compact_lines: [
        'repo_binding: x',
        'deploy_binding: y',
        'db_binding: z',
      ],
      open_human_gates_compact_lines: ['gate_1', 'gate_2'],
    },
  });
  const hg = signals.find((s) => s.kind === 'human_gate_required');
  assert.ok(hg);
  assert.ok(/2건/.test(hg.summary_line));
}

// C) multi_project_health: 두 공간 중 한쪽 running / 다른 쪽 blocked
{
  const { signals } = buildProactiveSignals({
    active_run_shell: {
      id: 'r_active', status: 'running', updated_at: new Date().toISOString(),
      project_space_key: 'space_a',
    },
    recent_run_shells: [
      { id: 'r_other', status: 'blocked', project_space_key: 'space_b' },
    ],
  });
  const m = signals.find((s) => s.kind === 'multi_project_health');
  assert.ok(m);
  assert.equal(m.severity, 'attention');
  assert.ok(/2/.test(m.summary_line));
}

// D) 단일 공간이면 multi_project_health 없음
{
  const { signals } = buildProactiveSignals({
    active_run_shell: {
      id: 'r1', status: 'running', updated_at: new Date().toISOString(),
      project_space_key: 'space_a',
    },
    recent_run_shells: [
      { id: 'r2', status: 'blocked', project_space_key: 'space_a' },
    ],
  });
  assert.ok(!signals.some((s) => s.kind === 'multi_project_health'));
}

console.log('test-proactive-signals-human-gate-and-multi-project: ok');
