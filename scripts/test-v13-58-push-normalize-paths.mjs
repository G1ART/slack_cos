/**
 * vNext.13.58 — GitHub push webhook normalizes paths_touched for secondary recovery.
 */
import assert from 'node:assert';
import { normalizeGithubWebhookPayload, GITHUB_WEBHOOK_ALLOWED_EVENTS } from '../src/founder/providerEventNormalizers.js';

assert.ok(GITHUB_WEBHOOK_ALLOWED_EVENTS.has('push'));

const sha = 'a'.repeat(40);
const body = {
  ref: 'refs/heads/main',
  after: sha,
  head_commit: { id: sha },
  repository: { full_name: 'G1ART/slack_cos' },
  commits: [
    { added: ['./src/foo.txt', 'other.md'], modified: [], removed: [] },
    { added: [], modified: ['src/foo.txt'], removed: [] },
  ],
};
const headers = { 'x-github-event': 'push' };
const norm = normalizeGithubWebhookPayload(headers, body);
assert.ok(norm);
assert.equal(norm.event_type, 'push');
const pay = norm.payload && typeof norm.payload === 'object' ? norm.payload : {};
assert.ok(Array.isArray(pay.paths_touched));
assert.ok(pay.paths_touched.includes('./src/foo.txt') || pay.paths_touched.includes('other.md'));
assert.equal(String(pay.head_sha), sha);

console.log('test-v13-58-push-normalize-paths: ok');
