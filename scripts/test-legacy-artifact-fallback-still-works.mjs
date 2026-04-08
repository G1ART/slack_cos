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
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-legacy-artifact');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

const tk = 'mention:vnext40_legacy:1';

const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_leg_a',
    objective: 'a',
    packets: [
      {
        packet_id: 'p_legacy',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_legacy',
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
    dispatch_id: 'd_leg_b',
    objective: 'b',
    packets: [
      {
        packet_id: 'p_other',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_other',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridLatest = String((await getActiveRunForThread(tk)).id);
assert.notEqual(ridLatest, ridA, 'sanity: older run A is not thread latest');

await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'legacy row — no cos_run_id',
  payload: { run_packet_id: 'p_legacy', status: 'completed', outcome_code: 'live_completed' },
});

await reconcileRunFromLedgerForRun(ridA);
const afterA = await getRunById(ridA);
assert.equal(String(afterA?.packet_state_map?.p_legacy || ''), 'completed');

console.log('test-legacy-artifact-fallback-still-works: ok');
