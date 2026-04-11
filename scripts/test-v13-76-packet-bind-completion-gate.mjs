/**
 * vNext.13.76 — Exact correlation packet_id for callback commit; founder completion hard gate (ledger + closure + completed).
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { resolveEmitPatchAuthoritativePacketId } from '../src/founder/canonicalExternalEvent.js';
import { bindCursorEmitPatchDispatchLedgerBeforeTrigger } from '../src/founder/providerEventCorrelator.js';
import { resolveCursorAutomationRequestId } from '../src/founder/cursorCloudAdapter.js';
import {
  persistRunAfterDelegate,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { __resetCorrelationMemoryForTests, upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { processRunMilestones } from '../src/founder/runSupervisor.js';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';
import { aggregateSmokeSessionProgress } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-76-gate');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function reset() {
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
  __resetExternalGatewayTestState();
  __resetCosRunEventsMemoryForTests();
}

// --- Resolver: hint mismatch vs correlation ---
reset();
const runTwo = await persistRunAfterDelegate({
  threadKey: 'tk:v76:two',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd76two',
    objective: 'o',
    packets: [
      {
        packet_id: 'pa',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
      {
        packet_id: 'pb',
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
const ridTwo = String(runTwo.id);
await patchRunById(ridTwo, {
  packet_state_map: { pa: 'running', pb: 'running' },
  required_packet_ids: ['pa', 'pb'],
});
const rowTwo = await getRunById(ridTwo);
const mis = resolveEmitPatchAuthoritativePacketId(
  rowTwo,
  { packet_id: 'pa', run_id: ridTwo, thread_key: 'tk:v76:two' },
  { provider: 'cursor', packet_id_hint: 'pb' },
);
assert.equal(mis.packetId, '');
assert.equal(mis.closure_not_applied_reason, 'callback_packet_id_mismatch');

// --- live_24 style: accepted_external_id match + wrong corr packet + hint "right" → no progression ---
reset();
const TK = 'mention:v76:live24';
const PKT = 'p_emit_v76';
const WRONG = 'p_wrong_v76';
const secret = 'cursor_webhook_secret_test_v76_min_len_';
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd76',
    objective: 'o',
    packets: [
      {
        packet_id: PKT,
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
      {
        packet_id: WRONG,
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
await patchRunById(rid, {
  packet_state_map: { [PKT]: 'running', [WRONG]: 'running' },
  required_packet_ids: [PKT, WRONG],
});
const reqId = resolveCursorAutomationRequestId('inv_v76_mis');
await upsertExternalCorrelation({
  run_id: rid,
  thread_key: TK,
  packet_id: WRONG,
  provider: 'cursor',
  object_type: 'accepted_external_id',
  object_id: reqId,
});
const bodyMis = {
  type: 'statusChange',
  status: 'completed',
  request_id: reqId,
  thread_key: TK,
  packet_id: PKT,
  paths_touched: ['src/x.ts'],
};
const rawMis = Buffer.from(JSON.stringify(bodyMis), 'utf8');
const sigMis = `sha256=${crypto.createHmac('sha256', secret).update(rawMis).digest('hex')}`;
const outMis = await handleCursorWebhookIngress({
  rawBody: rawMis,
  headers: {
    'x-cursor-signature-256': sigMis,
    'x-cos-callback-source': 'provider_runtime',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(outMis.matched, true);
const rowMis = await getRunById(rid);
assert.equal(rowMis.packet_state_map[PKT], 'running');
assert.equal(rowMis.packet_state_map[WRONG], 'running');

// --- Exact packet_id: bind + callback → completed + founder completion allowed ---
reset();
const runOk = await persistRunAfterDelegate({
  threadKey: 'tk:v76:ok',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd76ok',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_ok',
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
const ridOk = String(runOk.id);
await patchRunById(ridOk, { packet_state_map: { p_ok: 'running' }, required_packet_ids: ['p_ok'] });
await saveSlackRouting('tk:v76:ok', { channel: 'C_v76_ok', thread_ts: '1.76ok' });
const invOk = 'inv_v76_ok';
const b = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: 'tk:v76:ok',
  runId: ridOk,
  packetId: 'p_ok',
  invocation_id: invOk,
  payload: { live_patch: { path: 'a.ts', operation: 'replace', content: 'z', live_only: true, no_fallback: true } },
});
assert.equal(b.ok, true);
const reqOk = String(b.request_id);
const rawOk = Buffer.from(
  JSON.stringify({
    type: 'statusChange',
    status: 'completed',
    request_id: reqOk,
    thread_key: 'tk:v76:ok',
    packet_id: 'p_ok',
    paths_touched: ['a.ts'],
  }),
  'utf8',
);
const sigOk = `sha256=${crypto.createHmac('sha256', secret).update(rawOk).digest('hex')}`;
const outOk = await handleCursorWebhookIngress({
  rawBody: rawOk,
  headers: {
    'x-cursor-signature-256': sigOk,
    'x-cos-callback-source': 'provider_runtime',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(outOk.matched, true);
const rOk = await getRunById(ridOk);
assert.equal(rOk.packet_state_map.p_ok, 'completed');
assert.equal(String(rOk.status || ''), 'completed');

let postsOk = 0;
const clientOk = {
  chat: {
    postMessage: async () => {
      postsOk += 1;
      return { ok: true };
    },
  },
};
await patchRunById(ridOk, {
  starter_kickoff: {
    executed: true,
    packet_id: 'p_ok',
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', execution_lane: 'cloud_agent' },
  },
  founder_notified_started_at: new Date().toISOString(),
  founder_notified_completed_at: null,
});
await processRunMilestones({ run: await getRunById(ridOk), client: clientOk, constitutionSha256: 'x' });
assert.equal(postsOk, 1);
assert.ok((await getRunById(ridOk)).founder_notified_completed_at);

// --- Run completed + anchor but NO dispatch ledger → founder completion skip (orchestrator-only style) ---
reset();
const runNoLed = await persistRunAfterDelegate({
  threadKey: 'tk:v76:noled',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd76nl',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_nl',
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
const ridNl = String(runNoLed.id);
await saveSlackRouting('tk:v76:noled', { channel: 'C_v76_nl', thread_ts: '1.76nl' });
await patchRunById(ridNl, {
  packet_state_map: { p_nl: 'completed' },
  required_packet_ids: ['p_nl'],
  status: 'completed',
  stage: 'finalizing',
  cursor_callback_anchor: {
    provider_structural_closure_at: new Date().toISOString(),
    provider_structural_closure_packet_id: 'p_nl',
    provider_structural_closure_source: 'provider_runtime',
  },
  starter_kickoff: {
    executed: true,
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { execution_lane: 'cloud_agent' },
  },
  founder_notified_started_at: new Date().toISOString(),
  founder_notified_completed_at: null,
});
let postsNl = 0;
await processRunMilestones({
  run: await getRunById(ridNl),
  client: {
    chat: {
      postMessage: async () => {
        postsNl += 1;
        return { ok: true };
      },
    },
  },
  constitutionSha256: 'x',
});
assert.equal(postsNl, 0);
assert.equal((await getRunById(ridNl)).founder_notified_completed_at, null);

// --- Ledger target !== closure packet → skip ---
reset();
const runMm = await persistRunAfterDelegate({
  threadKey: 'tk:v76:mm',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd76mm',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_a',
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
const ridMm = String(runMm.id);
await saveSlackRouting('tk:v76:mm', { channel: 'C_v76_mm', thread_ts: '1.76mm' });
await patchRunById(ridMm, {
  packet_state_map: { p_a: 'completed' },
  required_packet_ids: ['p_a'],
  status: 'completed',
  cursor_dispatch_ledger: {
    target_packet_id: 'p_other',
    selected_tool: 'cursor',
    selected_action: 'emit_patch',
  },
  cursor_callback_anchor: {
    provider_structural_closure_at: new Date().toISOString(),
    provider_structural_closure_packet_id: 'p_a',
    provider_structural_closure_source: 'provider_runtime',
  },
  starter_kickoff: {
    executed: true,
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { execution_lane: 'cloud_agent' },
  },
  founder_notified_started_at: new Date().toISOString(),
  founder_notified_completed_at: null,
});
let postsMm = 0;
await processRunMilestones({
  run: await getRunById(ridMm),
  client: {
    chat: {
      postMessage: async () => {
        postsMm += 1;
        return { ok: true };
      },
    },
  },
  constitutionSha256: 'x',
});
assert.equal(postsMm, 0);

// --- Smoke aggregate: orchestrator / GitHub recovery alone ≠ structural closure ---
function smokeRow(phase, at) {
  return { event_type: 'ops_smoke_phase', payload: { phase, at } };
}
assert.equal(
  aggregateSmokeSessionProgress([smokeRow('callback_orchestrator_delivery_observed', '1')]).emit_patch_structural_closure_complete,
  false,
);
assert.equal(
  aggregateSmokeSessionProgress([smokeRow('github_secondary_recovery_matched', '1')]).emit_patch_structural_closure_complete,
  false,
);
assert.equal(
  aggregateSmokeSessionProgress([
    smokeRow('authoritative_callback_closure_applied', '1'),
    smokeRow('run_packet_progression_patched', '2'),
    smokeRow('supervisor_wake_enqueued', '3'),
  ]).emit_patch_structural_closure_complete,
  true,
);

console.log('test-v13-76-packet-bind-completion-gate: ok');
