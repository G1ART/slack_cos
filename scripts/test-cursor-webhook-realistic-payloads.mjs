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
assert.equal(n.canonical.external_run_id, 'real-run-1');
assert.equal(n.canonical.thread_key_hint, 'dm:realistic:1');
assert.equal(n.canonical.packet_id_hint, 'pkt-9');
assert.equal(n.canonical.status_hint, 'external_completed');
assert.equal(n.canonical.payload.branch, 'main');
assert.ok(String(n.canonical.payload.pr_url || '').includes('gh/pr'));

const jobWrapped = {
  job: {
    run: { id: 'job-run-7', state: 'failed' },
    packet_id: 'pJ',
    thread_key: 'dm:job:1',
  },
};
const j = normalizeCursorWebhookPayload(jobWrapped);
assert.ok(j);
assert.equal(j.canonical.external_run_id, 'job-run-7');
assert.equal(j.canonical.status_hint, 'external_failed');
assert.equal(j.canonical.packet_id_hint, 'pJ');
assert.equal(j.canonical.thread_key_hint, 'dm:job:1');

const payloadOnly = {
  payload: {
    run: { run_id: 'nested-run-z', status: 'running' },
    cos_run_id: 'uuid-run-row',
    packet_id: 'pZ',
  },
};
const p = normalizeCursorWebhookPayload(payloadOnly);
assert.ok(p);
assert.equal(p.canonical.external_run_id, 'nested-run-z');
assert.equal(p.canonical.run_id_hint, 'uuid-run-row');
assert.equal(p.canonical.packet_id_hint, 'pZ');

console.log('test-cursor-webhook-realistic-payloads: ok');
