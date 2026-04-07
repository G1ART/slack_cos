import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import {
  appendCosRunEventForRun,
  listCosRunEventsForRun,
  __resetCosRunEventsMemoryForTests,
} from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-events-evidence');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:C_evidence:3.3';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_ev2',
    objective: 'ev2',
    packets: [{ packet_id: 'p1', packet_status: 'ready', preferred_tool: 'cursor', preferred_action: 'create_spec', mission: 'm' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

const rid = String(run.id);
await appendCosRunEventForRun(
  rid,
  'external_completed',
  { step: 1 },
  {
    matched_by: 'external_run_id',
    canonical_status: 'positive_terminal',
    payload_fingerprint_prefix: 'deadbeefdeadbeef',
  },
);

const evs = await listCosRunEventsForRun(rid, 10);
const hit = evs.find((e) => e.event_type === 'external_completed');
assert.ok(hit);
assert.equal(hit.matched_by, 'external_run_id');
assert.equal(hit.canonical_status, 'positive_terminal');
assert.equal(hit.payload_fingerprint_prefix, 'deadbeefdeadbeef');

console.log('test-cos-run-events-persist-evidence-fields: ok');
