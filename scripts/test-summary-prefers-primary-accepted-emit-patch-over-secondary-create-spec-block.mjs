/**
 * vNext.13.53 — Ops session summary: primary accepted emit_patch trigger wins over secondary blocked create_spec pretrigger.
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const flat = [
  {
    run_id: 'r_mix',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-02T10:00:01Z',
    payload: {
      smoke_session_id: 'sess_mix',
      phase: 'cursor_trigger_recorded',
      at: '2026-04-02T10:00:01Z',
      trigger_ok: true,
      invoked_tool: 'cursor',
      invoked_action: 'emit_patch',
    },
  },
  {
    run_id: 'r_mix',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: '2026-04-02T10:00:02Z',
    payload: {
      smoke_session_id: 'sess_mix',
      at: '2026-04-02T10:00:02Z',
      selected_tool: 'cursor',
      selected_action: 'create_spec',
      blocked_reason: 'create_spec_disallowed_in_live_only_mode',
      machine_hint: 'live_only_no_fallback_create_spec_forbidden',
    },
  },
];

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
assert.equal(s.primary_selected_action, 'emit_patch');
assert.equal(s.selected_action, 'emit_patch');
assert.equal(s.blocked_reason, null);
assert.equal(s.machine_hint, null);
assert.ok(Array.isArray(s.secondary_blocked_actions));
assert.equal(s.secondary_blocked_actions.length, 1);
assert.equal(s.secondary_blocked_actions[0].selected_action, 'create_spec');

console.log('test-summary-prefers-primary-accepted-emit-patch-over-secondary-create-spec-block: ok');
