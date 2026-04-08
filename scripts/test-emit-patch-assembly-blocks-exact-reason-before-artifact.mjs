/**
 * vNext.13.54 — Empty emit_patch + cloud lane + packetId → EXTERNAL_CALL_BLOCKED + exact_failure_code.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import {
  invokeExternalTool,
  EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
} from '../src/founder/toolsBridge.js';
import { __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-emit-assembly-block');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_assembly_block';
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/assembly-block';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetOpsSmokeSessionCacheForTests();

const tk = 'mention:assembly:block:packet';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ab',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_ab',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});

const r = await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: {} },
  { threadKey: tk, cosRunId: String(run.id), packetId: 'p_ab' },
);

assert.equal(r.status, 'blocked');
assert.equal(r.blocked_reason, EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD);
assert.equal(r.exact_failure_code, 'invoke_payload_missing_narrow_live_patch_or_ops');

const evs = await listCosRunEventsForRun(String(run.id), 80);
const blockedRows = evs.filter((e) => e.event_type === 'cos_pretrigger_tool_call_blocked');
const lastBlocked = blockedRows[blockedRows.length - 1];
assert.equal(lastBlocked?.payload?.blocked_reason, EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD);
assert.equal(lastBlocked?.payload?.exact_failure_code, 'invoke_payload_missing_narrow_live_patch_or_ops');
assert.equal(lastBlocked?.payload?.payload_provenance, 'invoke_external_tool_raw');

const trig = evs.find(
  (e) => e.event_type === 'ops_smoke_phase' && e.payload?.phase === 'trigger_blocked_invalid_payload',
);
assert.equal(trig?.payload?.exact_failure_code, 'invoke_payload_missing_narrow_live_patch_or_ops');
assert.equal(trig?.payload?.payload_origin, 'invoke_external_tool_raw');

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
delete process.env.COS_RUN_STORE;

console.log('test-emit-patch-assembly-blocks-exact-reason-before-artifact: ok');
