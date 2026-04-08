import assert from 'node:assert';
import { peekCursorWebhookObservedSchemaSnapshot } from '../src/founder/cursorWebhookIngress.js';

const env = { ...process.env };
const body = {
  type: 'statusChange',
  runId: 'cloud_run_demo_001',
  status: 'running',
  context: { thread_key: 'mention:t:1' },
};
const snap = peekCursorWebhookObservedSchemaSnapshot(body, env);
assert.ok(Array.isArray(snap.top_level_keys));
assert.ok(snap.top_level_keys.includes('runId'));
assert.ok(snap.top_level_keys.includes('type'));
assert.equal(snap.thread_hint_present, true);
assert.equal(snap.run_id_candidate_present, true);
assert.ok(snap.observed_run_id_field);
assert.ok(snap.observed_status_field);
assert.equal(snap.normalization_would_accept, true);
assert.equal(typeof snap.run_id_candidate_tail, 'string');
assert.ok(snap.run_id_candidate_tail.length > 0);

console.log('test-cursor-webhook-ingress-safe-schema-snapshot: ok');
