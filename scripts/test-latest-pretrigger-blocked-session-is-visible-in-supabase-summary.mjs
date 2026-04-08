/**
 * vNext.13.47 — Session sort uses lastAt so newest smoke session (e.g. latest pre-trigger blocked) is not buried.
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const flatRows = [
  {
    run_id: 'uuid-old',
    event_type: 'ops_smoke_phase',
    payload: {
      smoke_session_id: 'sess_old',
      phase: 'cursor_trigger_recorded',
      at: '2026-04-01T00:00:00Z',
    },
    created_at: '2026-04-01T00:00:00Z',
  },
  {
    run_id: '_orphan',
    event_type: 'cos_pretrigger_tool_call_blocked',
    payload: {
      smoke_session_id: 'sess_latest_blocked',
      at: '2026-04-02T15:00:00Z',
      phase: 'cos_pretrigger_tool_call_blocked',
      blocked_reason: 'emit_patch_contract_not_met',
      call_name: 'invoke_external_tool',
    },
    created_at: '2026-04-02T15:00:00Z',
  },
];

const summaries = summarizeOpsSmokeSessionsFromFlatRows(flatRows, { sessionLimit: 10 });
assert.equal(summaries.length, 2);
assert.equal(summaries[0].smoke_session_id, 'sess_latest_blocked');
assert.equal(summaries[0].final_status, 'pre_trigger_blocked_invalid_payload');
assert.equal(summaries[0].blocked_reason, 'emit_patch_contract_not_met');
assert.equal(summaries[0].call_name, 'invoke_external_tool');

console.log('test-latest-pretrigger-blocked-session-is-visible-in-supabase-summary: ok');
