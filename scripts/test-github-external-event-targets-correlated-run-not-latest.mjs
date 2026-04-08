import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  getRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-github-corr-target');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const secret = 'whsec_github_target_test____________';
const tk = 'mention:vnext38_github_target:1';

const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_ga',
    objective: 'ga',
    handoff_order: ['pm'],
    packets: [
      {
        persona: 'pm',
        packet_id: 'pkt_ga',
        packet_status: 'ready',
        preferred_tool: 'github',
        preferred_action: 'create_issue',
        mission: 'm',
        deliverables: [],
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const ridA = String(runA.id);

await upsertExternalCorrelation({
  run_id: ridA,
  thread_key: tk,
  packet_id: 'pkt_ga',
  provider: 'github',
  object_type: 'issue',
  object_id: '701',
});

const runB = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_gb',
    objective: 'gb',
    handoff_order: ['pm'],
    packets: [
      {
        persona: 'pm',
        packet_id: 'pkt_gb',
        packet_status: 'ready',
        preferred_tool: 'github',
        preferred_action: 'create_issue',
        mission: 'm2',
        deliverables: [],
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const ridB = String(runB.id);

assert.notEqual(ridA, ridB);
assert.equal(String((await getActiveRunForThread(tk)).id), ridB);

const bodyObj = {
  action: 'closed',
  repository: { full_name: 'G1ART/slack_cos' },
  issue: { number: 701, state: 'closed', title: 'done' },
};
const rawBody = Buffer.from(JSON.stringify(bodyObj), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const out = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sig,
    'x-github-delivery': 'del-github-target-701',
  },
  env: {
    GITHUB_WEBHOOK_SECRET: secret,
    GITHUB_REPOSITORY: 'G1ART/slack_cos',
  },
});
assert.equal(out.matched, true);

const patchedA = await getRunById(ridA);
const patchedB = await getRunById(ridB);
assert.notEqual(
  patchedA.packet_state_map.pkt_ga,
  'completed',
  'GitHub correlation must not advance packet terminal state (secondary evidence only).',
);
assert.equal(patchedB.packet_state_map.pkt_gb, 'queued');

console.log('test-github-external-event-targets-correlated-run-not-latest: ok');
