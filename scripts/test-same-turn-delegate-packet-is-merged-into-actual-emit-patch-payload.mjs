/**
 * vNext.13.50 — Accepted delegate narrow packet merges into invoke emit_patch even when model sends {} and starter passes packet_id.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { emitPatchHasCloudContractSource } from '../src/founder/livePatchPayload.js';
import { __cursorAutomationFetchForTests } from '../src/founder/cursorCloudAdapter.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  persistRunAfterDelegate,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import {
  stashDelegateEmitPatchContext,
  __resetDelegateEmitPatchStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-same-turn-merge');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/same-turn-merge';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__cursorAutomationFetchForTests.fn = async () =>
  new Response(JSON.stringify({ success: true, run_id: 'merge_test_run' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

__resetDelegateEmitPatchStashForTests();
__resetCosRunMemoryStore();

const tk = 'mention:same_turn:merge:1';
stashDelegateEmitPatchContext(tk, {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_st',
  objective: 'o',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_st',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'docs/st-merge.txt',
        operation: 'create',
        content: 'c\n',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
});

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_st',
    objective: 'o',
    handoff_order: ['engineering'],
    packets: [
      {
        packet_id: 'p_st',
        packet_status: 'running',
        persona: 'engineering',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
        live_patch: {
          path: 'docs/st-merge.txt',
          operation: 'create',
          content: 'c\n',
          live_only: true,
          no_fallback: true,
        },
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
assert.ok(run?.id, 'persisted run shell');
await patchRunById(String(run.id), { packet_state_map: { p_st: 'running' }, required_packet_ids: ['p_st'] });

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: {} },
  { threadKey: tk, cosRunId: String(run.id), packetId: 'p_st' },
);

assert.notEqual(r.status, 'blocked', String(r.result_summary));
assert.equal(emitPatchHasCloudContractSource(r.payload), true);
assert.ok(Object.keys(r.payload || {}).length > 0);

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
__cursorAutomationFetchForTests.fn = null;

console.log('test-same-turn-delegate-packet-is-merged-into-actual-emit-patch-payload: ok');
