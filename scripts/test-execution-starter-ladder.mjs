import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  orderPacketsByHandoff,
  pickFirstStarterPacket,
  executeStarterKickoffIfEligible,
  __starterKickoffTestHooks,
} from '../src/founder/starterLadder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-starter-ladder');

const dispatch = {
  ok: true,
  status: 'accepted',
  handoff_order: ['pm'],
  packets: [
    {
      persona: 'pm',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: '아트페어 운영 툴 스펙',
      deliverables: ['테이블', '상태값'],
      packet_id: 'pkt_test_1',
    },
  ],
};

const ordered = orderPacketsByHandoff(dispatch);
assert.equal(ordered.length, 1);
assert.equal(ordered[0].persona, 'pm');

const pick = pickFirstStarterPacket(dispatch, process.env, 'mention:C:1.0');
assert.ok(pick);
assert.equal(pick.tool, 'cursor');
assert.equal(pick.action, 'create_spec');

let invoked = 0;
__starterKickoffTestHooks.invokeFn = async () => {
  invoked += 1;
  return { status: 'completed', outcome_code: 'artifact_prepared', ok: true };
};

const kick = await executeStarterKickoffIfEligible({
  threadKey: 'mention:C:1.0',
  dispatch,
  env: process.env,
});
assert.equal(kick.executed, true);
assert.equal(invoked, 1);
assert.equal(kick.packet_id, 'pkt_test_1');

const kickNone = await executeStarterKickoffIfEligible({
  threadKey: '',
  dispatch,
  env: process.env,
});
assert.equal(kickNone, null);

const badDispatch = { ok: true, status: 'rejected', packets: [] };
const kickBad = await executeStarterKickoffIfEligible({
  threadKey: 't',
  dispatch: badDispatch,
  env: process.env,
});
assert.equal(kickBad, null);

__starterKickoffTestHooks.invokeFn = null;

console.log('test-execution-starter-ladder: ok');
