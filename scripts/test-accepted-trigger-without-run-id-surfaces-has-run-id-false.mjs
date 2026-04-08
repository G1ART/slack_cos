/**
 * vNext.13.48 — HTTP-accepted trigger with no extractable run id → absent phase + summary has_run_id false + explicit final_status.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import {
  recordOpsSmokeCursorTrigger,
  summarizeOpsSmokeSessionsFromFlatRows,
} from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-trigger-no-runid');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:trigger:no_runid:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_nr',
    objective: 'o',
    packets: [],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

const rid = String(run.id);
await recordOpsSmokeCursorTrigger({
  env: process.env,
  runId: rid,
  threadKey: tk,
  smoke_session_id: 'sess_no_run',
  tr: {
    ok: true,
    status: 200,
    trigger_status: 'accepted',
    external_run_id: null,
    external_url: null,
    response_top_level_keys: ['message', 'queued'],
    has_run_id: false,
    has_status: true,
    has_url: false,
    selected_run_id_field_name: null,
    selected_status_field_name: 'message',
    selected_url_field_name: null,
    automation_status_raw: 'queued',
  },
});

const evs = await listCosRunEventsForRun(rid, 40);
const phases = evs.filter((e) => e.event_type === 'ops_smoke_phase').map((e) => String(e.payload?.phase || ''));
assert.ok(phases.includes('cursor_trigger_recorded'));
assert.ok(phases.includes('trigger_accepted_external_run_id_absent'));
assert.ok(!phases.includes('external_run_id_extracted'));

const flatRows = evs
  .filter((e) => e.event_type === 'ops_smoke_phase')
  .map((e) => ({
    run_id: rid,
    event_type: 'ops_smoke_phase',
    payload: e.payload && typeof e.payload === 'object' ? e.payload : {},
    created_at: e.created_at != null ? String(e.created_at) : '',
  }));

const sums = summarizeOpsSmokeSessionsFromFlatRows(flatRows, { sessionLimit: 5 });
assert.equal(sums[0].final_status, 'trigger_accepted_external_run_id_missing');
assert.equal(sums[0].has_run_id, false);

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_RUN_STORE;

console.log('test-accepted-trigger-without-run-id-surfaces-has-run-id-false: ok');
