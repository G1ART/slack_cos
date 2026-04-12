/**
 * v13.73b — Exact provider callback schema: field precedence, positive_terminal, provider vs synthetic, upgrade path.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { computeCursorWebhookFieldSelection, normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';
import { canonicalizeExternalRunStatus } from '../src/founder/externalRunStatus.js';
import { deriveCursorCallbackSourceKindFromHeaders } from '../src/founder/cursorCallbackTruth.js';
import { bindCursorEmitPatchDispatchLedgerBeforeTrigger } from '../src/founder/providerEventCorrelator.js';
import { persistRunAfterDelegate, getRunById, patchRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';
import { processRunMilestones } from '../src/founder/runSupervisor.js';
import { __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixturePath = path.join(__dirname, 'fixtures', 'cursor-exact-provider-callback-v13-73.json');
const exactPayload = JSON.parse(readFileSync(fixturePath, 'utf8'));

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-73-exact-schema');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();

const RUN_UUID = '6143dd0d-0fcb-439c-91c7-997caecb5b79';
const ACCEPTED_ID = 'tool_1775874634056_0c0460a286d2';
const TK = 'mention:C0AMELPEFRC:1775874613.196639';
const PKT = 'cursor-live-smoke-single-file';

// Field selection (3–5)
const sel = computeCursorWebhookFieldSelection(exactPayload, process.env);
assert.equal(sel.runIdPick.value, RUN_UUID, 'external_run_id wins over backgroundComposerId');
assert.equal(sel.acceptedExternalIdHint, ACCEPTED_ID, 'accepted_external_id wins over request_id');
assert.equal(sel.threadKeyHint, TK);
assert.equal(sel.packetIdHint, PKT);

const norm = normalizeCursorWebhookPayload(exactPayload, process.env);
assert.ok(norm);
assert.equal(norm.canonical.external_run_id, RUN_UUID);
assert.equal(norm.canonical.accepted_external_id_hint, ACCEPTED_ID);
const canonSt = canonicalizeExternalRunStatus(String(norm.canonical.payload?.status || ''));
assert.equal(canonSt.bucket, 'positive_terminal', 'accepted_and_applied => positive_terminal');

// Env override must not steal accepted id when canonical accepted_external_id exists
const envSteal = {
  ...process.env,
  CURSOR_WEBHOOK_ACCEPTED_ID_PATH: 'backgroundComposerId',
};
const selSteal = computeCursorWebhookFieldSelection(exactPayload, envSteal);
assert.equal(selSteal.acceptedExternalIdHint, ACCEPTED_ID);

const secret = 'cursor_webhook_secret_test_exact_v73___';

// (1) Provider-signed, no internal header → bind + exact payload → intake commit + completed milestone path
await saveSlackRouting(TK, { channel: 'C_exact', thread_ts: '1.1' });
const touchPath = String(exactPayload.paths_touched?.[0] || 'docs/x.md');
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_exact',
    objective: 'smoke',
    packets: [
      {
        packet_id: PKT,
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
await patchRunById(rid, { packet_state_map: { [PKT]: 'running' }, required_packet_ids: [PKT] });
const bind1 = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK,
  runId: rid,
  packetId: PKT,
  invocation_id: ACCEPTED_ID,
  payload: {
    live_patch: { path: touchPath, operation: 'create', content: 'x', live_only: true, no_fallback: true },
  },
});
assert.equal(bind1.ok, true);
await upsertExternalCorrelation({
  run_id: rid,
  thread_key: TK,
  packet_id: PKT,
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: RUN_UUID,
});

const raw = Buffer.from(JSON.stringify(exactPayload), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out.matched, true);
assert.equal(out.canonical_status, 'positive_terminal');
const r1 = await getRunById(rid);
assert.equal(r1.packet_state_map[PKT], 'completed');
assert.ok(r1.cursor_callback_anchor?.provider_structural_closure_at);

await patchRunById(rid, {
  cursor_dispatch_ledger: {
    bound_at: new Date().toISOString(),
    target_packet_id: PKT,
    automation_request_id: 'ledger_v73ex',
    pending_provider_callback: false,
    selected_tool: 'cursor',
    selected_action: 'emit_patch',
  },
  starter_kickoff: {
    executed: true,
    packet_id: PKT,
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', execution_lane: 'cloud_agent' },
  },
  founder_notified_started_at: new Date().toISOString(),
  founder_notified_completed_at: null,
});
let posts = 0;
const client = {
  chat: {
    postMessage: async (args) => {
      posts += 1;
      const t = String(args?.text || '');
      assert.ok(t.includes('마쳤') || t.includes('completed') || t.includes('1차'), 'founder completed tone');
      return { ok: true };
    },
  },
};
await processRunMilestones({ run: await getRunById(rid), client, constitutionSha256: 'x' });
assert.equal(posts, 1);
assert.ok((await getRunById(rid)).founder_notified_completed_at);

// (2) Same payload + synthetic header → matched correlation possible but no progression
__resetCosRunMemoryStore();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();
const tk2 = 'mention:v73ex:syn2';
const run2 = await persistRunAfterDelegate({
  threadKey: tk2,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd2',
    objective: 'o',
    packets: [
      {
        packet_id: PKT,
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
await patchRunById(rid2, { packet_state_map: { [PKT]: 'running' }, required_packet_ids: [PKT] });
await upsertExternalCorrelation({
  run_id: rid2,
  thread_key: tk2,
  packet_id: PKT,
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: RUN_UUID,
});
const body2 = { ...exactPayload, context: { ...exactPayload.context, thread_key: tk2 } };
const raw2 = Buffer.from(JSON.stringify(body2), 'utf8');
const sig2 = `sha256=${crypto.createHmac('sha256', secret).update(raw2).digest('hex')}`;
const out2 = await handleCursorWebhookIngress({
  rawBody: raw2,
  headers: {
    'x-cursor-signature-256': sig2,
    'x-cos-callback-source': 'synthetic_orchestrator',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out2.matched, true);
const r2 = await getRunById(rid2);
assert.equal(r2.packet_state_map[PKT], 'running');
assert.ok(!r2.cursor_callback_anchor?.provider_structural_closure_at);

// (6) Synthetic first, then provider → authoritative upgrade
__resetCosRunMemoryStore();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();
const tk3 = 'mention:v73ex:upgrade';
const run3 = await persistRunAfterDelegate({
  threadKey: tk3,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd3',
    objective: 'o',
    packets: [
      {
        packet_id: PKT,
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
const rid3 = String(run3.id);
await patchRunById(rid3, { packet_state_map: { [PKT]: 'running' }, required_packet_ids: [PKT] });
const bind3 = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: tk3,
  runId: rid3,
  packetId: PKT,
  invocation_id: ACCEPTED_ID,
  payload: {
    live_patch: { path: touchPath, operation: 'create', content: 'x', live_only: true, no_fallback: true },
  },
});
assert.equal(bind3.ok, true);
await upsertExternalCorrelation({
  run_id: rid3,
  thread_key: tk3,
  packet_id: PKT,
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: RUN_UUID,
});
const body3 = { ...exactPayload, context: { ...exactPayload.context, thread_key: tk3 } };
const raw3a = Buffer.from(JSON.stringify(body3), 'utf8');
const sig3a = `sha256=${crypto.createHmac('sha256', secret).update(raw3a).digest('hex')}`;
await handleCursorWebhookIngress({
  rawBody: raw3a,
  headers: {
    'x-cursor-signature-256': sig3a,
    'x-cos-callback-source': 'synthetic_orchestrator',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal((await getRunById(rid3)).packet_state_map[PKT], 'running');
const raw3b = Buffer.from(JSON.stringify(body3), 'utf8');
const sig3b = `sha256=${crypto.createHmac('sha256', secret).update(raw3b).digest('hex')}`;
await handleCursorWebhookIngress({
  rawBody: raw3b,
  headers: { 'x-cursor-signature-256': sig3b },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
const r3 = await getRunById(rid3);
assert.equal(r3.packet_state_map[PKT], 'completed');
assert.ok(r3.cursor_callback_anchor?.provider_structural_closure_at);

assert.equal(deriveCursorCallbackSourceKindFromHeaders({}), 'provider_runtime');
assert.equal(deriveCursorCallbackSourceKindFromHeaders({ 'x-cos-callback-source': 'synthetic_orchestrator' }), 'synthetic_orchestrator');

console.log('test-v13-73-exact-provider-callback-schema: ok');
