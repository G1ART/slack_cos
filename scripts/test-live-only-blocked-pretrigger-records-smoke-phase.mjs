import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-pretrigger-smoke');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_pretrigger_test';
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/pretrigger-smoke';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetOpsSmokeSessionCacheForTests();

const tk = 'mention:pretrigger:smoke:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_pt',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_pt',
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
  { tool: 'cursor', action: 'emit_patch', payload: { title: 'x' } },
  { threadKey: tk, cosRunId: String(run.id), packetId: 'p_pt' },
);

const evs = await listCosRunEventsForRun(String(run.id), 30);
const types = evs.map((e) => e.event_type);
assert.ok(types.includes('ops_smoke_phase'));
const phases = evs
  .filter((e) => e.event_type === 'ops_smoke_phase')
  .map((e) => (e.payload && e.payload.phase) || '');
assert.ok(phases.includes('live_payload_compilation_started'));
assert.ok(phases.includes('trigger_blocked_invalid_payload'));

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-live-only-blocked-pretrigger-records-smoke-phase: ok');
