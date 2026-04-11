import assert from 'node:assert';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { __cursorAutomationFetchForTests } from '../src/founder/cursorCloudAdapter.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { tickRunSupervisorForThread } from '../src/founder/runSupervisor.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cursor-smoke-life');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const tk = 'mention:smoke_lifecycle:1';
const secret = 'cursor_smoke_cycle_secret_test_min____';

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'ds_smoke',
    objective: 'smoke_obj',
    handoff_order: ['c', 'e'],
    packets: [
      {
        packet_id: 'p1',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm1',
      },
      {
        packet_id: 'p2',
        packet_status: 'ready',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm2',
        depends_on: ['p1'],
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p1',
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', execution_lane: 'cloud_agent' },
  },
  founder_request_summary: '',
});
assert.ok(run?.id);
const rid = String(run.id);
await patchRunById(rid, {
  packet_state_map: { p1: 'running', p2: 'queued' },
  required_packet_ids: ['p1', 'p2'],
});

process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/automation-smoke';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer smoke';
const extId = 'smoke_correlation_run_42';
__cursorAutomationFetchForTests.fn = async () =>
  new Response(JSON.stringify({ run_id: extId }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });

const inv = await invokeExternalTool(
  {
    tool: 'cursor',
    action: 'emit_patch',
    payload: {
      title: 't',
      live_patch: {
        path: 'src/smoke-life.txt',
        operation: 'create',
        content: 'x\n',
        live_only: true,
        no_fallback: true,
      },
    },
  },
  { threadKey: tk, cosRunId: rid, packetId: 'p1' },
);
assert.equal(inv.execution_lane, 'cloud_agent');
__cursorAutomationFetchForTests.fn = null;

const body = JSON.stringify({
  type: 'statusChange',
  runId: extId,
  status: 'completed',
  paths_touched: ['src/smoke-life.txt'],
});
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const wh = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig, 'x-cos-callback-source': 'provider_runtime' },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(wh.matched, true);

const r1 = await getActiveRunForThread(tk);
assert.equal(r1.packet_state_map.p1, 'completed');

delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;

const fakeClient = {
  chat: {
    postMessage: async () => ({ ok: true, ts: '1' }),
  },
};

await tickRunSupervisorForThread(tk, {
  client: fakeClient,
  constitutionSha256: 'test-sha',
  skipLease: true,
});

const r2 = await getActiveRunForThread(tk);
assert.equal(r2.packet_state_map.p1, 'completed');
assert.equal(r2.packet_state_map.p2, 'completed');
assert.equal(r2.status, 'completed');

const tk2 = 'mention:smoke_webhook_override:1';
const run2 = await persistRunAfterDelegate({
  threadKey: tk2,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'ds_ov',
    objective: 'ov',
    packets: [
      {
        packet_id: 'p_ov',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_ov',
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', execution_lane: 'cloud_agent' },
  },
  founder_request_summary: '',
});
const rid2 = String(run2.id);
await patchRunById(rid2, { packet_state_map: { p_ov: 'running' }, required_packet_ids: ['p_ov'] });
const extOv = 'override_smoke_run_99';
await upsertExternalCorrelation({
  run_id: rid2,
  thread_key: tk2,
  packet_id: 'p_ov',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: extOv,
});

const nestedBody = JSON.stringify({
  outer: {
    nested: {
      cursorRun: extOv,
      phase: 'completed',
      paths: ['src/override-smoke.txt'],
    },
  },
});
const rawOv = Buffer.from(nestedBody, 'utf8');
const sigOv = `sha256=${crypto.createHmac('sha256', secret).update(rawOv).digest('hex')}`;
const whOv = await handleCursorWebhookIngress({
  rawBody: rawOv,
  headers: { 'x-cursor-signature-256': sigOv, 'x-cos-callback-source': 'provider_runtime' },
  env: {
    CURSOR_WEBHOOK_SECRET: secret,
    CURSOR_WEBHOOK_RUN_ID_PATH: 'outer.nested.cursorRun',
    CURSOR_WEBHOOK_STATUS_PATH: 'outer.nested.phase',
    CURSOR_WEBHOOK_PATHS_TOUCHED_PATH: 'outer.nested.paths',
  },
});
assert.equal(whOv.matched, true);
const rOv = await getActiveRunForThread(tk2);
assert.equal(rOv.packet_state_map.p_ov, 'completed');

console.log('test-cursor-cloud-smoke-lifecycle: ok');
