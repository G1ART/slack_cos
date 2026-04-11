/**
 * vNext.13.72 — Provider-only packet progression; structural closure anchor; effective packet id.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { allowsAuthoritativeCursorPacketProgression } from '../src/founder/cursorCallbackTruth.js';
import { resolveEffectiveCursorPacketId } from '../src/founder/canonicalExternalEvent.js';
import {
  computeEmitPatchCursorAutomationTruth,
  __cursorAutomationFetchForTests,
  triggerCursorAutomation,
} from '../src/founder/cursorCloudAdapter.js';
import { persistRunAfterDelegate, getRunById, patchRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { EMIT_PATCH_COMPLETION_CONTRACT_KEY } from '../src/founder/cursorCompletionContract.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-72-gate');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

assert.equal(allowsAuthoritativeCursorPacketProgression('provider_runtime'), true);
assert.equal(allowsAuthoritativeCursorPacketProgression('unknown'), false);
assert.equal(allowsAuthoritativeCursorPacketProgression('synthetic_orchestrator'), false);
assert.equal(allowsAuthoritativeCursorPacketProgression('manual_probe'), false);

const runEff = await persistRunAfterDelegate({
  threadKey: 't_eff',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_eff',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_eff',
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
await patchRunById(String(runEff.id), {
  cursor_callback_anchor: { action: 'emit_patch' },
  packet_state_map: { p_eff: 'running' },
  required_packet_ids: ['p_eff'],
});
const rowEff = await getRunById(String(runEff.id));
assert.equal(
  resolveEffectiveCursorPacketId(
    rowEff,
    { packet_id: null, run_id: String(runEff.id), thread_key: 't_eff' },
    { provider: 'cursor', packet_id_hint: null, payload: {} },
  ),
  'p_eff',
);

const secret = 'cursor_webhook_secret_test_min_len__';
const tk = 'mention:v72:synth';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd72',
    objective: 'o',
    packets: [
      {
        packet_id: 'p72',
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
await patchRunById(rid, { packet_state_map: { p72: 'running' }, required_packet_ids: ['p72'] });
await upsertExternalCorrelation({
  run_id: rid,
  thread_key: tk,
  packet_id: 'p72',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cr_synth_72',
});

const body = JSON.stringify({
  type: 'statusChange',
  runId: 'cr_synth_72',
  status: 'completed',
});
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: {
    'x-cursor-signature-256': sig,
    'x-cos-callback-source': 'synthetic_orchestrator',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out.matched, true);
const rAfter = await getRunById(rid);
assert.equal(rAfter.packet_state_map.p72, 'running');

const tk2 = 'mention:v72:prov';
const run2 = await persistRunAfterDelegate({
  threadKey: tk2,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd72b',
    objective: 'o',
    packets: [
      {
        packet_id: 'p72b',
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
const rid2 = String(run2.id);
await patchRunById(rid2, { packet_state_map: { p72b: 'running' }, required_packet_ids: ['p72b'] });
await upsertExternalCorrelation({
  run_id: rid2,
  thread_key: tk2,
  packet_id: 'p72b',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cr_prov_72',
});
const body2 = JSON.stringify({ type: 'statusChange', runId: 'cr_prov_72', status: 'completed' });
const raw2 = Buffer.from(body2, 'utf8');
const sig2 = `sha256=${crypto.createHmac('sha256', secret).update(raw2).digest('hex')}`;
const out2 = await handleCursorWebhookIngress({
  rawBody: raw2,
  headers: {
    'x-cursor-signature-256': sig2,
    'x-cos-callback-source': 'provider_runtime',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out2.matched, true);
const rProv = await getRunById(rid2);
assert.equal(rProv.packet_state_map.p72b, 'completed');
assert.ok(rProv.cursor_callback_anchor?.provider_structural_closure_at);

let captured = '';
process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/v72ctx';
process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer x';
process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
process.env.CURSOR_AUTOMATION_CALLBACK_URL = 'http://127.0.0.1:9/h';
process.env.CURSOR_WEBHOOK_SECRET = secret;
__cursorAutomationFetchForTests.fn = async (_u, init) => {
  captured = String(init.body || '');
  return new Response(JSON.stringify({ run_id: 'r', callbackUrl: 'http://x', webhookSecret: 'y' }), { status: 200 });
};
await triggerCursorAutomation({
  action: 'emit_patch',
  payload: {
    title: 't',
    live_patch: {
      path: 'src/a.txt',
      operation: 'create',
      content: 'z',
      live_only: true,
      no_fallback: true,
    },
  },
  env: process.env,
  invocation_id: 'inv72',
  completionContext: { thread_key: 'dm:x', packet_id: 'pk1' },
});
const parsed = JSON.parse(captured);
const contract = parsed[EMIT_PATCH_COMPLETION_CONTRACT_KEY];
assert.ok(contract?.recommended_callback_context?.thread_key);
assert.ok(contract?.recommended_callback_context?.packet_id);
__cursorAutomationFetchForTests.fn = null;
delete process.env.CURSOR_AUTOMATION_ENDPOINT;
delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
delete process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED;
delete process.env.CURSOR_AUTOMATION_CALLBACK_URL;
delete process.env.CURSOR_WEBHOOK_SECRET;

const truth = computeEmitPatchCursorAutomationTruth(
  { ok: true, request_id: 'r1', response_top_level_keys: ['run_id'] },
  {
    title: 't',
    live_patch: { path: 'src/x.txt', operation: 'create', content: '1', live_only: true, no_fallback: true },
  },
  { CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED: '0' },
);
assert.equal(truth.callback_contract_present, false);

console.log('test-v13-72-callback-gate-closure: ok');
