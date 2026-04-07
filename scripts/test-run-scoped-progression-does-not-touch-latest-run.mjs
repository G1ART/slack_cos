import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendExecutionArtifact } from '../src/founder/executionLedger.js';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  getRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { reconcileRunFromLedgerForRun } from '../src/founder/runProgressor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-scoped-prog');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

const tk = 'mention:vnext39_prog:1';
const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_pr_a',
    objective: 'a',
    packets: [
      {
        packet_id: 'p_only_a',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_only_a',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridA = String(runA.id);
await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_pr_b',
    objective: 'b',
    packets: [
      {
        packet_id: 'p_only_b',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_only_b',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridB = String((await getActiveRunForThread(tk)).id);
assert.notEqual(ridA, ridB);
await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'ledger for packet a',
  payload: { run_packet_id: 'p_only_a', status: 'completed', ok: true },
});
const beforeB = await getRunById(ridB);
await reconcileRunFromLedgerForRun(ridA);
const afterA = await getRunById(ridA);
const afterB = await getRunById(ridB);
assert.equal(afterA.packet_state_map.p_only_a, 'completed');
assert.deepStrictEqual(afterB.packet_state_map, beforeB.packet_state_map);
assert.equal(String((await getActiveRunForThread(tk)).id), ridB);
console.log('test-run-scoped-progression-does-not-touch-latest-run: ok');
