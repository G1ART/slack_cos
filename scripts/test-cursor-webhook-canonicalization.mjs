import assert from 'node:assert';
import crypto from 'node:crypto';
import { normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';

__resetExternalGatewayTestState();

const c1 = normalizeCursorWebhookPayload({
  type: 'statusChange',
  runId: 'run_xyz',
  status: 'completed',
  branch: 'feat/x',
  summary: 'done',
});
assert.ok(c1);
assert.equal(c1.provider, 'cursor');
assert.equal(c1.external_run_id, 'run_xyz');
assert.equal(c1.status_hint, 'external_completed');
assert.equal(c1.event_type, 'statusChange');
assert.ok(String(c1.external_id).includes('run_xyz'));

const c2 = normalizeCursorWebhookPayload({
  payload: { run_id: 'inner', state: 'failed' },
});
assert.ok(c2);
assert.equal(c2.external_run_id, 'inner');
assert.equal(c2.status_hint, 'external_failed');

assert.equal(normalizeCursorWebhookPayload({}), null);

const sec = 'cursor_canon_secret_test_min_len___';
const orphan = Buffer.from(
  JSON.stringify({ type: 'statusChange', runId: 'no_such_cloud_run', status: 'completed' }),
  'utf8',
);
const orphanSig = `sha256=${crypto.createHmac('sha256', sec).update(orphan).digest('hex')}`;
const noMatch = await handleCursorWebhookIngress({
  rawBody: orphan,
  headers: { 'x-cursor-signature-256': orphanSig },
  env: { CURSOR_WEBHOOK_SECRET: sec },
});
assert.equal(noMatch.matched, false);

console.log('test-cursor-webhook-canonicalization: ok');
