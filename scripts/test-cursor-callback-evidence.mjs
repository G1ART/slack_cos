import assert from 'node:assert';
import crypto from 'node:crypto';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';

process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_RUNTIME_STATE_DIR = process.cwd() + '/.runtime/test-callback-evidence';

const secretToken = 'evidence_test_secret_do_not_log_me___';
const captured = [];
const orig = console.info;
console.info = (msg) => {
  captured.push(String(msg));
  orig(msg);
};

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const tk = 'mention:cb_evidence:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ev',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_ev',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'p_ev',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'ev_run_1',
});

const bodyObj = { runId: 'ev_run_1', status: 'completed', prUrl: 'https://github.com/org/repo/pull/99' };
const body = JSON.stringify(bodyObj);
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secretToken).update(raw).digest('hex')}`;

await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig },
  env: {
    CURSOR_WEBHOOK_SECRET: secretToken,
    CURSOR_WEBHOOK_RUN_ID_PATH: 'runId',
  },
});

console.info = orig;

const evLine = captured.find((c) => c.includes('"event":"cos_cursor_callback_evidence"'));
assert.ok(evLine, 'evidence log present');
assert.ok(!evLine.includes(secretToken), 'must not leak webhook secret');
assert.ok(!evLine.includes('https://github.com'), 'must not leak full PR URL');
assert.ok(evLine.includes('payload_fingerprint_prefix'));
assert.ok(evLine.includes('external_run_id_tail'));
assert.ok(evLine.includes('matched_by'));

console.log('test-cursor-callback-evidence: ok');
