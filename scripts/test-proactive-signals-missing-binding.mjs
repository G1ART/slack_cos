#!/usr/bin/env node
/**
 * W7-A regression #3 — missing_binding: active_project_space.bindings_compact_lines 에서
 * 필수 3종(repo_binding / deploy_binding / db_binding) 중 하나라도 없으면 신호가 발생한다.
 */

import assert from 'node:assert/strict';

import { buildProactiveSignals } from '../src/founder/proactiveSignals.js';

// 모두 없으면 3 kind 가 모두 missing 으로 언급됨
{
  const { signals } = buildProactiveSignals({
    active_project_space_slice: {
      project_space_key: 'space_a',
      binding_count: 0,
      open_human_gate_count: 0,
      bindings_compact_lines: [],
      open_human_gates_compact_lines: [],
    },
  });
  const mb = signals.find((s) => s.kind === 'missing_binding');
  assert.ok(mb);
  assert.equal(mb.severity, 'attention');
  assert.ok(mb.summary_line.includes('코드 저장소'));
  assert.ok(mb.summary_line.includes('배포'));
  assert.ok(mb.summary_line.includes('데이터베이스'));
  assert.deepEqual(mb.evidence.missing_binding_kinds, ['repo_binding', 'deploy_binding', 'db_binding']);
}

// repo + deploy 만 있고 db 없음
{
  const { signals } = buildProactiveSignals({
    active_project_space_slice: {
      project_space_key: 'space_b',
      binding_count: 2,
      open_human_gate_count: 0,
      bindings_compact_lines: [
        'repo_binding: org/repo_x',
        'deploy_binding: railway_prod',
      ],
      open_human_gates_compact_lines: [],
    },
  });
  const mb = signals.find((s) => s.kind === 'missing_binding');
  assert.ok(mb);
  assert.deepEqual(mb.evidence.missing_binding_kinds, ['db_binding']);
  assert.ok(!mb.summary_line.includes('코드 저장소'));
  assert.ok(mb.summary_line.includes('데이터베이스'));
}

// 모두 있으면 신호 없음
{
  const { signals } = buildProactiveSignals({
    active_project_space_slice: {
      project_space_key: 'space_c',
      binding_count: 3,
      open_human_gate_count: 0,
      bindings_compact_lines: [
        'repo_binding: org/repo_x',
        'deploy_binding: railway_prod',
        'db_binding: supabase_project_x',
      ],
      open_human_gates_compact_lines: [],
    },
  });
  assert.ok(!signals.some((s) => s.kind === 'missing_binding'));
}

// project_space_key 가 없으면 signal 없음
{
  const { signals } = buildProactiveSignals({
    active_project_space_slice: { project_space_key: null, bindings_compact_lines: [] },
  });
  assert.ok(!signals.some((s) => s.kind === 'missing_binding'));
}

console.log('test-proactive-signals-missing-binding: ok');
