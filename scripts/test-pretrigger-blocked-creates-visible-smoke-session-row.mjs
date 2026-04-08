/**
 * vNext.13.46 — cos_pretrigger_tool_call_blocked alone yields summary session row + pre_trigger status.
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const flat = [
  {
    run_id: '_orphan',
    event_type: 'cos_pretrigger_tool_call',
    payload: {
      smoke_session_id: 'sess_visible_row',
      at: '2026-04-02T12:00:00Z',
      phase: 'cos_pretrigger_tool_call',
      call_name: 'invoke_external_tool',
      selected_tool: 'cursor',
      selected_action: 'emit_patch',
    },
    created_at: '2026-04-02T12:00:00Z',
  },
  {
    run_id: '_orphan',
    event_type: 'cos_pretrigger_tool_call_blocked',
    payload: {
      smoke_session_id: 'sess_visible_row',
      at: '2026-04-02T12:00:01Z',
      phase: 'cos_pretrigger_tool_call_blocked',
      call_name: 'invoke_external_tool',
      missing_required_fields: ['ops'],
      blocked_reason: 'emit_patch_contract_not_met',
    },
    created_at: '2026-04-02T12:00:01Z',
  },
];

const sums = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 10 });
assert.equal(sums.length, 1);
assert.equal(sums[0].smoke_session_id, 'sess_visible_row');
assert.equal(sums[0].final_status, 'pre_trigger_blocked_invalid_payload');
assert.ok(sums[0].phases_seen.includes('cos_pretrigger_tool_call_blocked'));

console.log('test-pretrigger-blocked-creates-visible-smoke-session-row: ok');
