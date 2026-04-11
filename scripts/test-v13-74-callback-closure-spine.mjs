/**
 * vNext.13.74 — Callback closure spine: invoice id, direct-key correlation, fp evidence-only, no synthetic strings.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { extractAutomationResponseFields } from '../src/founder/cursorCloudAdapter.js';
import { computePathsArrayFingerprint } from '../src/founder/cursorCallbackGate.js';
import { normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';
import { upsertExternalCorrelation, __resetCorrelationMemoryForTests } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import {
  persistRunAfterDelegate,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import {
  appendExecutionArtifact,
  readExecutionSummaryForRun,
  filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines,
} from '../src/founder/executionLedger.js';
import { __resetCosRunEventsMemoryForTests, listCosRunEventsForRun } from '../src/founder/runCosEvents.js';
import { canonicalizeExternalRunStatus } from '../src/founder/externalRunStatus.js';
import { saveSlackRouting } from '../src/founder/slackRoutingStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-74-spine');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

// --- (1) Trigger: only backgroundComposerId; invoice = local request_id ---
{
  const parsed = { success: true, backgroundComposerId: 'bg_only_xyz' };
  const localReq = 'tool_req_1374_invoice';
  const ex = extractAutomationResponseFields(parsed, {}, { localTriggerRequestId: localReq });
  assert.equal(ex.accepted_external_id, localReq);
  assert.equal(ex.selected_accepted_id_field_name, 'local_trigger_request_id');
  assert.equal(ex.provider_run_hint, 'bg_only_xyz');
}

// --- (2) Exact provider fixture: direct correlation, progression, positive terminal ---
const fixturePath = path.join(__dirname, 'fixtures', 'cursor-exact-provider-callback-v13-73.json');
const exactPayload = JSON.parse(readFileSync(fixturePath, 'utf8'));
const secret = 'cursor_webhook_secret_test_exact_v73___';
const RUN_UUID = '6143dd0d-0fcb-439c-91c7-997caecb5b79';
const TK = 'mention:C0AMELPEFRC:1775874613.196639';
const PKT = 'cursor-live-smoke-single-file';

__resetCosRunMemoryStore();
__resetCorrelationMemoryForTests();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();

await saveSlackRouting(TK, { channel: 'C_v1374', thread_ts: '1.1374' });
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_v1374',
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
assert.ok(
  out.matched_by === 'external_run_id' || out.matched_by === 'accepted_external_id',
  `direct key expected, got ${out.matched_by}`,
);
const canonSt = canonicalizeExternalRunStatus(String(exactPayload.status || ''));
assert.equal(canonSt.bucket, 'positive_terminal');
const r1 = await getRunById(rid);
assert.equal(r1.packet_state_map[PKT], 'completed');
assert.ok(r1.cursor_callback_anchor?.provider_structural_closure_at);

await patchRunById(rid, {
  cursor_dispatch_ledger: {
    bound_at: new Date().toISOString(),
    target_packet_id: PKT,
    automation_request_id: 'ledger_v1374',
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
const { processRunMilestones } = await import('../src/founder/runSupervisor.js');
let founderPosts = 0;
const slackClient = {
  chat: {
    postMessage: async (args) => {
      founderPosts += 1;
      const tx = String(args?.text || '');
      assert.ok(tx.includes('마쳤') || tx.includes('completed') || tx.includes('1차'));
      return { ok: true };
    },
  },
};
await processRunMilestones({ run: await getRunById(rid), client: slackClient, constitutionSha256: 'x' });
assert.equal(founderPosts, 1);
assert.ok((await getRunById(rid)).founder_notified_completed_at);

// --- (3) Path-fingerprint-only correlation: matched but packet stays running (no authoritative progression) ---
__resetCosRunMemoryStore();
__resetCorrelationMemoryForTests();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();

const paths = ['src/correlate_fp_only.md'];
const fp = computePathsArrayFingerprint(paths);
const reqId = 'ca_v1374_fp_req';
const run2 = await persistRunAfterDelegate({
  threadKey: 'mention:v1374:fp:1',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd1374fp',
    objective: 'x',
    packets: [{ packet_id: 'p_fp', packet_status: 'running', preferred_tool: 'cursor', preferred_action: 'emit_patch', mission: 'm' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid2 = String(run2.id);
await patchRunById(rid2, { packet_state_map: { p_fp: 'running' }, required_packet_ids: ['p_fp'] });
await upsertExternalCorrelation({
  run_id: rid2,
  thread_key: 'mention:v1374:fp:1',
  packet_id: 'p_fp',
  provider: 'cursor',
  object_type: 'automation_request_path_fp',
  object_id: `${reqId}|${fp}`,
});

const normOk = normalizeCursorWebhookPayload({
  request_id: reqId,
  paths_touched: paths,
  status: 'completed',
});
assert.ok(normOk);
const raw2 = Buffer.from(
  JSON.stringify({
    request_id: reqId,
    paths_touched: paths,
    status: 'completed',
  }),
  'utf8',
);
const sig2 = `sha256=${crypto.createHmac('sha256', secret).update(raw2).digest('hex')}`;
const out2 = await handleCursorWebhookIngress({
  rawBody: raw2,
  headers: { 'x-cursor-signature-256': sig2 },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out2.matched, true);
assert.equal(out2.matched_by, 'automation_request_path_fp');
const r2 = await getRunById(rid2);
assert.equal(r2.packet_state_map.p_fp, 'running');

// --- (4) No forbidden synthetic log tokens in fresh run events ---
const evs = await listCosRunEventsForRun(rid2, 200);
const blob = JSON.stringify(evs);
for (const tok of ['synthetic_callback_matched', 'cursor_synthetic_callback_correlated']) {
  assert.ok(!blob.includes(tok), `unexpected token ${tok}`);
}

// --- (5) Founder completion summary: filter drops stale live-only create_spec blocked rows ---
{
  const filtered = filterStaleLiveOnlyCreateSpecLeakFromExecutionSummaryLines([
    'running / cloud_agent / cursor:emit_patch — ok',
    'blocked / cursor:create_spec — create_spec_disallowed_in_live_only_mode',
  ]);
  assert.equal(filtered.length, 1);
  assert.ok(!filtered.join('|').includes('create_spec_disallowed_in_live_only_mode'));
}

const tkL = 'mention:v1374:ledger:1';
const run3 = await persistRunAfterDelegate({
  threadKey: tkL,
  dispatch: { ok: true, status: 'accepted', dispatch_id: 'dL', objective: 'o', packets: [] },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid3 = String(run3.id);
await appendExecutionArtifact(tkL, {
  type: 'tool_result',
  summary: 'stale block',
  status: 'blocked',
  payload: {
    cos_run_id: rid3,
    tool: 'cursor',
    action: 'create_spec',
    outcome_code: 'create_spec_disallowed_in_live_only_mode',
  },
});
const fakeRun = { ...run3, thread_key: tkL };
const linesAll = await readExecutionSummaryForRun(fakeRun, 8, { suppressStaleLiveOnlyCreateSpecLeak: false });
const linesSup = await readExecutionSummaryForRun(fakeRun, 8, { suppressStaleLiveOnlyCreateSpecLeak: true });
assert.ok(linesAll.some((l) => String(l).includes('create_spec_disallowed_in_live_only_mode')));
assert.ok(linesSup.every((l) => !String(l).includes('create_spec_disallowed_in_live_only_mode')));

console.log('test-v13-74-callback-closure-spine: ok');
