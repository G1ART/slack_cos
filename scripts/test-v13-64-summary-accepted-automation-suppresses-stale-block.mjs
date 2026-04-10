/**
 * vNext.13.64 — Session summary: any accepted cursor_trigger_recorded clears stale pretrigger blocked_reason (not only emit_patch).
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const flat = [
  {
    run_id: 'r_cs',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-10T10:00:01Z',
    payload: {
      smoke_session_id: 'sess_cs',
      phase: 'cursor_trigger_recorded',
      at: '2026-04-10T10:00:01Z',
      trigger_ok: true,
      invoked_tool: 'cursor',
      invoked_action: 'create_spec',
    },
  },
  {
    run_id: 'r_cs',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: '2026-04-10T10:00:02Z',
    payload: {
      smoke_session_id: 'sess_cs',
      at: '2026-04-10T10:00:02Z',
      selected_tool: 'cursor',
      selected_action: 'create_spec',
      blocked_reason: 'create_spec_disallowed_in_live_only_mode',
      machine_hint: 'live_only_no_fallback_create_spec_forbidden',
    },
  },
];

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
assert.equal(s.primary_selected_action, 'create_spec');
assert.equal(s.blocked_reason, null);
assert.equal(s.machine_hint, null);
assert.equal(s.primary_blocked_reason, null);

console.log('test-v13-64-summary-accepted-automation-suppresses-stale-block: ok');
