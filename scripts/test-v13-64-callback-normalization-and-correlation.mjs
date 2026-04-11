/**
 * vNext.13.64 — Callback basis: accepted id primary, request_id+fp pair, correlation for path_fp.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { extractAutomationResponseFields } from '../src/founder/cursorCloudAdapter.js';
import { computePathsArrayFingerprint } from '../src/founder/cursorCallbackGate.js';
import { normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';
import { upsertExternalCorrelation, __resetCorrelationMemoryForTests } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-64-callback');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCorrelationMemoryForTests();
__resetExternalGatewayTestState();

const onlyComposer = extractAutomationResponseFields({ success: true, backgroundComposerId: 'bc_v1364' }, {});
assert.equal(onlyComposer.accepted_external_id, null);
assert.equal(onlyComposer.has_accepted_external_id, false);
assert.equal(onlyComposer.provider_run_hint, 'bc_v1364');
assert.equal(onlyComposer.has_run_id, false);
assert.equal(onlyComposer.accepted_external_id_source, 'absent');
assert.equal(onlyComposer.run_id_source, 'absent');

const withOverride = extractAutomationResponseFields(
  { success: true, backgroundComposerId: 'ignored', nested: { x: 'bc_override' } },
  { CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH: 'nested.x' },
);
assert.equal(withOverride.accepted_external_id, 'bc_override');
assert.equal(withOverride.accepted_external_id_source, 'override');

// v13.73b: request_id fills accepted_external_id_hint → normalization accepts (correlation may still miss).
const soloNorm = normalizeCursorWebhookPayload({ request_id: 'solo_req' });
assert.ok(soloNorm);
assert.equal(soloNorm.canonical.accepted_external_id_hint, 'solo_req');
assert.ok(
  normalizeCursorWebhookPayload({ request_id: 'pair_only', paths_touched: ['a/x.txt'], status: 'done' }),
  'request_id + path fingerprint is a valid normalization basis (correlation may still miss)',
);

const paths = ['src/correlate_me.md'];
const fp = computePathsArrayFingerprint(paths);
const reqId = 'ca_v1364_req';

const run = await persistRunAfterDelegate({
  threadKey: 'mention:v1364:cb:1',
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd1364',
    objective: 'x',
    packets: [{ packet_id: 'p1', packet_status: 'ready', preferred_tool: 'cursor', preferred_action: 'emit_patch', mission: 'm' }],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
assert.ok(run?.id);
await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: 'mention:v1364:cb:1',
  packet_id: 'p1',
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
assert.equal(normOk.canonical.callback_request_id_hint, reqId);

const sec = 'cursor_v1364_secret_test_min_len__';
const raw = Buffer.from(
  JSON.stringify({
    request_id: reqId,
    paths_touched: paths,
    status: 'completed',
  }),
  'utf8',
);
const sig = `sha256=${crypto.createHmac('sha256', sec).update(raw).digest('hex')}`;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig },
  env: { CURSOR_WEBHOOK_SECRET: sec },
});
assert.equal(out.matched, true);

console.log('test-v13-64-callback-normalization-and-correlation: ok');
