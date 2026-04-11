/**
 * vNext.13.74 — Trigger JSON { success, backgroundComposerId } only: invoice id = local request_id;
 * backgroundComposerId is provider_run_hint only (never accepted_external_id).
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { extractAutomationResponseFields } from '../src/founder/cursorCloudAdapter.js';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import {
  recordOpsSmokeCursorTrigger,
  summarizeOpsSmokeSessionsFromFlatRows,
  tailExternalRunId,
} from '../src/founder/smokeOps.js';

const parsed = { success: true, backgroundComposerId: 'bgcomposer_smoke_value_12345' };
const localReq = 'req_invoice_local_1374';
const ex = extractAutomationResponseFields(parsed, {}, { localTriggerRequestId: localReq });
assert.equal(ex.has_run_id, false);
assert.equal(ex.external_run_id, null);
assert.equal(ex.has_accepted_external_id, true);
assert.equal(ex.selected_accepted_id_field_name, 'local_trigger_request_id');
assert.equal(ex.accepted_external_id, localReq);
assert.equal(ex.provider_run_hint, 'bgcomposer_smoke_value_12345');

const exNoLocal = extractAutomationResponseFields(parsed, {});
assert.equal(exNoLocal.has_accepted_external_id, false);
assert.equal(exNoLocal.accepted_external_id, null);
assert.equal(exNoLocal.provider_run_hint, 'bgcomposer_smoke_value_12345');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-bg-composer-id');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:bgcomposer:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: { ok: true, status: 'accepted', dispatch_id: 'd_bg', objective: 'o', packets: [] },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid = String(run.id);

await recordOpsSmokeCursorTrigger({
  env: process.env,
  runId: rid,
  threadKey: tk,
  smoke_session_id: 'sess_bg_composer',
  tr: {
    ok: true,
    status: 200,
    trigger_status: 'accepted',
    external_run_id: null,
    accepted_external_id: ex.accepted_external_id,
    has_accepted_external_id: ex.has_accepted_external_id,
    selected_accepted_id_field_name: ex.selected_accepted_id_field_name,
    response_top_level_keys: ['success', 'backgroundComposerId'],
    has_run_id: false,
    has_status: false,
    has_url: false,
    provider_run_hint: ex.provider_run_hint,
  },
});

const evs = await listCosRunEventsForRun(rid, 40);
const phases = evs.filter((e) => e.event_type === 'ops_smoke_phase').map((e) => String(e.payload?.phase || ''));
assert.ok(phases.includes('trigger_accepted_external_id_present'));

const flatRows = evs
  .filter((e) => e.event_type === 'ops_smoke_phase')
  .map((e) => ({
    run_id: rid,
    event_type: 'ops_smoke_phase',
    payload: e.payload && typeof e.payload === 'object' ? e.payload : {},
    created_at: e.created_at != null ? String(e.created_at) : '',
  }));
const sums = summarizeOpsSmokeSessionsFromFlatRows(flatRows, { sessionLimit: 5 });
assert.equal(sums[0].has_accepted_external_id, true);
assert.equal(sums[0].selected_accepted_id_field_name, 'local_trigger_request_id');
assert.equal(sums[0].accepted_external_id, tailExternalRunId(localReq));

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_RUN_STORE;

console.log('test-trigger-response-background-composer-id-recorded-as-accepted-external-id: ok');
