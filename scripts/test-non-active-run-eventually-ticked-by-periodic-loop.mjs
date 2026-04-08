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
import { tickRunSupervisor, tickRunSupervisorForRun } from '../src/founder/runSupervisor.js';
import {
  tryAcquireSupervisorLease,
  __resetSupervisorLeaseMemory,
  __forceSupervisorLeaseMemoryExpiry,
} from '../src/founder/supervisorLease.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-non-active-periodic');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetSupervisorLeaseMemory();

const client = {
  chat: {
    postMessage: async () => ({ ok: true }),
  },
};
const ctx = { client, constitutionSha256: 'test' };

const tk = 'mention:vnext40_nonactive:1';

const pkt = {
  packet_id: 'p_na',
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
    dispatch_id: 'd_na_a',
    objective: 'a',
    packets: [pkt],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_na',
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
    dispatch_id: 'd_na_b',
    objective: 'b',
    packets: [
      {
        packet_id: 'p_nb',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_nb',
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
  summary: 'complete p_na for run A',
  payload: {
    cos_run_id: ridA,
    run_packet_id: 'p_na',
    status: 'completed',
    outcome_code: 'live_completed',
  },
});

const blocker = 'lease-blocker-vnext40-nonactive';
assert.equal(await tryAcquireSupervisorLease(blocker), true);

const direct = await tickRunSupervisorForRun(ridA, { ...ctx, skipLease: false });
assert.equal(direct.skipped, true);
assert.equal(direct.reason, 'lease_held');

const midA = await getRunById(ridA);
assert.notEqual(String(midA?.status || ''), 'completed', 'lease-held direct tick must not close run A');

__forceSupervisorLeaseMemoryExpiry();

const periodic = await tickRunSupervisor(ctx);
assert.equal(periodic.skipped, false);

const finalA = await getRunById(ridA);
assert.equal(String(finalA?.status || ''), 'completed', 'periodic run-id sweep must eventually reconcile non-active run');

console.log('test-non-active-run-eventually-ticked-by-periodic-loop: ok');
