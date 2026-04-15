import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { appendCosRunEvent, listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-events');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:C_ev:2.2';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_ev',
    objective: 'ev',
    packets: [{ packet_id: 'p1', packet_status: 'ready', preferred_tool: 'cursor', preferred_action: 'create_spec', mission: 'm' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

const rid = String(run.id);
await patchRunById(rid, { workspace_key: 'T_APPEND_EVT', product_key: 'prod_append' });
await appendCosRunEvent(tk, 'run_persisted', { synthetic: true });
await appendCosRunEvent(tk, 'external_status_update', { step: 1 });
await appendCosRunEvent(tk, 'external_completed', { step: 2 });

const evs = await listCosRunEventsForRun(rid, 10);
const types = evs.map((e) => e.event_type);
assert.ok(types.includes('run_persisted'));
assert.ok(types.includes('external_status_update'));
assert.ok(types.includes('external_completed'));

const completed = evs.find((e) => e.event_type === 'external_completed');
const pl = completed?.payload && typeof completed.payload === 'object' ? completed.payload : {};
assert.equal(String(pl.workspace_key || '').trim(), 'T_APPEND_EVT');
assert.equal(String(pl.product_key || '').trim(), 'prod_append');
assert.equal(String(pl.run_id || '').trim(), rid);

console.log('test-cos-run-events-append: ok');
