import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { recordOpsSmokeCursorTrigger } from '../src/founder/smokeOps.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-callback-pending');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_cb_pending_unit';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();

const tk = 'mention:cb_pending:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd1',
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

await recordOpsSmokeCursorTrigger({
  runId: rid,
  threadKey: tk,
  smoke_session_id: 'sess_cb_pending_unit',
  tr: {
    ok: true,
    status: 200,
    has_accepted_external_id: true,
    accepted_external_id: 'bg_composer_xyz',
    external_run_id: null,
    has_run_id: false,
  },
});

const evs = await listCosRunEventsForRun(rid, 100);
const phases = evs
  .filter((e) => e.event_type === 'ops_smoke_phase')
  .map((e) => String(e.payload?.phase || ''));
assert.ok(phases.includes('trigger_accepted_callback_pending'), phases.join(','));

console.log('test-accepted-run-enters-callback-pending-state: ok');
