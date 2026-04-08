/**
 * vNext.13.48 — Live-only delegate: no non-blocked pretrigger row for create_spec (only explicit block reason).
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
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-live-only-no-observe-create');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_live_only_create';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetDelegateEmitPatchStashForTests();

const tk = 'mention:live_only:no_observe_create:1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_no',
  objective: 'o',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_no',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'a.txt',
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

const evs = await listCosRunEventsForRun(String(run.id), 80);
const observeCreate = evs.filter(
  (e) =>
    e.event_type === 'cos_pretrigger_tool_call' &&
    String(e.payload?.selected_action || '') === 'create_spec',
);
assert.equal(
  observeCreate.length,
  0,
  'create_spec must not get a non-blocked pretrigger observe row in live-only mode',
);
const blockedCreate = evs.filter(
  (e) =>
    e.event_type === 'cos_pretrigger_tool_call_blocked' &&
    String(e.payload?.selected_action || '') === 'create_spec' &&
    String(e.payload?.blocked_reason || '') === 'create_spec_disallowed_in_live_only_mode',
);
assert.ok(blockedCreate.length >= 1);

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.COS_RUN_STORE;

console.log('test-live-only-smoke-does-not-produce-create-spec-session: ok');
