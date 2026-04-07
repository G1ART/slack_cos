import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  patchRun,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-durable-roundtrip');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();

const tk = 'mention:C_round:1.1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'h_round',
  objective: 'roundtrip',
  handoff_order: ['pm'],
  packets: [
    {
      persona: 'pm',
      packet_id: 'p_r1',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm',
      deliverables: [],
    },
  ],
};

const kick = { executed: false };
await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: kick,
  founder_request_summary: 'sum',
});

let r = await getActiveRunForThread(tk);
assert.ok(r?.run_id);
assert.equal(r.thread_key, tk);
assert.equal(r.status, 'running');

const t0 = new Date().toISOString();
await patchRun(tk, {
  founder_notified_started_at: t0,
  founder_notified_review_required_at: t0,
});

r = await getActiveRunForThread(tk);
assert.equal(r.founder_notified_started_at, t0);
assert.equal(r.founder_notified_review_required_at, t0);

await patchRun(tk, { founder_notified_review_at: null });
r = await getActiveRunForThread(tk);
assert.equal(r.founder_notified_review_required_at, null);

console.log('test-durable-run-store-roundtrip: ok');
