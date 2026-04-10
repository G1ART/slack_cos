/**
 * vNext.13.64 — GitHub push secondary recovery: requested_paths empty on envelope uses durable run cursor_callback_anchor.emit_patch_requested_paths.
 */
import assert from 'node:assert';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getRunById, patchRunById, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { applyExternalPacketProgressStateForRun } from '../src/founder/canonicalExternalEvent.js';
import { __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';
import { __resetRecoveryEnvelopeStoreForTests } from '../src/founder/recoveryEnvelopeStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-64-anchor-recovery');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetCosRunEventsMemoryForTests();
__resetExternalGatewayTestState();
__resetRecoveryEnvelopeStoreForTests();

const secret = 'whsec_v13_64_anchor_recovery_test_______';
const repo = 'G1ART/slack_cos';
const tk = 'mention:C_v1364anchor:1';
const pkt = 'p_v64_anchor';

const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_v64',
    objective: 'v64',
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

const now = new Date().toISOString();
await patchRunById(rid, {
  recovery_envelope_pending: {
    envelope_id: 'env_anchor_paths',
    run_id: rid,
    thread_key: tk,
    packet_id: pkt,
    smoke_session_id: null,
    accepted_external_id: null,
    repository_full_name: repo,
    requested_paths: [],
    requested_content_sha256_prefixes: [],
    ops_summary: 'paths_from_run_anchor_only',
    created_at: now,
    updated_at: now,
    recovery_status: 'pending_callback',
    truth: { execution_accepted: true, callback_observed: false, github_secondary_recovered: false },
    secondary_recovery_outcome: null,
  },
  cursor_callback_anchor: {
    emit_patch_requested_paths: ['src/from_run_anchor_only.txt'],
    automation_branch_raw: 'main',
  },
});

const sha = 'd'.repeat(40);
const pushBody = {
  ref: 'refs/heads/main',
  after: sha,
  head_commit: { id: sha },
  repository: { full_name: repo },
  commits: [{ added: ['src/from_run_anchor_only.txt'], modified: [], removed: [] }],
};
const rawBody = Buffer.from(JSON.stringify(pushBody), 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

const ingress = await handleGithubWebhookIngress({
  rawBody,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig,
    'x-github-delivery': `del-v13-64-anchor-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo },
});
assert.equal(ingress.matched, true);
assert.equal(ingress.secondary_recovery, true);

const sha2 = 'e'.repeat(40);
const pushMismatchedBranch = {
  ref: 'refs/heads/other-branch',
  after: sha2,
  head_commit: { id: sha2 },
  repository: { full_name: repo },
  commits: [{ added: ['src/from_run_anchor_only.txt'], modified: [], removed: [] }],
};
await patchRunById(rid, {
  recovery_envelope_pending: {
    envelope_id: 'env_anchor_paths_2',
    run_id: rid,
    thread_key: tk,
    packet_id: pkt,
    smoke_session_id: null,
    accepted_external_id: null,
    repository_full_name: repo,
    requested_paths: [],
    requested_content_sha256_prefixes: [],
    ops_summary: 'branch_mismatch_test',
    created_at: now,
    updated_at: now,
    recovery_status: 'pending_callback',
    truth: { execution_accepted: true, callback_observed: false, github_secondary_recovered: false },
    secondary_recovery_outcome: null,
  },
  cursor_callback_anchor: {
    emit_patch_requested_paths: ['src/from_run_anchor_only.txt'],
    automation_branch_raw: 'main',
  },
});
const raw2 = Buffer.from(JSON.stringify(pushMismatchedBranch), 'utf8');
const sig2 = `sha256=${crypto.createHmac('sha256', secret).update(raw2).digest('hex')}`;
const ingress2 = await handleGithubWebhookIngress({
  rawBody: raw2,
  headers: {
    'x-github-event': 'push',
    'x-hub-signature-256': sig2,
    'x-github-delivery': `del-v13-64-branch-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: repo },
});
assert.equal(ingress2.secondary_recovery, undefined);

console.log('test-v13-64-github-push-recovery-uses-run-anchor-paths: ok');
