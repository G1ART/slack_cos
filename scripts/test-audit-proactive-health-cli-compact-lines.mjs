#!/usr/bin/env node
/**
 * W7-A regression #6 — audit-proactive-health CLI.
 *  - fixture 모드가 JSON 덤프를 정확히 내보낸다
 *  - compact_lines 가 기대 kind 집합을 포함한다
 *  - 환경 미설정 + fixture 없음 → skipped 상태로 exit 0
 */

import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = process.cwd();
const CLI = path.join(ROOT, 'scripts/audit-proactive-health.mjs');

// 1) fixture 로 compact_lines 회귀
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-proactive-'));
const fixturePath = path.join(tmpDir, 'in.json');
const fixture = {
  active_run_shell: {
    id: 'run_1',
    status: 'running',
    updated_at: '2026-04-16T20:00:00.000Z',
    project_space_key: 'space_a',
    workcell_runtime: {
      status: 'escalated',
      escalation_open: true,
      escalation_targets: ['owner'],
    },
  },
  active_project_space_slice: {
    project_space_key: 'space_a',
    binding_count: 1,
    open_human_gate_count: 1,
    bindings_compact_lines: ['repo_binding: org/x'],
    open_human_gates_compact_lines: ['gate: missing_binding'],
  },
  now_iso: '2026-04-16T20:45:00.000Z',
};
fs.writeFileSync(fixturePath, JSON.stringify(fixture));

const res1 = spawnSync('node', [CLI, '--fixture', fixturePath, '--json', '--stale-run-minutes', '30'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
});
assert.equal(res1.status, 0, `stderr: ${res1.stderr}`);
const body1 = JSON.parse(res1.stdout);
assert.equal(body1.ok, true);
assert.deepEqual(body1.signal_kinds, [
  'stale_run',
  'unresolved_escalation',
  'missing_binding',
  'delivery_ready',
  'human_gate_required',
  'multi_project_health',
]);
assert.ok(Array.isArray(body1.compact_lines));
assert.ok(body1.compact_lines.some((l) => l.startsWith('[stale_run]')));
assert.ok(body1.compact_lines.some((l) => l.startsWith('[unresolved_escalation]')));
assert.ok(body1.compact_lines.some((l) => l.startsWith('[missing_binding]')));
assert.ok(body1.compact_lines.some((l) => l.startsWith('[human_gate_required]')));

// 2) fixture 없이 Supabase 자격 미설정 → skipped exit 0
const res2 = spawnSync('node', [CLI, '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '' },
});
assert.equal(res2.status, 0, `stderr: ${res2.stderr}`);
const body2 = JSON.parse(res2.stdout);
assert.equal(body2.skipped, true);
assert.equal(body2.reason, 'no_supabase_credentials');

// 3) fixture 가 없으면 --fixture 경로가 실패로 끝난다 (exit 2)
const missingFixture = path.join(tmpDir, 'missing.json');
const res3 = spawnSync('node', [CLI, '--fixture', missingFixture, '--json'], {
  cwd: ROOT,
  encoding: 'utf8',
});
assert.equal(res3.status, 2);

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log('test-audit-proactive-health-cli-compact-lines: ok');
