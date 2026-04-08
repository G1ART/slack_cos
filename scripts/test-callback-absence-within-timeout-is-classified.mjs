import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { appendCosRunEventForRun, listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { maybeRecordOpsSmokeCursorCallbackAbsence } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cb-absence');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_CURSOR_CALLBACK_ABSENCE_TIMEOUT_SEC = '1';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:cb_absence:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_abs',
    objective: 'o',
    packets: [
      {
        packet_id: 'p1',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid = String(run.id);
const oldAt = new Date(Date.now() - 120_000).toISOString();

await appendCosRunEventForRun(
  rid,
  'ops_smoke_phase',
  {
    smoke_session_id: 'sess_absence',
    phase: 'trigger_accepted_callback_pending',
    at: oldAt,
    thread_key: tk,
    detail: {},
  },
  {},
);

await maybeRecordOpsSmokeCursorCallbackAbsence({ runId: rid, threadKey: tk, env: process.env });

const evs = await listCosRunEventsForRun(rid, 100);
assert.ok(
  evs.some((e) => e.event_type === 'ops_smoke_phase' && e.payload?.phase === 'cursor_callback_absent_within_timeout'),
);

console.log('test-callback-absence-within-timeout-is-classified: ok');
