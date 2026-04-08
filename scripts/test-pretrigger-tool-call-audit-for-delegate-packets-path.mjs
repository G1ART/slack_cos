/**
 * vNext.13.46 — Delegate path audit rows (memory orphan when no run id).
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordCosPretriggerAudit } from '../src/founder/pretriggerAudit.js';
import { listOpsSmokePhaseEventsForSummary, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-pretrigger-audit-delegate');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';

__resetCosRunEventsMemoryForTests();

const args = {
  objective: 'test',
  personas: null,
  tasks: null,
  deliverables: null,
  constraints: null,
  success_criteria: null,
  risks: null,
  review_checkpoints: null,
  open_questions: null,
  packets: [{ bad: true }],
};

await recordCosPretriggerAudit({
  env: process.env,
  threadKey: 'mention:no_run:1',
  runId: '',
  smoke_session_id: 'sess_delegate_audit',
  call_name: 'delegate_harness_team',
  args,
  blocked: false,
});

await recordCosPretriggerAudit({
  env: process.env,
  threadKey: 'mention:no_run:1',
  runId: '',
  smoke_session_id: 'sess_delegate_audit',
  call_name: 'delegate_harness_team',
  args,
  blocked: true,
  blocked_reason: 'invalid_payload',
  machine_hint: 'target path unresolved',
  missing_required_fields: ['live_patch.path'],
});

const rows = await listOpsSmokePhaseEventsForSummary({ modeOverride: 'memory', maxRows: 50 });
assert.ok(rows.length >= 2);
const blocked = rows.find((r) => r.event_type === 'cos_pretrigger_tool_call_blocked');
assert.ok(blocked);
assert.equal(blocked.payload?.call_name, 'delegate_harness_team');
assert.equal(blocked.payload?.delegate_packets_present, true);
assert.ok(blocked.payload?.delegate_packets_count >= 1);

delete process.env.COS_OPS_SMOKE_ENABLED;

console.log('test-pretrigger-tool-call-audit-for-delegate-packets-path: ok');
