import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getActiveRunForThread, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import {
  appendCosRunEvent,
  appendCosRunEventForRun,
  listRecentCosRunEventsForThread,
  listRecentCosRunEventsForRun,
  getLatestExternalRunEventsForThread,
  getLatestExternalRunEventsForRun,
  __resetCosRunEventsMemoryForTests,
} from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-thread-vs-run-view');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:vnext39_views:1';

await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_v_a',
    objective: 'a',
    packets: [{ packet_id: 'pv1', packet_status: 'ready', preferred_tool: 'cursor', preferred_action: 'create_spec', mission: 'm' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const ridA = String((await getActiveRunForThread(tk)).id);

await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_v_b',
    objective: 'b',
    packets: [{ packet_id: 'pv2', packet_status: 'ready', preferred_tool: 'cursor', preferred_action: 'create_spec', mission: 'm2' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const ridB = String((await getActiveRunForThread(tk)).id);
assert.notEqual(ridA, ridB);

await appendCosRunEventForRun(ridA, 'external_status_update', { on: 'A' });
await appendCosRunEvent(tk, 'external_completed', { on: 'active' });

const threadRows = await listRecentCosRunEventsForThread(tk, 20);
const runARows = await listRecentCosRunEventsForRun(ridA, 20);
assert.ok(threadRows.some((e) => e.payload && /** @type {any} */ (e.payload).on === 'active'));
assert.ok(!threadRows.some((e) => e.payload && /** @type {any} */ (e.payload).on === 'A'));
assert.ok(runARows.some((e) => e.payload && /** @type {any} */ (e.payload).on === 'A'));

const extThread = await getLatestExternalRunEventsForThread(tk, 20);
const extRunA = await getLatestExternalRunEventsForRun(ridA, 20);
assert.equal(extThread.length, 1);
assert.equal(extRunA.length, 1);
assert.equal(extRunA[0].event_type, 'external_status_update');

console.log('test-active-thread-view-does-not-pretend-to-cover-all-runs: ok');
