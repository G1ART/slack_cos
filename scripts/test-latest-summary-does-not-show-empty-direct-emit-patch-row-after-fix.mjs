/**
 * vNext.13.50 — Ops summary machine row for live-only gate shows machine blocked_reason (not silent empty direct invoke).
 */
import assert from 'node:assert';
import { summarizeToolArgsForAudit } from '../src/founder/pretriggerAudit.js';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const blockedPayload = summarizeToolArgsForAudit('invoke_external_tool', {
  tool: 'cursor',
  action: 'emit_patch',
  payload: {},
});
assert.equal(blockedPayload.delegate_packets_present, false);
assert.deepEqual(blockedPayload.payload_top_level_keys, []);

const rows = [
  {
    run_id: 'run_sum',
    event_type: 'cos_pretrigger_tool_call_blocked',
    payload: {
      smoke_session_id: 'smoke_2026_summary_parent',
      at: '2026-04-03T12:00:01Z',
      call_name: 'invoke_external_tool',
      selected_tool: 'cursor',
      selected_action: 'emit_patch',
      ...blockedPayload,
      blocked_reason: 'delegate_required_before_emit_patch',
      machine_hint: 'live_only_emit_patch_requires_delegate_packets',
      missing_required_fields: ['packets', 'live_patch'],
    },
    created_at: '2026-04-03T12:00:01Z',
  },
];

const sums = summarizeOpsSmokeSessionsFromFlatRows(rows, { sessionLimit: 5 });
assert.equal(sums.length, 1);
assert.equal(sums[0].smoke_session_id, 'smoke_2026_summary_parent');
assert.equal(sums[0].blocked_reason, 'delegate_required_before_emit_patch');
assert.ok(!String(sums[0].blocked_reason || '').includes('invalid_payload'));

console.log('test-latest-summary-does-not-show-empty-direct-emit-patch-row-after-fix: ok');
