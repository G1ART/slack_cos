import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { processRunMilestones } from '../src/founder/runSupervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-milestone-run-scope');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();

const tk = 'mention:vnext39_ms:1';
await saveSlackRouting(tk, { channel: 'C_ms', thread_ts: '9.9' });

const runA0 = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ms_a',
    objective: 'old run',
    packets: [
      {
        packet_id: 'p_ms',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_ms',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridA = String(runA0.id);

await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ms_b',
    objective: 'latest',
    packets: [
      {
        packet_id: 'p_ms_b',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_ms_b',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridB = String((await getActiveRunForThread(tk)).id);
assert.notEqual(ridA, ridB);

const t0 = new Date().toISOString();
await patchRunById(ridA, {
  status: 'completed',
  stage: 'finalizing',
  packet_state_map: { p_ms: 'completed' },
  terminal_packet_ids: ['p_ms'],
  founder_notified_started_at: t0,
  founder_notified_completed_at: null,
  completed_at: t0,
});

let posts = 0;
const client = {
  chat: {
    postMessage: async () => {
      posts += 1;
      return { ok: true };
    },
  },
};

const runA2 = await getRunById(ridA);
await processRunMilestones({ run: runA2, client, constitutionSha256: 'x' });
assert.equal(posts, 1);
assert.ok((await getRunById(ridA)).founder_notified_completed_at);
assert.equal((await getRunById(ridB)).founder_notified_completed_at ?? null, null);

console.log('test-run-scoped-milestone-callback-target: ok');
