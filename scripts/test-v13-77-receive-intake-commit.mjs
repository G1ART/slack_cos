/**
 * vNext.13.77 — Single intake commit path (accepted_external_id row + ledger + callback context exact match).
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { commitReceivedCursorCallbackToRunPacket } from '../src/founder/cursorReceiveCommit.js';
import { bindCursorEmitPatchDispatchLedgerBeforeTrigger } from '../src/founder/providerEventCorrelator.js';
import {
  persistRunAfterDelegate,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { __resetCorrelationMemoryForTests, upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { __resetCosRunEventsMemoryForTests, listCosRunEventsForRun } from '../src/founder/runCosEvents.js';
import { aggregateSmokeSessionProgress, summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-77-intake');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function reset() {
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
  __resetExternalGatewayTestState();
  __resetCosRunEventsMemoryForTests();
}

const secret = 'cursor_webhook_secret_test_v77_min_len__';

function smokeRow(phase, at) {
  return { event_type: 'ops_smoke_phase', payload: { phase, at } };
}

// --- (1) live_24-style: accepted row + bind + exact context → completed run ---
reset();
const TK = 'mention:v77:live24';
const PKT = 'p_emit_v77';
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd77',
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
const rid = String(run.id);
await patchRunById(rid, { packet_state_map: { [PKT]: 'running' }, required_packet_ids: [PKT] });
const bind = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK,
  runId: rid,
  packetId: PKT,
  invocation_id: 'inv_v77_live',
  payload: { live_patch: { path: 'src/v77.txt', operation: 'create', content: 'x', live_only: true, no_fallback: true } },
});
assert.equal(bind.ok, true);
const reqId = String(bind.request_id);
const bodyOk = {
  type: 'statusChange',
  status: 'completed',
  request_id: reqId,
  thread_key: TK,
  packet_id: PKT,
  paths_touched: ['src/v77.txt'],
};
const rawOk = Buffer.from(JSON.stringify(bodyOk), 'utf8');
const sigOk = `sha256=${crypto.createHmac('sha256', secret).update(rawOk).digest('hex')}`;
const outOk = await handleCursorWebhookIngress({
  rawBody: rawOk,
  headers: { 'x-cursor-signature-256': sigOk, 'x-cos-callback-source': 'provider_runtime' },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(outOk.matched, true);
const rOk = await getRunById(rid);
assert.equal(rOk.packet_state_map[PKT], 'completed');
assert.equal(String(rOk.status || ''), 'completed');
assert.ok(rOk.cursor_callback_anchor?.provider_structural_closure_at);
const evOk = await listCosRunEventsForRun(rid, 80);
const intakeEv = evOk.filter((e) => String(e.event_type || '') === 'cursor_receive_intake_committed');
assert.equal(intakeEv.length, 1, 'one intake commit event');

// --- (1b) Minimal signed body: only request_id + status (no thread_key / packet_id) → correlation fallback commits ---
reset();
const TKb = 'mention:v77:minimal';
const PKb = 'p_min_v77';
const runB = await persistRunAfterDelegate({
  threadKey: TKb,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd77b',
    objective: 'o',
    packets: [
      {
        packet_id: PKb,
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
const ridB = String(runB.id);
await patchRunById(ridB, { packet_state_map: { [PKb]: 'running' }, required_packet_ids: [PKb] });
const bindB = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TKb,
  runId: ridB,
  packetId: PKb,
  invocation_id: 'inv_v77_min',
  payload: { live_patch: { path: 'src/min.txt', operation: 'create', content: 'm', live_only: true, no_fallback: true } },
});
assert.equal(bindB.ok, true);
const reqB = String(bindB.request_id);
const bodyMin = {
  type: 'statusChange',
  status: 'completed',
  request_id: reqB,
};
const rawMin = Buffer.from(JSON.stringify(bodyMin), 'utf8');
const sigMin = `sha256=${crypto.createHmac('sha256', secret).update(rawMin).digest('hex')}`;
const outMin = await handleCursorWebhookIngress({
  rawBody: rawMin,
  headers: { 'x-cursor-signature-256': sigMin, 'x-cos-callback-source': 'provider_runtime' },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(outMin.matched, true);
const rB = await getRunById(ridB);
assert.equal(rB.packet_state_map[PKb], 'completed');
const evB = await listCosRunEventsForRun(ridB, 80);
const intakeB = evB.filter((e) => String(e.event_type || '') === 'cursor_receive_intake_committed');
assert.equal(intakeB.length, 1, 'minimal body still produces intake commit via correlation fallback');

// --- (2) accepted_external_id row matches but callback packet_id ≠ correlation packet_id → no commit ---
reset();
const TK2 = 'mention:v77:mis';
const run2 = await persistRunAfterDelegate({
  threadKey: TK2,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd77m',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_right',
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
await patchRunById(rid2, { packet_state_map: { p_right: 'running' }, required_packet_ids: ['p_right'] });
const bindMisOut = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK2,
  runId: rid2,
  packetId: 'p_right',
  invocation_id: 'inv_v77_mis',
  payload: { live_patch: { path: 'a.ts', operation: 'create', content: '1', live_only: true, no_fallback: true } },
});
assert.equal(bindMisOut.ok, true);
const reqMis = String(bindMisOut.request_id);
const bodyMis = {
  type: 'statusChange',
  status: 'completed',
  request_id: reqMis,
  thread_key: TK2,
  packet_id: 'p_wrong',
  paths_touched: ['a.ts'],
};
const rawMis = Buffer.from(JSON.stringify(bodyMis), 'utf8');
const sigMis = `sha256=${crypto.createHmac('sha256', secret).update(rawMis).digest('hex')}`;
await handleCursorWebhookIngress({
  rawBody: rawMis,
  headers: { 'x-cursor-signature-256': sigMis, 'x-cos-callback-source': 'provider_runtime' },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
const rMis = await getRunById(rid2);
assert.equal(rMis.packet_state_map.p_right, 'running');
assert.notEqual(String(rMis.status || ''), 'completed');

// --- (3) duplicate terminal callback → idempotent; single cursor_receive_intake_committed ---
reset();
const TK3 = 'mention:v77:dup';
const run3 = await persistRunAfterDelegate({
  threadKey: TK3,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd77d',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_dup',
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
await patchRunById(rid3, { packet_state_map: { p_dup: 'running' }, required_packet_ids: ['p_dup'] });
const b3 = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK3,
  runId: rid3,
  packetId: 'p_dup',
  invocation_id: 'inv_v77_dup',
  payload: { live_patch: { path: 'd.ts', operation: 'create', content: 'd', live_only: true, no_fallback: true } },
});
assert.equal(b3.ok, true);
const req3 = String(b3.request_id);
const bodyDup = {
  type: 'statusChange',
  status: 'completed',
  request_id: req3,
  thread_key: TK3,
  packet_id: 'p_dup',
  paths_touched: ['d.ts'],
};
const rawDup = Buffer.from(JSON.stringify(bodyDup), 'utf8');
const sigDup = `sha256=${crypto.createHmac('sha256', secret).update(rawDup).digest('hex')}`;
const hdr = { 'x-cursor-signature-256': sigDup, 'x-cos-callback-source': 'provider_runtime' };
await handleCursorWebhookIngress({ rawBody: rawDup, headers: hdr, env: { CURSOR_WEBHOOK_SECRET: secret } });
await handleCursorWebhookIngress({ rawBody: rawDup, headers: hdr, env: { CURSOR_WEBHOOK_SECRET: secret } });
const evDup = await listCosRunEventsForRun(rid3, 100);
const intakes = evDup.filter((e) => String(e.event_type || '') === 'cursor_receive_intake_committed');
assert.equal(intakes.length, 1);

// --- (4) Direct commit API: correlation exists, dispatch ledger missing → committed false ---
reset();
const TK4 = 'mention:v77:noldg';
const run4 = await persistRunAfterDelegate({
  threadKey: TK4,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd77nl',
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
const rid4 = String(run4.id);
await patchRunById(rid4, { packet_state_map: { p_nl: 'running' }, required_packet_ids: ['p_nl'] });
await upsertExternalCorrelation({
  run_id: rid4,
  thread_key: TK4,
  packet_id: 'p_nl',
  provider: 'cursor',
  object_type: 'accepted_external_id',
  object_id: 'acc_no_ledger_v77',
});
const direct = await commitReceivedCursorCallbackToRunPacket({
  accepted_external_id: 'acc_no_ledger_v77',
  callback_thread_key: TK4,
  callback_packet_id: 'p_nl',
  canonical: {
    provider: 'cursor',
    occurred_at: new Date().toISOString(),
    payload: { status: 'completed' },
  },
  status_bucket: 'positive_terminal',
  ingress_meta: { matched_by: 'accepted_external_id', payload_fingerprint_prefix: 'abc' },
});
assert.equal(direct.committed, false);
assert.equal(direct.reason, 'dispatch_ledger_target_missing');

// --- (5) Ops aggregate: full provider closure + progression ≠ stuck at callback_correlated_without_progression_patch ---
const agg = aggregateSmokeSessionProgress([
  smokeRow('external_callback_matched', '1'),
  smokeRow('authoritative_callback_closure_applied', '2'),
  smokeRow('run_packet_progression_patched', '3'),
  smokeRow('supervisor_wake_enqueued', '4'),
]);
assert.notEqual(agg.final_status, 'callback_correlated_without_progression_patch');
assert.equal(agg.emit_patch_structural_closure_complete, true);

// --- orchestrator-only evidence still ≠ structural closure (regression) ---
assert.equal(
  aggregateSmokeSessionProgress([smokeRow('callback_orchestrator_delivery_observed', '1')]).emit_patch_structural_closure_complete,
  false,
);

// cos_run_events cursor_receive_intake_committed → same break gate as ops_smoke run_packet_progression_patched
const aggIntakeRow = aggregateSmokeSessionProgress([
  { event_type: 'cursor_receive_intake_committed', payload: { at: '1', target_packet_id: 'p_x' } },
]);
assert.ok(aggIntakeRow.phases_seen.includes('run_packet_progression_patched'));

// --- (6) Ops summary: prefer durable run_id over _orphan when both appear for one smoke_session_id ---
const flatOrphanMix = [
  {
    run_id: '_orphan',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 'sess_v77_orph', phase: 'cursor_trigger_recorded', at: '2026-01-02T00:00:00Z' },
    created_at: '2026-01-02T00:00:00Z',
  },
  {
    run_id: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 'sess_v77_orph', phase: 'emit_patch', at: '2026-01-01T00:00:00Z' },
    created_at: '2026-01-01T00:00:00Z',
  },
];
const sumOrph = summarizeOpsSmokeSessionsFromFlatRows(flatOrphanMix, { sessionLimit: 5 })[0];
assert.equal(sumOrph.primary_run_id, 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
assert.ok(sumOrph.related_run_ids.includes('_orphan'));

// --- (7) Intake without smoke_session_id in payload → attach to session via COS run_id (Supabase merge shape) ---
const flatIntakeAttrib = [
  {
    run_id: 'run-uuid-intake-attrib',
    event_type: 'ops_smoke_phase',
    created_at: '2026-01-01T00:00:00Z',
    payload: {
      smoke_session_id: 'sess_intake_attrib',
      phase: 'cursor_trigger_recorded',
      at: '2026-01-01T00:00:00Z',
    },
  },
  {
    run_id: 'run-uuid-intake-attrib',
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-01-01T00:01:00Z',
    payload: {
      target_run_id: 'run-uuid-intake-attrib',
      target_packet_id: 'p_x',
      terminal_bucket: 'positive_terminal',
    },
  },
];
const sumInt = summarizeOpsSmokeSessionsFromFlatRows(flatIntakeAttrib, { sessionLimit: 5 })[0];
assert.ok(
  sumInt.phases_seen.includes('run_packet_progression_patched'),
  'intake row must count as progression when attributed by run_id',
);
assert.notEqual(sumInt.final_status, 'callback_correlated_without_progression_patch');

console.log('test-v13-77-receive-intake-commit: ok');
