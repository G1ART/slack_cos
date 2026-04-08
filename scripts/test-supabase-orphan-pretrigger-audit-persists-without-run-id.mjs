/**
 * vNext.13.47 — Orphan pre-trigger audit rows insert into cos_ops_smoke_events with run_id null (no FK).
 */
import assert from 'node:assert';
import { supabaseAppendOpsSmokeEvent } from '../src/founder/runStoreSupabase.js';

/** @type {Record<string, unknown> | null} */
let captured = null;
const mockSb = {
  from(t) {
    assert.equal(t, 'cos_ops_smoke_events');
    return {
      insert(obj) {
        captured = obj;
        return Promise.resolve({ error: null });
      },
    };
  },
};

await supabaseAppendOpsSmokeEvent(mockSb, {
  smoke_session_id: 'smoke_orphan_audit',
  run_id: null,
  thread_key: 'thread_sample',
  event_type: 'cos_pretrigger_tool_call_blocked',
  payload: {
    smoke_session_id: 'smoke_orphan_audit',
    at: '2026-04-02T14:00:00Z',
    phase: 'cos_pretrigger_tool_call_blocked',
    call_name: 'invoke_external_tool',
  },
});

assert.ok(captured, 'insert should run');
assert.strictEqual(captured.run_id, null);
assert.strictEqual(captured.smoke_session_id, 'smoke_orphan_audit');
assert.strictEqual(captured.event_type, 'cos_pretrigger_tool_call_blocked');
assert.strictEqual(captured.thread_key, 'thread_sample');
assert.ok(captured.payload && typeof captured.payload === 'object');

console.log('test-supabase-orphan-pretrigger-audit-persists-without-run-id: ok');
