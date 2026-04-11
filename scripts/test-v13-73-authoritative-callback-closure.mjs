/**
 * vNext.13.73 — Authoritative emit_patch closure: packet resolution, provider-only progression, events, aggregate, summary filter.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { resolveEmitPatchAuthoritativePacketId } from '../src/founder/canonicalExternalEvent.js';
import { filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines } from '../src/founder/executionLedger.js';
import { aggregateSmokeSessionProgress } from '../src/founder/smokeOps.js';
import { persistRunAfterDelegate, getRunById, patchRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-73-closure');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();

// 1) Two running emit_patch packets → unresolved
const runAmb = await persistRunAfterDelegate({
  threadKey: 't:v73:amb',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_amb',
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
await patchRunById(String(runAmb.id), {
  packet_state_map: { pa: 'running', pb: 'running' },
  required_packet_ids: ['pa', 'pb'],
});
const rowAmb = await getRunById(String(runAmb.id));
const rAmb = resolveEmitPatchAuthoritativePacketId(rowAmb, { packet_id: null }, {
  provider: 'cursor',
  packet_id_hint: null,
});
assert.equal(rAmb.packetId, '');
assert.equal(rAmb.closure_not_applied_reason, 'correlation_packet_id_required');

const secret = 'cursor_webhook_secret_test_min_len__';

// 2) Provider runtime → progression + durable closure fields + single authoritative event
const tk = 'mention:v73:ok';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd73',
    objective: 'o',
    packets: [
      {
        packet_id: 'p73',
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
await patchRunById(rid, { packet_state_map: { p73: 'running' }, required_packet_ids: ['p73'] });
await upsertExternalCorrelation({
  run_id: rid,
  thread_key: tk,
  packet_id: 'p73',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cr_v73_ok',
});

const body = JSON.stringify({
  type: 'statusChange',
  runId: 'cr_v73_ok',
  status: 'completed',
  request_id: 'req_v73',
  paths_touched: ['src/x.ts'],
});
const raw = Buffer.from(body, 'utf8');
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
const rOk = await getRunById(rid);
assert.equal(rOk.packet_state_map.p73, 'completed');
assert.ok(rOk.cursor_callback_anchor?.provider_structural_closure_at);
assert.equal(rOk.cursor_callback_anchor?.provider_structural_closure_source, 'provider_runtime');
assert.equal(rOk.cursor_callback_anchor?.provider_structural_closure_packet_id, 'p73');
assert.equal(rOk.cursor_callback_anchor?.provider_structural_closure_status_bucket, 'positive_terminal');

const evs = await listCosRunEventsForRun(rid, 80);
const authEv = evs.filter((e) => String(e.event_type || '') === 'cursor_authoritative_closure_applied');
const notApp = evs.filter((e) => String(e.event_type || '') === 'cursor_callback_correlated_but_closure_not_applied');
assert.equal(authEv.length, 1);
assert.equal(notApp.length, 0);

// 3) Duplicate verified callback → still one authoritative event
const outDup = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: {
    'x-cursor-signature-256': sig,
    'x-cos-callback-source': 'provider_runtime',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(outDup.matched, true);
const evs2 = await listCosRunEventsForRun(rid, 120);
const authEv2 = evs2.filter((e) => String(e.event_type || '') === 'cursor_authoritative_closure_applied');
assert.equal(authEv2.length, 1);

// 4) Synthetic orchestrator → matched, no progression, no structural closure
const tkS = 'mention:v73:syn';
const runS = await persistRunAfterDelegate({
  threadKey: tkS,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd73s',
    objective: 'o',
    packets: [
      {
        packet_id: 'p73s',
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
const ridS = String(runS.id);
await patchRunById(ridS, { packet_state_map: { p73s: 'running' }, required_packet_ids: ['p73s'] });
await upsertExternalCorrelation({
  run_id: ridS,
  thread_key: tkS,
  packet_id: 'p73s',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cr_v73_syn',
});
const bodyS = JSON.stringify({ type: 'statusChange', runId: 'cr_v73_syn', status: 'completed' });
const rawS = Buffer.from(bodyS, 'utf8');
const sigS = `sha256=${crypto.createHmac('sha256', secret).update(rawS).digest('hex')}`;
await handleCursorWebhookIngress({
  rawBody: rawS,
  headers: {
    'x-cursor-signature-256': sigS,
    'x-cos-callback-source': 'synthetic_orchestrator',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
const rSyn = await getRunById(ridS);
assert.equal(rSyn.packet_state_map.p73s, 'running');
assert.ok(!rSyn.cursor_callback_anchor?.provider_structural_closure_at);

// 5) Non-probe header value → still treated as provider_runtime (v13.73b); progression applies
const tkU = 'mention:v73:unk';
const runU = await persistRunAfterDelegate({
  threadKey: tkU,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd73u',
    objective: 'o',
    packets: [
      {
        packet_id: 'p73u',
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
const ridU = String(runU.id);
await patchRunById(ridU, { packet_state_map: { p73u: 'running' }, required_packet_ids: ['p73u'] });
await upsertExternalCorrelation({
  run_id: ridU,
  thread_key: tkU,
  packet_id: 'p73u',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cr_v73_u',
});
const bodyU = JSON.stringify({ type: 'statusChange', runId: 'cr_v73_u', status: 'completed' });
const rawU = Buffer.from(bodyU, 'utf8');
const sigU = `sha256=${crypto.createHmac('sha256', secret).update(rawU).digest('hex')}`;
await handleCursorWebhookIngress({
  rawBody: rawU,
  headers: {
    'x-cursor-signature-256': sigU,
    'x-cos-callback-source': 'not_a_real_kind',
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
const rU = await getRunById(ridU);
assert.equal(rU.packet_state_map.p73u, 'completed');
assert.ok(rU.cursor_callback_anchor?.provider_structural_closure_at);

// 6) Founder summary: strip stale live-only create_spec blocked lines
const filtered = filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines([
  '- tool_result blocked / artifact / cursor:create_spec / create_spec_disallowed_in_live_only_mode',
  '- tool_result completed / artifact / cursor:emit_patch',
]);
assert.equal(filtered.length, 1);
assert.ok(filtered[0].includes('emit_patch'));

// 7) Ops aggregate: authoritative closure is top-level success signal
function row(phase, at) {
  return { event_type: 'ops_smoke_phase', payload: { phase, at } };
}
const agg = aggregateSmokeSessionProgress([
  row('cursor_trigger_recorded', '2026-04-01T00:00:01Z'),
  row('authoritative_callback_closure_applied', '2026-04-01T00:00:04Z'),
]);
assert.equal(agg.callback_completion_state, 'authoritative_callback_closure_applied');
assert.equal(agg.final_status, 'authoritative_callback_closure_applied');

console.log('test-v13-73-authoritative-callback-closure: ok');
