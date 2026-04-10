/**
 * vNext.13.59a — Push recovery finds envelope from run row after in-memory store reset (restart simulation).
 */
import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { registerRecoveryEnvelopeFromEmitPatchAccept } from '../src/founder/resultRecoveryBridge.js';
import { __resetRecoveryEnvelopeStoreForTests } from '../src/founder/recoveryEnvelopeStore.js';
import { applyExternalPacketProgressStateForRun } from '../src/founder/canonicalExternalEvent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-59a-restart');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;

__resetCosRunMemoryStore();
__resetRecoveryEnvelopeStoreForTests();
__resetExternalGatewayTestState();

const secret = 'whsec_v13_59a_restart_test____________';
const repo = 'G1ART/slack_cos';
const tk = 'mention:C_v1359rst:1';
const pkt = 'p1';

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd59ar',
    objective: 'x',
    packets: [
      {
        packet_id: pkt,
        packet_status: 'ready',
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
await applyExternalPacketProgressStateForRun(rid, pkt, 'running');

await registerRecoveryEnvelopeFromEmitPatchAccept({
  env: { GITHUB_REPOSITORY: repo },
  runId: rid,
  threadKey: tk,
  packetId: pkt,
  acceptedExternalId: 'cr_r',
  payload: { ops: [{ op: 'create', path: 'src/restart_ok.txt', content: 'z' }] },
});

__resetRecoveryEnvelopeStoreForTests();

const sha = 'e'.repeat(40);
const pushBody = {
  ref: 'refs/heads/main',
  after: sha,
  head_commit: { id: sha },
  repository: { full_name: repo },
  commits: [{ added: ['src/restart_ok.txt'], modified: [], removed: [] }],
};
const rawBody = Buffer.from(JSON.stringify(pushBody), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const ingress = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig,
    'x-github-delivery': `del-rst-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo },
});

assert.equal(ingress.matched, true);
assert.equal(ingress.secondary_recovery, true);
const r2 = await getRunById(rid);
assert.equal(String(r2?.packet_state_map?.[pkt] || ''), 'review_required');

console.log('test-v13-59a-durable-envelope-after-memory-reset: ok');
