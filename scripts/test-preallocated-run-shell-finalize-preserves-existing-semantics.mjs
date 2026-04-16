import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  persistAcceptedRunShell,
  finalizeRunAfterStarterKickoff,
  persistRunAfterDelegate,
  getRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { executeStarterKickoffIfEligible, __starterKickoffTestHooks } from '../src/founder/starterLadder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-shell-finalize-sem');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_WORKSPACE_KEY = 'shell_fin_ws';
process.env.COS_PRODUCT_KEY = 'shell_fin_prod';
process.env.COS_PROJECT_SPACE_KEY = 'shell_fin_ps';
process.env.COS_PARCEL_DEPLOYMENT_KEY = 'shell_fin_parcel';

const tk = 'mention:vnext41_shell_fin:1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_shell_fin',
  objective: 'obj',
  packets: [
    {
      packet_id: 'p_sf',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm',
    },
  ],
};

function pickComparable(run) {
  if (!run) return null;
  return {
    status: String(run.status || ''),
    stage: String(run.stage || ''),
    current_packet_id: run.current_packet_id != null ? String(run.current_packet_id) : null,
    next_packet_id: run.next_packet_id != null ? String(run.next_packet_id) : null,
    required_packet_ids: Array.isArray(run.required_packet_ids) ? [...run.required_packet_ids.map(String)] : [],
    terminal_packet_ids: Array.isArray(run.terminal_packet_ids) ? [...run.terminal_packet_ids.map(String)] : [],
    packet_state_map: run.packet_state_map && typeof run.packet_state_map === 'object' ? { ...run.packet_state_map } : {},
    starter_executed: Boolean(run.starter_kickoff && run.starter_kickoff.executed),
  };
}

const stubOutcome = {
  ok: true,
  status: 'running',
  outcome_code: 'cloud_agent_dispatch_accepted',
};

__starterKickoffTestHooks.invokeFn = async () => stubOutcome;

__resetCosRunMemoryStore();
const shell = await persistAcceptedRunShell({
  threadKey: tk,
  dispatch,
  founder_request_summary: 'sum',
});
const rid = String(shell?.id || '');
assert.ok(rid);
const kickSplit = await executeStarterKickoffIfEligible({
  threadKey: tk,
  dispatch,
  cosRunId: rid,
});
await finalizeRunAfterStarterKickoff({
  runId: rid,
  threadKey: tk,
  dispatch: { ...dispatch, starter_kickoff: kickSplit },
  starter_kickoff: kickSplit,
  founder_request_summary: 'sum',
});
const viaSplit = pickComparable(await getRunById(rid));

__resetCosRunMemoryStore();
__starterKickoffTestHooks.invokeFn = async () => stubOutcome;
const kickOneShot = await executeStarterKickoffIfEligible({
  threadKey: tk,
  dispatch,
});
const viaDelegate = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: { ...dispatch, starter_kickoff: kickOneShot },
  starter_kickoff: kickOneShot,
  founder_request_summary: 'sum',
});
const oneShot = pickComparable(await getRunById(String(viaDelegate?.id || '')));

assert.deepStrictEqual(viaSplit, oneShot, 'shell+kick+finalize must match persistRunAfterDelegate graph semantics');

__starterKickoffTestHooks.invokeFn = null;
console.log('test-preallocated-run-shell-finalize-preserves-existing-semantics: ok');
