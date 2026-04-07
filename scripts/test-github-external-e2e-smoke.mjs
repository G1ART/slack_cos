import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getActiveRunForThread, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { listRecentCosRunEventsForThread } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-github-e2e');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const secret = 'whsec_e2e_smoke_test________________';
const tk = 'mention:C_e2e:3.3';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_e2e',
    objective: 'e2e',
    packets: [
      {
        packet_id: 'p_e2e',
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
  packet_id: 'p_e2e',
  provider: 'github',
  object_type: 'issue',
  object_id: '100',
});

const raw = Buffer.from(
  JSON.stringify({
    action: 'closed',
    repository: { full_name: 'G1ART/slack_cos' },
    issue: { number: 100, state: 'closed', title: 'e2e' },
  }),
  'utf8',
);
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

await handleGithubWebhookIngress({
  rawBody: raw,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sig,
    'x-github-delivery': 'del-e2e-smoke',
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});

const r = await getActiveRunForThread(tk);
assert.equal(r.packet_state_map.p_e2e, 'completed');
assert.equal(r.status, 'completed');

const evs = await listRecentCosRunEventsForThread(tk, 20);
assert.ok(evs.some((e) => e.event_type === 'external_completed'));

console.log('test-github-external-e2e-smoke: ok');
