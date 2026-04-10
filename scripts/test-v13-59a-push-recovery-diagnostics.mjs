/**
 * vNext.13.59a — GitHub push secondary recovery returns safe diagnostics when no match.
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
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-59a-diag');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;

__resetCosRunMemoryStore();
__resetRecoveryEnvelopeStoreForTests();
__resetExternalGatewayTestState();

const secret = 'whsec_v13_59a_diag_test________________';
const repo = 'G1ART/slack_cos';
const tk = 'mention:C_v1359diag:1';
const pkt = 'p1';

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd59a',
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
  acceptedExternalId: 'cr_x',
  payload: { ops: [{ op: 'create', path: 'src/want.txt', content: 'a' }] },
});

const r0 = await getRunById(rid);
assert.ok(r0?.recovery_envelope_pending, 'durable envelope on run row');

const sha = 'd'.repeat(40);
const pushBody = {
  ref: 'refs/heads/main',
  after: sha,
  head_commit: { id: sha },
  repository: { full_name: repo },
  commits: [{ added: ['src/other_only.txt'], modified: [], removed: [] }],
};
const rawBody = Buffer.from(JSON.stringify(pushBody), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_diag_59a';

const ingress = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig,
    'x-github-delivery': `del-59a-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo, COS_OPS_SMOKE_ENABLED: '1' },
});

assert.equal(ingress.matched, false);
const evs = await import('../src/founder/runCosEvents.js').then((m) => m.listCosRunEventsForRun(rid, 25));
const gh = evs.find((e) => e.event_type === 'cos_github_fallback_evidence');
const pl = gh?.payload && typeof gh.payload === 'object' ? gh.payload : {};
assert.ok(pl.recovery_diagnostics, 'diagnostics attached');
assert.equal(pl.recovery_diagnostics.recovery_no_match_reason, 'no_path_overlap');

delete process.env.COS_OPS_SMOKE_ENABLED;
delete process.env.COS_OPS_SMOKE_SESSION_ID;

console.log('test-v13-59a-push-recovery-diagnostics: ok');
