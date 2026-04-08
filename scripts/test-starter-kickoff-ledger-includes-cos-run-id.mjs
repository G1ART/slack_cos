import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendExecutionArtifact, readRecentExecutionArtifacts } from '../src/founder/executionLedger.js';
import {
  persistAcceptedRunShell,
  finalizeRunAfterStarterKickoff,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { executeStarterKickoffIfEligible, __starterKickoffTestHooks } from '../src/founder/starterLadder.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-kickoff-cos-run-id');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunMemoryStore();

/** Mirrors toolsBridge ledger shape without live I/O (fast regression). */
__starterKickoffTestHooks.invokeFn = async (spec, ctx) => {
  const threadKey = String(ctx.threadKey || '');
  const cosRunId = ctx.cosRunId != null ? String(ctx.cosRunId).trim() : '';
  const runPacketId = ctx.packetId != null ? String(ctx.packetId).trim() : '';
  const tool = spec.tool;
  const action = String(spec.action || '');
  const ledgerPayload = {
    invocation_id: `test_${Date.now()}`,
    tool,
    action,
    execution_mode: 'artifact',
    execution_lane: 'artifact',
    status: 'completed',
    outcome_code: 'artifact_prepared',
    result_summary: 'synthetic kickoff',
    ...(runPacketId ? { run_packet_id: runPacketId } : {}),
    ...(cosRunId ? { cos_run_id: cosRunId } : {}),
  };
  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: 'synthetic',
      status: 'completed',
      payload: ledgerPayload,
    });
  }
  return {
    ok: true,
    status: 'completed',
    outcome_code: 'artifact_prepared',
    result_summary: 'synthetic kickoff',
  };
};

const tk = 'mention:vnext41_kick_cos:1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_kick_cos',
  objective: 'o',
  packets: [
    {
      packet_id: 'p_kc',
      packet_status: 'ready',
      preferred_tool: 'cursor',
      preferred_action: 'create_spec',
      mission: 'm',
    },
  ],
};

const shell = await persistAcceptedRunShell({
  threadKey: tk,
  dispatch,
  founder_request_summary: 'fr',
});
const runId = String(shell?.id || '');
assert.ok(runId);

const kick = await executeStarterKickoffIfEligible({
  threadKey: tk,
  dispatch,
  cosRunId: runId,
});
await finalizeRunAfterStarterKickoff({
  runId,
  threadKey: tk,
  dispatch: { ...dispatch, starter_kickoff: kick },
  starter_kickoff: kick,
  founder_request_summary: 'fr',
});

const arts = await readRecentExecutionArtifacts(tk, 80);
const toolResults = arts.filter((a) => a.type === 'tool_result');
const withCos = toolResults.filter((a) => {
  const pl = a.payload && typeof a.payload === 'object' ? a.payload : {};
  return String(pl.cos_run_id || '') === runId;
});
assert.ok(withCos.length >= 1, 'starter kickoff tool_result must carry cos_run_id');

__starterKickoffTestHooks.invokeFn = null;
console.log('test-starter-kickoff-ledger-includes-cos-run-id: ok');
