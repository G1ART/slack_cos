import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyExternalPacketProgressStateForRun } from '../src/founder/canonicalExternalEvent.js';
import { persistRunAfterDelegate, getRunById, patchRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-completed-at-clear');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();

const run = await persistRunAfterDelegate({
  threadKey: 'mention:completed_at_clear:1',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_cat',
    objective: 'o',
    packets: [
      {
        packet_id: 'p1',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p1',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running' },
  },
  founder_request_summary: '',
});
const rid = String(run.id);

const now = new Date().toISOString();
await patchRunById(rid, {
  packet_state_map: { p1: 'completed' },
  status: 'completed',
  stage: 'finalizing',
  completed_at: now,
  terminal_packet_ids: ['p1'],
  current_packet_id: 'p1',
  next_packet_id: null,
});

let r = await getRunById(rid);
assert.equal(r.status, 'completed');
assert.ok(r.completed_at);

await applyExternalPacketProgressStateForRun(rid, 'p1', 'failed');
r = await getRunById(rid);
assert.equal(r.status, 'failed');
assert.equal(r.completed_at, null);

console.log('test-completed-at-clears-on-late-failure: ok');
