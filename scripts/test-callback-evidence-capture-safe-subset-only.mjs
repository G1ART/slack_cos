import assert from 'node:assert';
import { buildSafeCursorCallbackSmokeDetail } from '../src/founder/smokeOps.js';

const canon = {
  external_run_id: 'long_external_cursor_id_zzzzzzzz',
  occurred_at: '2026-04-02T12:00:00.000Z',
  thread_key_hint: 'mention:thread:1',
  packet_id_hint: 'pkt_1',
  payload: {
    branch: 'feature/smoke',
    pr_url: 'https://github.com/acme/cos/pull/999',
    summary: 'Ship it',
  },
};

const d = buildSafeCursorCallbackSmokeDetail({
  canonical: canon,
  matched_by: 'correlation_store_object_id',
  canonical_status: 'completed',
  payload_fingerprint_prefix: 'deadbeef',
  ingressEvidence: {
    source_status_field_name: 'body.status',
    source_run_id_field_name: 'body.runId',
    selected_override_keys: ['CURSOR_WEBHOOK_STATUS_PATH'],
  },
});

const json = JSON.stringify(d);
const allowedKeys = new Set([
  'matched_by',
  'canonical_status',
  'payload_fingerprint_prefix',
  'selected_webhook_field_names',
  'selected_override_keys',
  'external_run_id_tail',
  'has_thread_key_hint',
  'has_packet_id_hint',
  'has_branch',
  'has_pr_url',
  'has_summary',
  'occurred_at_present',
]);
assert.deepEqual(new Set(Object.keys(d)), allowedKeys, 'only safe callback fields');

assert.ok(!json.includes('github.com'), 'no full PR URL stored');
assert.ok(!json.includes('Ship it'), 'no raw summary text');
assert.equal(d.external_run_id_tail, 'zzzzzzzz');
assert.equal(d.occurred_at_present, true);
assert.equal(d.has_pr_url, true);

console.log('test-callback-evidence-capture-safe-subset-only: ok');
