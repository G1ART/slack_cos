/**
 * vNext.13.53 — Live-only/no-fallback: no cos_pretrigger_* or ops_smoke rows carrying create_spec as a candidate action.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  stashDelegateEmitPatchContext,
  __resetDelegateEmitPatchStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-live-only-no-create-anywhere');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_no_create_anywhere';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetDelegateEmitPatchStashForTests();

const tk = 'mention:live_only:no_create_anywhere:1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_nc',
  objective: 'o',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_nc',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'n.txt',
        operation: 'replace',
        content: 'z',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
};

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

stashDelegateEmitPatchContext(tk, dispatch);

await invokeExternalTool(
  { tool: 'cursor', action: 'create_spec', payload: { title: 'x' } },
  { threadKey: tk, cosRunId: String(run.id) },
);

const evs = await listCosRunEventsForRun(String(run.id), 120);
for (const e of evs) {
  const et = String(e.event_type || '');
  if (et !== 'cos_pretrigger_tool_call' && et !== 'cos_pretrigger_tool_call_blocked') continue;
  assert.notEqual(
    String(e.payload?.selected_action || ''),
    'create_spec',
    'pretrigger rows must not carry create_spec action in live-only mode',
  );
}

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.COS_RUN_STORE;

console.log('test-live-only-does-not-produce-create-spec-candidate-anywhere: ok');
