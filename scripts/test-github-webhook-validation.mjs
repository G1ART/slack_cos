import assert from 'node:assert';
import crypto from 'node:crypto';
import {
  verifyGithubWebhookSignature,
  normalizeGithubWebhookPayload,
  GITHUB_WEBHOOK_ALLOWED_EVENTS,
} from '../src/founder/providerEventNormalizers.js';
import { handleGithubWebhookIngress } from '../src/founder/externalEventGateway.js';

const secret = 'whsec_test_fixture_32chars_min____';
const bodyObj = {
  action: 'closed',
  repository: { full_name: 'G1ART/slack_cos' },
  issue: { number: 42, state: 'closed', title: 'x' },
};
const rawBody = Buffer.from(JSON.stringify(bodyObj), 'utf8');
const goodSig = `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;

assert.equal(verifyGithubWebhookSignature(secret, rawBody, goodSig), true);
assert.equal(verifyGithubWebhookSignature(secret, rawBody, 'sha256=deadbeef'), false);
assert.equal(verifyGithubWebhookSignature('', rawBody, goodSig), false);

const headers = {
  'x-github-event': 'issues',
  'x-hub-signature-256': goodSig,
  'x-github-delivery': 'del-validation-1',
};
const norm = normalizeGithubWebhookPayload(headers, bodyObj);
assert.ok(norm);
assert.equal(norm.provider, 'github');
assert.equal(norm.correlation_keys.object_id, '42');

const bad = await handleGithubWebhookIngress({
  rawBody,
  headers: { ...headers, 'x-hub-signature-256': 'sha256=bad' },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.equal(bad.httpStatus, 401);

// 고정 ID는 data/github_webhook_deliveries.json(또는 Supabase) dedupe에 남아 재실행 시 duplicate 분기가 나므로 매 실행 유일값 사용
const pingHeaders = {
  'x-github-event': 'ping',
  'x-hub-signature-256': goodSig,
  'x-github-delivery': `del-ping-${crypto.randomUUID()}`,
};
const pingBody = Buffer.from(JSON.stringify({ zen: 'x', repository: bodyObj.repository }), 'utf8');
const pingSig = `sha256=${crypto.createHmac('sha256', secret).update(pingBody).digest('hex')}`;
const ign = await handleGithubWebhookIngress({
  rawBody: pingBody,
  headers: { ...pingHeaders, 'x-hub-signature-256': pingSig },
  env: { GITHUB_WEBHOOK_SECRET: secret, GITHUB_REPOSITORY: 'G1ART/slack_cos' },
});
assert.equal(ign.ignored, true);

assert.ok(!GITHUB_WEBHOOK_ALLOWED_EVENTS.has('ping'));

console.log('test-github-webhook-validation: ok');
