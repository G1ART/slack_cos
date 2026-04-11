import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getActiveRunForThread, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation, findExternalCorrelation } from '../src/founder/correlationStore.js';
import {
  handleGithubWebhookIngress,
  handleCursorWebhookIngress,
  __resetExternalGatewayTestState,
} from '../src/founder/externalEventGateway.js';
import { findExternalCorrelationCursorHints } from '../src/founder/correlationStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-ext-corr');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const secret = 'whsec_corr_test___________________';
const tk = 'mention:C_corr:9.9';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'h_corr',
  objective: 'corr',
  handoff_order: ['pm'],
  packets: [
    {
      persona: 'pm',
      packet_id: 'pkt_corr_1',
      packet_status: 'ready',
      preferred_tool: 'github',
      preferred_action: 'create_issue',
      mission: 'm',
      deliverables: [],
    },
  ],
};

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch,
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
assert.ok(run?.id);

await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'pkt_corr_1',
  provider: 'github',
  object_type: 'issue',
  object_id: '7',
});

const found = await findExternalCorrelation('github', 'issue', '7');
assert.ok(found);
assert.equal(found.thread_key, tk);

const bodyObj = {
  action: 'closed',
  repository: { full_name: 'G1ART/slack_cos' },
  issue: { number: 7, state: 'closed', title: 'done' },
};
const rawBody = Buffer.from(JSON.stringify(bodyObj), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const out = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sig,
    'x-github-delivery': 'del-corr-1',
  },
  env: {
    GITHUB_WEBHOOK_SECRET: secret,
    GITHUB_REPOSITORY: 'G1ART/slack_cos',
  },
});
assert.equal(out.matched, true);

const r2 = await getActiveRunForThread(tk);
assert.notEqual(
  r2.packet_state_map.pkt_corr_1,
  'completed',
  'GitHub webhook does not patch packet completion (Cursor-primary).',
);

await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'pkt_corr_1',
  provider: 'github',
  object_type: 'issue',
  object_id: '999',
});

const orphanJson = JSON.stringify({
  action: 'closed',
  repository: { full_name: 'G1ART/slack_cos' },
  issue: { number: 888, state: 'closed', title: 'orphan' },
});
const rawOrphan = Buffer.from(orphanJson, 'utf8');
const sigOrphan = `sha256=${crypto.createHmac('sha256', secret).update(rawOrphan).digest('hex')}`;
const noCorr = await handleGithubWebhookIngress({
  rawBody: rawOrphan,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sigOrphan,
    'x-github-delivery': 'del-orphan',
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.equal(noCorr.matched, false);

await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'pkt_cursor_hint',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cloud_corr_demo',
});

const byRun = await findExternalCorrelationCursorHints({
  external_run_id: 'cloud_corr_demo',
});
assert.ok(byRun);
assert.equal(byRun.thread_key, tk);

const cursorSecret = 'cursor_corr_secret_test_min_len___';
const cBody = JSON.stringify({ type: 'statusChange', runId: 'cloud_corr_demo', status: 'running' });
const cRaw = Buffer.from(cBody, 'utf8');
const cSig = `sha256=${crypto.createHmac('sha256', cursorSecret).update(cRaw).digest('hex')}`;
const cOut = await handleCursorWebhookIngress({
  rawBody: cRaw,
  headers: { 'x-cursor-signature-256': cSig },
  env: { CURSOR_WEBHOOK_SECRET: cursorSecret },
});
assert.equal(cOut.matched, true);
const rCursor = await getActiveRunForThread(tk);
assert.equal(rCursor.packet_state_map.pkt_cursor_hint, 'running');

await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'pkt_cursor_hint',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'composer_anchor_x',
});
const accBody = JSON.stringify({ backgroundComposerId: 'composer_anchor_x', status: 'completed' });
const accRaw = Buffer.from(accBody, 'utf8');
const accSig = `sha256=${crypto.createHmac('sha256', cursorSecret).update(accRaw).digest('hex')}`;
const accOut = await handleCursorWebhookIngress({
  rawBody: accRaw,
  headers: { 'x-cursor-signature-256': accSig },
  env: { CURSOR_WEBHOOK_SECRET: cursorSecret },
});
assert.equal(accOut.matched, true);

console.log('test-external-event-correlation: ok');
