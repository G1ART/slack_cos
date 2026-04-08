import assert from 'node:assert';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const tmp = path.join(__dirname, '..', '.runtime', 'test-smoke-summary-secrets');
const eventsDir = path.join(tmp, 'cos_run_events');
await fs.mkdir(eventsDir, { recursive: true });

const runId = 'run-secret-test';
const secretMarker = 'OPS_SUMMARY_LEAK_TEST_MARKER_XQ9Z7K';
const row = {
  event_type: 'ops_smoke_phase',
  payload: {
    smoke_session_id: 'sess_leak_test',
    phase: 'cursor_trigger_recorded',
    at: '2026-04-02T12:00:00Z',
    trigger: { nested_secret_field: secretMarker, url_like: 'https://internal.example/private/path' },
  },
  created_at: '2026-04-02T12:00:00Z',
};
await fs.writeFile(path.join(eventsDir, `${runId}.jsonl`), `${JSON.stringify(row)}\n`, 'utf8');

const script = path.join(__dirname, 'summarize-ops-smoke-sessions.mjs');
const r = spawnSync(process.execPath, [script, '--store', 'file', '--state-dir', tmp, '--run-id', runId], {
  encoding: 'utf8',
});
assert.equal(r.status, 0, r.stderr || r.stdout);
const stdout = String(r.stdout || '');
assert.ok(stdout.includes('sess_leak_test'), 'session id visible');
assert.ok(!stdout.includes(secretMarker), 'summary must not echo nested payload secrets');
assert.ok(!stdout.includes('internal.example'), 'summary must not echo URL host from payload');

console.log('test-smoke-summary-does-not-expose-raw-secrets: ok');
