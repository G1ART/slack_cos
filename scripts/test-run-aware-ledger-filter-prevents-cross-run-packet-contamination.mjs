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
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-run-aware-ledger');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

const tk = 'mention:vnext40_contam:1';
const overlapPkt = {
  packet_id: 'p_overlap',
  packet_status: 'running',
  preferred_tool: 'cursor',
  preferred_action: 'create_spec',
  mission: 'm',
};

const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_co_a',
    objective: 'a',
    packets: [overlapPkt],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_overlap',
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
    dispatch_id: 'd_co_b',
    objective: 'b',
    packets: [{ ...overlapPkt, mission: 'm2' }],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_overlap',
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
  summary: 'completed for B only',
  payload: {
    cos_run_id: ridB,
    run_packet_id: 'p_overlap',
    status: 'completed',
    outcome_code: 'live_completed',
  },
});

const beforeA = await getRunById(ridA);
await reconcileRunFromLedgerForRun(ridA);
const afterA = await getRunById(ridA);

assert.equal(
  String(afterA?.packet_state_map?.p_overlap || ''),
  String(beforeA?.packet_state_map?.p_overlap || ''),
  'run A must not ingest tool_result scoped to run B (same thread, same packet id)',
);

console.log('test-run-aware-ledger-filter-prevents-cross-run-packet-contamination: ok');
