/**
 * vNext.13.74 — Callback completion orchestrator: provider closure polling only (no synthetic POST).
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  __resetCosRunMemoryStore,
  persistRunAfterDelegate,
} from '../src/founder/executionRunStore.js';
import { __resetCorrelationMemoryForTests } from '../src/founder/correlationStore.js';
import {
  handleCursorWebhookIngress,
  __resetExternalGatewayTestState,
} from '../src/founder/externalEventGateway.js';
import { recordCursorCloudCorrelation } from '../src/founder/providerEventCorrelator.js';
import {
  awaitOrForceCallbackCompletion,
  __callbackOrchestratorTestHooks,
  __resetCallbackOrchestratorDedupeForTests,
  shouldRunCallbackCompletionOrchestrator,
} from '../src/founder/cursorCallbackCompletionOrchestrator.js';
import { computeEmitPatchPayloadPathFingerprint, listNormalizedEmitPatchPathsForAnchor } from '../src/founder/cursorCallbackGate.js';
import { prepareEmitPatchForCloudAutomation } from '../src/founder/livePatchPayload.js';
import {
  aggregateSmokeSessionProgress,
  summarizeOpsSmokeSessionsFromFlatRows,
  formatOpsSmokeFounderFacingLines,
} from '../src/founder/smokeOps.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-69-orch');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const secret = 'cursor_webhook_secret_test_orch_min_len__';
const tk = 'mention:orch:69.1';
const payload = {
  title: 'orch',
  live_patch: {
    path: 'src/orch-target.txt',
    operation: 'replace',
    content: 'x',
    live_only: true,
    no_fallback: true,
  },
};

function resetAll() {
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
  __resetExternalGatewayTestState();
  __resetCallbackOrchestratorDedupeForTests();
}

async function setupRun() {
  const run = await persistRunAfterDelegate({
    threadKey: tk,
    dispatch: {
      ok: true,
      status: 'accepted',
      dispatch_id: 'h_orch69',
      objective: 'o',
      packets: [
        {
          packet_id: 'p_emit',
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
  const requestId = 'req_orch_69_abc';
  const cloudRunId = 'cr_orch_69_xyz';
  const acceptedExternalId = 'bc_orch_69_accept';
  await recordCursorCloudCorrelation({
    threadKey: tk,
    packetId: 'p_emit',
    cloudRunId,
    action: 'emit_patch',
    acceptedExternalId,
    automationRequestId: requestId,
    payload,
  });
  return { run, requestId, cloudRunId, acceptedExternalId };
}

function envBase() {
  return {
    ...process.env,
    CURSOR_WEBHOOK_SECRET: secret,
    CURSOR_AUTOMATION_CALLBACK_URL: 'http://127.0.0.1:9/webhooks/cursor',
    CURSOR_AUTOMATION_FORCE_CALLBACK_TIMEOUT_SEC: '8',
    CURSOR_AUTOMATION_FORCE_CALLBACK_MAX_ATTEMPTS: '3',
  };
}

// 1) No natural provider callback → timeout, zero synthetic posts
resetAll();
{
  const { run, requestId, cloudRunId, acceptedExternalId } = await setupRun();
  const env = envBase();
  __callbackOrchestratorTestHooks.sleepMs = async () => {};
  const orch = await awaitOrForceCallbackCompletion({
    runId: String(run.id),
    threadKey: tk,
    packetId: 'p_emit',
    action: 'emit_patch',
    requestId,
    acceptedExternalId,
    externalRunId: cloudRunId,
    payload,
    env,
  });
  assert.equal(orch.status, 'callback_timeout');
  assert.equal(orch.synthetic_posts, 0);
}

// 2) Natural provider callback first → matched without POST
resetAll();
{
  const { run, requestId, cloudRunId, acceptedExternalId } = await setupRun();
  const env = envBase();
  const paths = listNormalizedEmitPatchPathsForAnchor(payload);
  const body = JSON.stringify({
    type: 'statusChange',
    status: 'completed',
    runId: cloudRunId,
    request_id: requestId,
    paths_touched: paths,
    backgroundComposerId: acceptedExternalId,
  });
  const raw = Buffer.from(body, 'utf8');
  const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
  await handleCursorWebhookIngress({
    rawBody: raw,
    headers: {
      'x-cursor-signature-256': sig,
      'x-cos-callback-source': 'provider_runtime',
    },
    env,
  });
  __callbackOrchestratorTestHooks.sleepMs = async () => {};
  const orch = await awaitOrForceCallbackCompletion({
    runId: String(run.id),
    threadKey: tk,
    packetId: 'p_emit',
    action: 'emit_patch',
    requestId,
    acceptedExternalId,
    externalRunId: cloudRunId,
    payload,
    env,
  });
  assert.equal(orch.status, 'provider_callback_matched');
  assert.equal(orch.synthetic_posts, 0);
}

// 3) Non-provider ingress phase (legacy synthetic header) → not authoritative
{
  const agg = aggregateSmokeSessionProgress([
    {
      event_type: 'cos_cursor_webhook_ingress_safe',
      payload: {
        at: '2026-04-10T12:00:00Z',
        correlation_outcome: 'matched',
        callback_source_kind: 'synthetic_orchestrator',
      },
    },
  ]);
  assert.ok(agg.phases_seen.includes('cursor_non_provider_callback_ingress'));
  assert.equal(agg.authoritative_closure_source, null);
}

// 4) Manual probe distinct (aggregate)
{
  const agg = aggregateSmokeSessionProgress([
    {
      event_type: 'cos_cursor_webhook_ingress_safe',
      payload: {
        at: '2026-04-10T12:00:00Z',
        correlation_outcome: 'matched',
        callback_source_kind: 'manual_probe',
      },
    },
  ]);
  assert.ok(agg.phases_seen.includes('cursor_manual_probe_callback_correlated'));
  assert.equal(agg.final_status, 'manual_probe_callback_matched_without_provider_closure');
}

// 5) Path fingerprint helper (emit_patch scope)
{
  const fpBody = computeEmitPatchPayloadPathFingerprint(payload);
  const fpSyn = computeEmitPatchPayloadPathFingerprint({ ...payload, live_patch: { ...payload.live_patch } });
  assert.equal(fpBody, fpSyn);
  assert.ok(listNormalizedEmitPatchPathsForAnchor(payload).length >= 1);
}

// 6) Narrow execution hint
{
  const prep = prepareEmitPatchForCloudAutomation(payload);
  assert.equal(prep.payload?.cos_execution_scope_hint?.handoff_scan_policy, 'target_path_and_parent_only');
}

// 7–8) Founder summary: provider vs non-provider lanes
{
  const sid = 'sess_orch_69';
  const flat = [
    {
      run_id: 'rA',
      event_type: 'cos_cursor_webhook_ingress_safe',
      created_at: '2026-04-10T10:00:03Z',
      payload: {
        smoke_session_id: sid,
        at: '2026-04-10T10:00:03Z',
        correlation_outcome: 'matched',
        callback_source_kind: 'provider_runtime',
        signature_verification_ok: true,
        json_parse_ok: true,
      },
    },
    {
      run_id: 'rB',
      event_type: 'cos_cursor_webhook_ingress_safe',
      created_at: '2026-04-10T10:00:04Z',
      payload: {
        smoke_session_id: sid,
        at: '2026-04-10T10:00:04Z',
        correlation_outcome: 'matched',
        callback_source_kind: 'synthetic_orchestrator',
        signature_verification_ok: true,
        json_parse_ok: true,
      },
    },
  ];
  const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
  assert.equal(s.primary_run_id, 'rA');
  assert.deepEqual(s.related_run_ids, ['rB']);
  const lines = formatOpsSmokeFounderFacingLines(s);
  assert.ok(lines.some((l) => l.includes('프로바이더=true')));
  assert.ok(lines.some((l) => l.includes('합성오케스트레이터=true')));
}

// shouldRun flags
{
  const e = { CURSOR_AUTOMATION_FORCE_CALLBACK_ON_PENDING: '0' };
  assert.equal(shouldRunCallbackCompletionOrchestrator('cursor', 'emit_patch', payload, e), false);
  const e1 = { CURSOR_AUTOMATION_FORCE_CALLBACK_ON_PENDING: '1' };
  assert.equal(shouldRunCallbackCompletionOrchestrator('cursor', 'create_spec', {}, e1), true);
  const e2 = {};
  assert.equal(shouldRunCallbackCompletionOrchestrator('cursor', 'emit_patch', payload, e2), true);
}

console.log('test-v13-69-callback-completion-orchestrator: ok');
