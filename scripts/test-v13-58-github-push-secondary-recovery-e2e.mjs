/**
 * vNext.13.58 — Register recovery envelope + GitHub push ingress attaches secondary recovery to run.
 */
import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { registerRecoveryEnvelopeFromEmitPatchAccept } from '../src/founder/resultRecoveryBridge.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { applyExternalPacketProgressStateForRun } from '../src/founder/canonicalExternalEvent.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-58-push-recovery');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetExternalGatewayTestState();

const secret = 'whsec_v13_58_recovery_test____________';
const repo = 'G1ART/slack_cos';
const tk = 'mention:C_v1358push:1';
const pkt = 'p_v58_emit';

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_v58',
    objective: 'v58',
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
assert.ok(run?.id);
const rid = String(run.id);

await applyExternalPacketProgressStateForRun(rid, pkt, 'running');

const env = { GITHUB_REPOSITORY: repo };
await registerRecoveryEnvelopeFromEmitPatchAccept({
  env,
  runId: rid,
  threadKey: tk,
  packetId: pkt,
  acceptedExternalId: 'cr_test_ext',
  smoke_session_id: 'sess_v13_58',
  payload: { ops: [{ op: 'create', path: 'src/recover_me.txt', content: 'x' }] },
});

const sha = 'b'.repeat(40);
const pushBody = {
  ref: 'refs/heads/main',
  after: sha,
  head_commit: { id: sha },
  repository: { full_name: repo },
  commits: [{ added: ['src/recover_me.txt'], modified: [], removed: [] }],
};
const rawBody = Buffer.from(JSON.stringify(pushBody), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const ingress = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig,
    'x-github-delivery': `del-v13-58-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo },
});
assert.equal(ingress.matched, true);
assert.equal(ingress.secondary_recovery, true);

const r2 = await getRunById(rid);
const bridge = r2?.result_recovery_bridge_last && typeof r2.result_recovery_bridge_last === 'object' ? r2.result_recovery_bridge_last : {};
assert.equal(String(bridge.outcome || ''), 'repository_reflection_path_match_only');
assert.equal(String(r2?.packet_state_map?.[pkt] || ''), 'review_required');

const evs = await listCosRunEventsForRun(rid, 30);
assert.ok(evs.some((e) => e.event_type === 'result_recovery_github_secondary'));

// Wrong path → no second recovery (envelope already consumed)
const sha2 = 'c'.repeat(40);
const pushBody2 = {
  ref: 'refs/heads/main',
  after: sha2,
  head_commit: { id: sha2 },
  repository: { full_name: repo },
  commits: [{ added: ['src/other.txt'], modified: [], removed: [] }],
};
const raw2 = Buffer.from(JSON.stringify(pushBody2), 'utf8');
const sig2 = `sha256=${crypto.createHmac('sha256', secret).update(raw2).digest('hex')}`;
const ingress2 = await handleGithubWebhookIngress({
  rawBody: raw2,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig2,
    'x-github-delivery': `del-v13-58b-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo },
});
assert.equal(ingress2.matched, false);

console.log('test-v13-58-github-push-secondary-recovery-e2e: ok');
