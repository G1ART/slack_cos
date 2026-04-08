/**
 * vNext.13.45+ — Multiple emit_patch pretrigger paths produce ops_smoke_phase rows (summary visibility).
 * vNext.13.49 — Without COS_OPS_SMOKE_SESSION_ID, invocations share one cached parent smoke_* session id (affinity).
 */
import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { __resetOpsSmokeSessionCacheForTests } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-pretrigger-two-sessions');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_OPS_SMOKE_ENABLED = '1';
delete process.env.COS_OPS_SMOKE_SESSION_ID;
process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/two-session-smoke';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetOpsSmokeSessionCacheForTests();

const tk = 'mention:pretrigger:two_session:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ts',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_ts',
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

const rid = String(run.id);
await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: { title: 'one' } },
  { threadKey: tk, cosRunId: rid, packetId: 'p_ts' },
);
await invokeExternalTool(
  { tool: 'cursor', action: 'emit_patch', payload: { title: 'two' } },
  { threadKey: tk, cosRunId: rid, packetId: 'p_ts' },
);

const evs = await listCosRunEventsForRun(rid, 80);
const smokeRows = evs.filter((e) => e.event_type === 'ops_smoke_phase');
const sids = [...new Set(smokeRows.map((e) => String(e.payload?.smoke_session_id || '').trim()).filter(Boolean))];
assert.ok(smokeRows.length >= 2, 'expected multiple ops_smoke_phase rows for two invocations');
assert.ok(sids.length >= 1, 'expected smoke_session_id on rows');
assert.equal(
  sids.length,
  1,
  `single parent smoke_session_id for unconfigured smoke (cached smoke_*), got: ${sids.join(', ')}`,
);
assert.ok(sids[0].startsWith('smoke_'), `expected smoke_* session, got ${sids[0]}`);

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

console.log('test-pretrigger-invalid-payload-creates-new-smoke-session: ok');
