import assert from 'node:assert';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { persistRunAfterDelegate, getActiveRunForThread, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleGithubWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { listCosRunEventsForRun, __resetCosRunEventsMemoryForTests } from '../src/founder/runCosEvents.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-gh-secondary');
process.env.COS_RUN_STORE = 'memory';
process.env.COS_OPS_SMOKE_ENABLED = '1';
process.env.COS_OPS_SMOKE_SESSION_ID = 'sess_gh_secondary';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();
__resetCosRunEventsMemoryForTests();

const secret = 'whsec_secondary_evidence_test________';
const tk = 'mention:gh_secondary:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_sec',
    objective: 'sec',
    packets: [
      {
        packet_id: 'p_sec',
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
  packet_id: 'p_sec',
  provider: 'github',
  object_type: 'issue',
  object_id: '2001',
});

const raw = Buffer.from(
  JSON.stringify({
    action: 'closed',
    repository: { full_name: 'G1ART/slack_cos' },
    issue: { number: 2001, state: 'closed', title: 'sec' },
  }),
  'utf8',
);
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

const out = await handleGithubWebhookIngress({
  rawBody: raw,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': sig,
    'x-github-delivery': 'del-gh-secondary-1',
  },
  env: {
    ...process.env,
    GITHUB_WEBHOOK_SECRET: secret,
    GITHUB_REPOSITORY: 'G1ART/slack_cos',
    COS_OPS_SMOKE_ENABLED: '1',
    COS_OPS_SMOKE_SESSION_ID: 'sess_gh_secondary',
  },
});
assert.equal(out.matched, true);

const r = await getActiveRunForThread(tk);
assert.notEqual(
  r.packet_state_map.p_sec,
  'completed',
  'GitHub must not complete the packet without Cursor direct callback',
);

const evs = await listCosRunEventsForRun(String(run.id), 50);
assert.ok(evs.some((e) => e.event_type === 'external_completed'));
assert.ok(evs.some((e) => e.event_type === 'cos_github_fallback_evidence'));
const gh = evs.find((e) => e.event_type === 'cos_github_fallback_evidence');
assert.equal(gh?.payload?.github_fallback_signal_seen, true);
assert.equal(gh?.payload?.github_fallback_match_attempted, true);
assert.equal(gh?.payload?.github_fallback_matched, true);

console.log('test-github-check-run-remains-secondary-evidence: ok');
