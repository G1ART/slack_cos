import assert from 'node:assert';
import { normalizeCursorWebhookPayload } from '../src/founder/cursorWebhookIngress.js';

const nestedAgent = {
  type: 'agent.status',
  context: { threadKey: 'dm:realistic:1', packetId: 'pkt-9' },
  data: {
    run: { id: 'real-run-1', status: 'completed', branch: 'main', prUrl: 'https://gh/pr/1' },
    summary: 'Shipped',
  },
};
const n = normalizeCursorWebhookPayload(nestedAgent);
assert.ok(n);
assert.equal(n.external_run_id, 'real-run-1');
assert.equal(n.thread_key_hint, 'dm:realistic:1');
assert.equal(n.packet_id_hint, 'pkt-9');
assert.equal(n.status_hint, 'external_completed');
assert.equal(n.payload.branch, 'main');
assert.ok(String(n.payload.pr_url || '').includes('gh/pr'));

const jobWrapped = {
  job: {
    run: { id: 'job-run-7', state: 'failed' },
    packet_id: 'pJ',
    thread_key: 'dm:job:1',
  },
};
const j = normalizeCursorWebhookPayload(jobWrapped);
assert.ok(j);
assert.equal(j.external_run_id, 'job-run-7');
assert.equal(j.status_hint, 'external_failed');
assert.equal(j.packet_id_hint, 'pJ');
assert.equal(j.thread_key_hint, 'dm:job:1');

const payloadOnly = {
  payload: {
    run: { run_id: 'nested-run-z', status: 'running' },
    cos_run_id: 'uuid-run-row',
    packet_id: 'pZ',
  },
};
const p = normalizeCursorWebhookPayload(payloadOnly);
assert.ok(p);
assert.equal(p.external_run_id, 'nested-run-z');
assert.equal(p.run_id_hint, 'uuid-run-row');
assert.equal(p.packet_id_hint, 'pZ');

console.log('test-cursor-webhook-realistic-payloads: ok');
