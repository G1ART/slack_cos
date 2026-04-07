import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  handleGithubWebhookIngress,
  __resetExternalGatewayTestState,
} from '../src/founder/externalEventGateway.js';
import {
  __resetGithubDeliveryMemoryForTests,
  __getGithubDeliveryRecordCallCountForTests,
} from '../src/founder/githubWebhookDedupe.js';
import { GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS } from '../src/founder/githubWebhookFollowOn.js';

process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_FINE_GRAINED_PAT;

__resetExternalGatewayTestState();
__resetGithubDeliveryMemoryForTests();

assert.ok(GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has('push'));
assert.ok(GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has('issues'));
assert.ok(GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has('pull_request'));
assert.ok(!GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has('ping'));
assert.ok(!GITHUB_WEBHOOK_DELIVERY_DEDUPE_EVENTS.has('check_suite'));

const secret = 'whsec_runtime_hardening_test_key___';
const repo = { full_name: 'G1ART/slack_cos' };

function sign(bodyBuf) {
  return `sha256=${crypto.createHmac('sha256', secret).update(bodyBuf).digest('hex')}`;
}

const pingBody = Buffer.from(JSON.stringify({ zen: 'x', repository: repo }), 'utf8');
const pingSig = sign(pingBody);
const beforePing = __getGithubDeliveryRecordCallCountForTests();
const pingOut = await handleGithubWebhookIngress({
  rawBody: pingBody,
  headers: {
    'x-github-event': 'ping',
    'x-hub-signature-256': pingSig,
    'x-github-delivery': 'del-ping-hardening',
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.equal(pingOut.ignored, true);
assert.equal(__getGithubDeliveryRecordCallCountForTests(), beforePing, 'ping must not invoke delivery dedupe');

const issuesBody = Buffer.from(
  JSON.stringify({
    action: 'opened',
    repository: repo,
    issue: { number: 99, state: 'open', title: 't' },
  }),
  'utf8',
);
const issuesSig = sign(issuesBody);
const beforeIssues = __getGithubDeliveryRecordCallCountForTests();
await handleGithubWebhookIngress({
  rawBody: issuesBody,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': issuesSig,
    'x-github-delivery': `del-issues-${crypto.randomUUID()}`,
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.ok(__getGithubDeliveryRecordCallCountForTests() > beforeIssues, 'issues must record delivery');

const suiteBody = Buffer.from(
  JSON.stringify({
    action: 'completed',
    repository: repo,
    check_suite: { id: 1, status: 'completed' },
  }),
  'utf8',
);
const suiteSig = sign(suiteBody);
const beforeSuite = __getGithubDeliveryRecordCallCountForTests();
await handleGithubWebhookIngress({
  rawBody: suiteBody,
  headers: {
    'x-github-event': 'check_suite',
    'x-hub-signature-256': suiteSig,
    'x-github-delivery': 'del-suite-1',
  },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.equal(
  __getGithubDeliveryRecordCallCountForTests(),
  beforeSuite,
  'check_suite must not hit github_webhook_deliveries',
);

const prevFetch = globalThis.fetch;
let sawGithubApi = false;
globalThis.fetch = async (input) => {
  const u = String(input);
  if (u.startsWith('https://api.github.com/repos/')) {
    sawGithubApi = true;
    return new Response(JSON.stringify({ id: 1 }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return prevFetch(input);
};

__resetGithubDeliveryMemoryForTests();
const aliasBody = Buffer.from(
  JSON.stringify({
    action: 'opened',
    repository: repo,
    issue: { number: 100, state: 'open', title: 'alias' },
  }),
  'utf8',
);
const aliasSig = sign(aliasBody);
await handleGithubWebhookIngress({
  rawBody: aliasBody,
  headers: {
    'x-github-event': 'issues',
    'x-hub-signature-256': aliasSig,
    'x-github-delivery': `del-alias-${crypto.randomUUID()}`,
  },
  env: {
    GITHUB_WEBHOOK_SECRET: secret,
    GITHUB_FINE_GRAINED_PAT: 'ghp_alias_test_token_value________',
    GITHUB_DEFAULT_OWNER: 'G1ART',
    GITHUB_DEFAULT_REPO: 'slack_cos',
  },
});
assert.equal(sawGithubApi, true, 'follow-on fetch uses GITHUB_FINE_GRAINED_PAT + default owner/repo');

globalThis.fetch = prevFetch;

console.log('test-github-webhook-runtime-hardening: ok');
