import assert from 'node:assert';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendCosRunEventForRun, listOpsSmokePhaseEventsForSummary, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const suffix = crypto.randomBytes(6).toString('hex');
const tmp = path.join(__dirname, '..', '.runtime', `test-smoke-summary-file-${suffix}`);
await fs.mkdir(tmp, { recursive: true });

process.env.COS_RUN_STORE = 'file';
process.env.COS_RUNTIME_STATE_DIR = tmp;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunEventsMemoryForTests();

const runId = `run-smoke-file-${suffix}`;
await appendCosRunEventForRun(runId, 'ops_smoke_phase', {
  smoke_session_id: 'sess_f1',
  phase: 'cursor_trigger_recorded',
  at: '2026-04-02T10:00:01.000Z',
  thread_key: 'tk1',
});
await appendCosRunEventForRun(runId, 'ops_smoke_phase', {
  smoke_session_id: 'sess_f1',
  phase: 'external_run_id_extracted',
  at: '2026-04-02T10:00:02.000Z',
});

const rows = await listOpsSmokePhaseEventsForSummary({
  modeOverride: 'file',
  runtimeStateDir: tmp,
  runId,
  maxRows: 50,
});
assert.equal(rows.length, 2);
assert.ok(rows.every((r) => r.event_type === 'ops_smoke_phase'));

const summaries = summarizeOpsSmokeSessionsFromFlatRows(rows, { sessionLimit: 5 });
assert.equal(summaries.length, 1);
assert.equal(summaries[0].smoke_session_id, 'sess_f1');
assert.equal(summaries[0].run_id, runId);
assert.ok(summaries[0].phases_seen.includes('cursor_trigger_recorded'));
assert.ok(summaries[0].phases_seen.includes('external_run_id_extracted'));

console.log('test-smoke-summary-file-mode: ok');
