/**
 * vNext.13.46 — invoke emit_patch records cos_pretrigger_tool_call (+ blocked on contract fail).
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-pretrigger-audit-emit');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';
delete process.env.COS_OPS_SMOKE_SESSION_ID;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/audit-emit';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetOpsSmokeSessionCacheForTests();

const tk = 'mention:audit_emit:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ae',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_ae',
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

await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: { title: 'only' } },
  { threadKey: tk, cosRunId: String(run.id) },
);

const evs = await listCosRunEventsForRun(String(run.id), 40);
const types = evs.map((e) => e.event_type);
assert.ok(types.includes('cos_pretrigger_tool_call'), 'observation event');
assert.ok(types.includes('cos_pretrigger_tool_call_blocked'), 'blocked event');
const blocked = evs.find((e) => e.event_type === 'cos_pretrigger_tool_call_blocked');
assert.ok(blocked?.payload?.call_name === 'invoke_external_tool');
assert.equal(blocked?.payload?.selected_tool, 'cursor');
assert.equal(blocked?.payload?.selected_action, 'emit_patch');
assert.ok(Array.isArray(blocked?.payload?.payload_top_level_keys));
assert.ok(blocked?.payload?.smoke_session_id);

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-pretrigger-tool-call-audit-for-direct-emit-patch: ok');
