/**
 * vNext.13.71 — emit_patch completion contract on trigger body, aggregate authority, toolsBridge timeout → degraded.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';
import {
  triggerCursorAutomation,
  __cursorAutomationFetchForTests,
} from '../src/founder/cursorCloudAdapter.js';
import {
  EMIT_PATCH_COMPLETION_CONTRACT_KEY,
} from '../src/founder/cursorCompletionContract.js';
import { aggregateSmokeSessionProgress, computeAuthoritativeClosureSource } from '../src/founder/smokeOps.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { __callbackOrchestratorTestHooks, __resetCallbackOrchestratorDedupeForTests } from '../src/founder/cursorCallbackCompletionOrchestrator.js';
import {
  __resetCosRunMemoryStore,
  persistRunAfterDelegate,
} from '../src/founder/executionRunStore.js';
import { recordCursorCloudCorrelation } from '../src/founder/providerEventCorrelator.js';
import { __resetCorrelationMemoryForTests } from '../src/founder/correlationStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-71');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function row(phase, at) {
  return { event_type: 'ops_smoke_phase', payload: { phase, at } };
}

// 1) Trigger body includes completion contract when callback contract enabled
{
  process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/v1371';
  process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer t';
  process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
  process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
  process.env.CURSOR_AUTOMATION_CALLBACK_URL = 'http://127.0.0.1:9/webhooks/cursor';
  process.env.CURSOR_WEBHOOK_SECRET = 'secret_v71_min_len______________';

  let captured = '';
  __cursorAutomationFetchForTests.fn = async (_url, init) => {
    captured = String(init.body || '');
    return new Response(JSON.stringify({ run_id: 'r_v71' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  await triggerCursorAutomation({
    action: 'emit_patch',
    payload: {
      title: 'p',
      live_patch: {
        path: 'src/v71.txt',
        operation: 'create',
        content: 'x',
        live_only: true,
        no_fallback: true,
      },
    },
    env: process.env,
    invocation_id: 'inv_v71',
  });

  const parsed = JSON.parse(captured);
  assert.ok(parsed[EMIT_PATCH_COMPLETION_CONTRACT_KEY], 'completion contract key present');
  const block = parsed[EMIT_PATCH_COMPLETION_CONTRACT_KEY];
  assert.equal(block.machine_rule_no_signed_callback_no_complete, true);
  assert.ok(Array.isArray(block.paths_touched_expected));
  assert.ok(block.paths_touched_expected.includes('src/v71.txt'));

  __cursorAutomationFetchForTests.fn = null;
  delete process.env.CURSOR_AUTOMATION_ENDPOINT;
  delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
  delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_URL;
  delete process.env.CURSOR_WEBHOOK_SECRET;
}

// 2) create_spec trigger does not attach emit_patch completion block
{
  process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/v1371b';
  process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer t';
  process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
  process.env.CURSOR_AUTOMATION_CALLBACK_URL = 'http://127.0.0.1:9/webhooks/cursor';
  process.env.CURSOR_WEBHOOK_SECRET = 'secret_v71_min_len______________';

  let captured = '';
  __cursorAutomationFetchForTests.fn = async (_url, init) => {
    captured = String(init.body || '');
    return new Response(JSON.stringify({ run_id: 'r_spec' }), { status: 200 });
  };
  await triggerCursorAutomation({
    action: 'create_spec',
    payload: { title: 's' },
    env: process.env,
    invocation_id: 'inv_spec',
  });
  const parsed = JSON.parse(captured);
  assert.equal(parsed[EMIT_PATCH_COMPLETION_CONTRACT_KEY], undefined);

  __cursorAutomationFetchForTests.fn = null;
  delete process.env.CURSOR_AUTOMATION_ENDPOINT;
  delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_URL;
  delete process.env.CURSOR_WEBHOOK_SECRET;
}

// 3) Authoritative closure source (exported helper + aggregate)
{
  const seenManual = new Set(['cursor_manual_probe_callback_correlated']);
  assert.equal(
    computeAuthoritativeClosureSource(seenManual, {
      provOnly: false,
      synOnly: false,
      ghClosed: false,
      manualOnlyClosed: true,
      callback_completion_state: 'manual_probe_callback_matched',
    }),
    'manual_probe',
  );

  const seenProv = new Set(['cursor_provider_callback_correlated']);
  assert.equal(
    computeAuthoritativeClosureSource(seenProv, {
      provOnly: true,
      synOnly: false,
      ghClosed: false,
      manualOnlyClosed: false,
      callback_completion_state: 'provider_callback_matched',
    }),
    'provider_runtime',
  );

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
  assert.equal(agg.authoritative_closure_source, 'synthetic_orchestrator');
}

// 4) Callback correlated without progression patch → distinct final_status
{
  const agg = aggregateSmokeSessionProgress([
    row('cursor_trigger_recorded', 'a'),
    row('trigger_accepted_external_id_present', 'b'),
    row('external_callback_matched', 'c'),
  ]);
  assert.equal(agg.final_status, 'callback_correlated_without_progression_patch');
  assert.equal(agg.authoritative_closure_source, 'provider_runtime');
  assert.equal(agg.emit_patch_structural_closure_complete, false);
}

// 5) Structural closure when progression + supervisor after provider path
{
  const agg = aggregateSmokeSessionProgress([
    row('cursor_trigger_recorded', '2026-04-01T00:00:01Z'),
    row('external_run_id_extracted', '2026-04-01T00:00:02Z'),
    row('external_callback_matched', '2026-04-01T00:00:03Z'),
    row('run_packet_progression_patched', '2026-04-01T00:00:04Z'),
    row('supervisor_wake_enqueued', '2026-04-01T00:00:05Z'),
  ]);
  assert.equal(agg.emit_patch_structural_closure_complete, true);
}

// 6) invokeExternalTool emit_patch + orchestrator timeout → degraded
{
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
  __resetCallbackOrchestratorDedupeForTests();
  __callbackOrchestratorTestHooks.sleepMs = async () => {};
  __callbackOrchestratorTestHooks.fetchImpl = async () => ({ ok: false, status: 500 });

  const tk = 'mention:v71:invoke:1';
  const run = await persistRunAfterDelegate({
    threadKey: tk,
    dispatch: {
      ok: true,
      status: 'accepted',
      dispatch_id: 'd_v71',
      objective: 'o',
      packets: [
        {
          packet_id: 'p_v71',
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

  await recordCursorCloudCorrelation({
    threadKey: tk,
    packetId: 'p_v71',
    cloudRunId: 'cr_v71',
    action: 'emit_patch',
    acceptedExternalId: 'bc_v71',
    automationRequestId: 'req_v71_invoke',
    payload: {
      live_patch: {
        path: 'src/v71-invoke.txt',
        operation: 'create',
        content: 'z',
        live_only: true,
        no_fallback: true,
      },
    },
  });

  process.env.CURSOR_CLOUD_AGENT_ENABLED = '1';
  process.env.CURSOR_AUTOMATION_ENDPOINT = 'https://example.com/hooks/v71-invoke';
  process.env.CURSOR_AUTOMATION_AUTH_HEADER = 'Bearer z';
  process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED = '1';
  process.env.CURSOR_AUTOMATION_CALLBACK_URL = 'http://127.0.0.1:9/webhooks/cursor';
  process.env.CURSOR_WEBHOOK_SECRET = 'secret_v71_min_len______________';
  process.env.CURSOR_AUTOMATION_FORCE_CALLBACK_TIMEOUT_SEC = '1';
  process.env.CURSOR_AUTOMATION_FORCE_CALLBACK_MAX_ATTEMPTS = '2';

  __cursorAutomationFetchForTests.fn = async () =>
    new Response(
      JSON.stringify({
        run_id: 'cr_v71',
        backgroundComposerId: 'bc_v71',
        callbackUrl: 'http://127.0.0.1:9/webhooks/cursor',
        webhookSecret: 'x',
        response_top_level_keys: ['run_id', 'callbackUrl', 'webhookSecret'],
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );

  const inv = await invokeExternalTool(
    {
      tool: 'cursor',
      action: 'emit_patch',
      payload: {
        title: 't',
        live_patch: {
          path: 'src/v71-invoke.txt',
          operation: 'create',
          content: 'z',
          live_only: true,
          no_fallback: true,
        },
      },
    },
    { threadKey: tk, cosRunId: rid, packetId: 'p_v71' },
  );

  assert.equal(inv.status, 'degraded');
  assert.equal(inv.error_code, 'emit_patch_callback_timeout');
  assert.ok(String(inv.degraded_from || '').includes('emit_patch_callback_timeout'));

  __cursorAutomationFetchForTests.fn = null;
  __callbackOrchestratorTestHooks.fetchImpl = null;
  __callbackOrchestratorTestHooks.sleepMs = null;
  delete process.env.CURSOR_CLOUD_AGENT_ENABLED;
  delete process.env.CURSOR_AUTOMATION_ENDPOINT;
  delete process.env.CURSOR_AUTOMATION_AUTH_HEADER;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED;
  delete process.env.CURSOR_AUTOMATION_CALLBACK_URL;
  delete process.env.CURSOR_WEBHOOK_SECRET;
  delete process.env.CURSOR_AUTOMATION_FORCE_CALLBACK_TIMEOUT_SEC;
  delete process.env.CURSOR_AUTOMATION_FORCE_CALLBACK_MAX_ATTEMPTS;
}

console.log('test-v13-71-completion-contract-and-aggregate: ok');
