/**
 * vNext.13.75 — Receive gate (functional): dispatch ledger bind, accepted_external_id callback → progression,
 * founder-facing leak filters, default 6m orchestrator window, toolsBridge bind-before-trigger wiring.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { bindCursorEmitPatchDispatchLedgerBeforeTrigger } from '../src/founder/providerEventCorrelator.js';
import { resolveCursorAutomationRequestId } from '../src/founder/cursorCloudAdapter.js';
import {
  persistRunAfterDelegate,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { __resetCorrelationMemoryForTests } from '../src/founder/correlationStore.js';
import { __resetCosRunEventsMemoryForTests, listCosRunEventsForRun } from '../src/founder/runCosEvents.js';
import {
  filterLiveOnlyEmitPatchTechnicalLeakFromExecutionSummaryLines,
  appendExecutionArtifact,
  readExecutionSummaryForRun,
  readReviewQueueForRun,
} from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-75-gate');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function resetAll() {
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
  __resetExternalGatewayTestState();
  __resetCosRunEventsMemoryForTests();
}

resetAll();

const TK = 'mention:v75:gate';
const PKT = 'p_emit_v75';
const inv = 'inv_v75_receive_gate';

// --- 1) Bind fails → bad packet (dispatch would not proceed in toolsBridge) ---
const runBad = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd75bad',
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
const ridBad = String(runBad.id);
await patchRunById(ridBad, { packet_state_map: { [PKT]: 'running' }, required_packet_ids: [PKT] });
const bindBad = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK,
  runId: ridBad,
  packetId: 'nonexistent_packet',
  invocation_id: inv,
  payload: { live_patch: { path: 'a.ts', operation: 'replace', content: 'x', live_only: true, no_fallback: true } },
});
assert.equal(bindBad.ok, false);
assert.ok(String(bindBad.code || '').length);

// --- 2) Bind OK + provider callback matched_by accepted_external_id → packet completed ---
resetAll();
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd75ok',
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

const bindOk = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: TK,
  runId: rid,
  packetId: PKT,
  invocation_id: inv,
  payload: { live_patch: { path: 'src/v75.txt', operation: 'replace', content: 'y', live_only: true, no_fallback: true } },
});
assert.equal(bindOk.ok, true);
const reqId = resolveCursorAutomationRequestId(inv);
assert.equal(bindOk.request_id, reqId);

const evPre = await listCosRunEventsForRun(rid, 50);
assert.ok(evPre.some((e) => String(e.event_type || '') === 'cursor_dispatch_ledger_bound'));
assert.ok(!JSON.stringify(evPre).includes('_orphan'));

const secret = 'cursor_webhook_secret_test_v75_min_len_';
const body = {
  type: 'statusChange',
  status: 'completed',
  request_id: reqId,
  thread_key: TK,
  packet_id: PKT,
  paths_touched: ['src/v75.txt'],
};
const raw = Buffer.from(JSON.stringify(body), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: {
    'x-cursor-signature-256': sig,
    'x-cos-callback-source': 'provider_runtime',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out.matched, true);
assert.equal(out.matched_by, 'accepted_external_id');

const rowAfter = await getRunById(rid);
assert.equal(rowAfter.packet_state_map[PKT], 'completed');

// --- 3) Default orchestrator window ≥ 6 minutes (no new env) ---
const orchSrc = readFileSync(path.join(__dirname, '..', 'src', 'founder', 'cursorCallbackCompletionOrchestrator.js'), 'utf8');
assert.ok(
  orchSrc.includes('360_000') || orchSrc.includes('360000'),
  'default callback wait should be ~6 minutes when env timeout unset',
);

// --- 4) Founder leak line filter ---
const dirty = [
  '- tool_result degraded / cloud_agent / cursor:emit_patch / x',
  '- tool_result running / cloud_agent / cursor:emit_patch / live_completed',
];
const clean = filterLiveOnlyEmitPatchTechnicalLeakFromExecutionSummaryLines(dirty);
assert.equal(clean.length, 1);
assert.ok(String(clean[0]).includes('running'));

// --- 5) Execution summary + review queue respect suppress flags ---
const runLedger = {
  id: rid,
  thread_key: TK,
  dispatch_id: 'd75ok',
  required_packet_ids: [PKT],
};
await appendExecutionArtifact(TK, {
  type: 'tool_result',
  summary: 'internal',
  status: 'degraded',
  needs_review: true,
  payload: {
    tool: 'cursor',
    action: 'emit_patch',
    execution_mode: 'live',
    execution_lane: 'cloud_agent',
    status: 'degraded',
    cos_run_id: rid,
    suppress_from_founder_execution_summary: true,
    suppress_from_founder_review_queue: true,
    result_summary: 'degraded / cloud_agent / cursor:emit_patch — callback_timeout',
  },
});
const sumOn = await readExecutionSummaryForRun(runLedger, 8, { suppressLiveOnlyEmitPatchFounderTechnicalLeak: true });
assert.ok(!sumOn.some((l) => /callback_timeout|degraded.*cloud_agent/i.test(l)));
const rq = await readReviewQueueForRun(runLedger, 8);
assert.equal(rq.length, 0);

// --- 6) dispatch calls bind before triggerCursorAutomation (W1: dispatch lives in toolPlane) ---
const disp = readFileSync(
  path.join(__dirname, '..', 'src', 'founder', 'toolPlane', 'dispatchExternalToolCall.js'),
  'utf8',
);
const bi = disp.indexOf('bindCursorEmitPatchDispatchLedgerBeforeTrigger');
const ti = disp.indexOf('triggerCursorAutomation({');
assert.ok(bi > 0 && ti > 0 && bi < ti, 'dispatch ledger bind must precede Cursor HTTP trigger');

console.log('test-v13-75-receive-gate-functional: ok');
