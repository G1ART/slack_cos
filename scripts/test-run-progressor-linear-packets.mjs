import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { maybeAdvanceNextPacket } from '../src/founder/runProgressor.js';
import { __starterKickoffTestHooks } from '../src/founder/starterLadder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-progressor');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

const tk = 'mention:C_prog_linear:9.9';

const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'h_linear',
  objective: 'linear two packets',
  handoff_order: ['pm', 'eng'],
  packets: [
    {
      persona: 'pm',
      packet_id: 'p_linear_1',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm1',
      deliverables: [],
    },
    {
      persona: 'eng',
      packet_id: 'p_linear_2',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm2',
      deliverables: [],
    },
  ],
};

const kick = {
  executed: true,
  tool: 'cursor',
  action: 'create_spec',
  packet_id: 'p_linear_1',
  outcome: { status: 'completed', outcome_code: 'artifact_prepared', ok: true },
};

await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: kick,
  founder_request_summary: '',
});

let r1 = await getActiveRunForThread(tk);
assert.equal(r1.status, 'running');
assert.equal(r1.packet_state_map.p_linear_1, 'completed');
assert.equal(r1.packet_state_map.p_linear_2, 'queued');

const seen = [];
__starterKickoffTestHooks.invokeFn = async (_args, ctx) => {
  seen.push(ctx.packetId);
  return { status: 'completed', outcome_code: 'artifact_prepared', ok: true };
};

const adv = await maybeAdvanceNextPacket(tk);
assert.equal(adv.advanced, true);
assert.equal(adv.target, 'p_linear_2');
assert.deepEqual(seen, ['p_linear_2']);

const adv2 = await maybeAdvanceNextPacket(tk);
assert.equal(adv2.advanced, false);

r1 = await getActiveRunForThread(tk);
assert.equal(r1.status, 'completed');
assert.equal(r1.packet_state_map.p_linear_2, 'completed');

__starterKickoffTestHooks.invokeFn = null;

console.log('test-run-progressor-linear-packets: ok');
