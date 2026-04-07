import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerRunStateChangeListener } from '../src/founder/supervisorDirectTrigger.js';
import { persistRunAfterDelegate, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-ext-wake');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

let wakes = 0;
registerRunStateChangeListener(() => {
  wakes += 1;
});

const secret = 'whsec_wake_test___________________';
const tk = 'mention:C_wake:1.1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_wake',
    objective: 'wake',
    packets: [
      {
        packet_id: 'p_wake',
        packet_status: 'ready',
        preferred_tool: 'github',
        preferred_action: 'create_issue',
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
  packet_id: 'p_wake',
  provider: 'github',
  object_type: 'issue',
  object_id: '55',
});

const body = JSON.stringify({
  action: 'closed',
  repository: { full_name: 'G1ART/slack_cos' },
  issue: { number: 55, state: 'closed', title: 't' },
});
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

const prev = wakes;
await handleGithubWebhookIngress({
  rawBody: raw,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sig,
    'x-github-delivery': 'del-wake-1',
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});

await Promise.resolve();
await Promise.resolve();
assert.ok(wakes > prev, 'notifyRunStateChanged should fire after external event');

registerRunStateChangeListener(null);

console.log('test-external-event-wakes-supervisor: ok');
