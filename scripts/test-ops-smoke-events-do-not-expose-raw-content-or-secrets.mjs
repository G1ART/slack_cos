/**
 * vNext.13.47 — Summary machine fields are allowlisted; nested payload leaks are not copied into session summary.
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const badHost = 'evil.leak.example';
const flat = [
  {
    run_id: '_orphan',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: '2026-04-02T12:00:00Z',
    payload: {
      smoke_session_id: 'sess_safe',
      at: '2026-04-02T12:00:00Z',
      phase: 'cos_pretrigger_tool_call_blocked',
      call_name: 'invoke_external_tool',
      blocked_reason: 'test_reason',
      nested_leak: { url: `https://${badHost}/path`, token: 'Bearer supersecret' },
    },
  },
];

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
const snap = JSON.stringify({
  call_name: s.call_name,
  selected_tool: s.selected_tool,
  selected_action: s.selected_action,
  delegate_packets_present: s.delegate_packets_present,
  delegate_live_patch_present: s.delegate_live_patch_present,
  payload_top_level_keys: s.payload_top_level_keys,
  blocked_reason: s.blocked_reason,
  machine_hint: s.machine_hint,
  missing_required_fields: s.missing_required_fields,
  final_status: s.final_status,
});

assert.ok(!snap.includes(badHost), 'nested URL must not appear in machine summary projection');
assert.ok(!snap.includes('Bearer'), 'nested bearer must not appear');
assert.ok(snap.includes('test_reason'));

console.log('test-ops-smoke-events-do-not-expose-raw-content-or-secrets: ok');
