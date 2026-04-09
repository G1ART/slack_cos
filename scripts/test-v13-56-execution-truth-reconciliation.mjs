/**
 * vNext.13.56 — attempt-aware primary selection, truth planes, founder lines (no founder routing changes).
 */
import assert from 'node:assert';
import {
  summarizeOpsSmokeSessionsFromFlatRows,
  formatOpsSmokeFounderFacingLines,
} from '../src/founder/smokeOps.js';

const sid = 'sess_v13_56_truth';

// 1) Mixed: five blocked-style attempts then accepted (attempt 6)
const mixed = [];
for (let a = 1; a <= 5; a += 1) {
  mixed.push({
    run_id: 'r1',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: `2026-04-08T10:00:0${a}Z`,
    payload: {
      smoke_session_id: sid,
      at: `2026-04-08T10:00:0${a}Z`,
      attempt_seq: a,
      selected_tool: 'cursor',
      selected_action: 'emit_patch',
      blocked_reason: 'early_fail',
      payload_top_level_keys: ['title'],
    },
  });
}
mixed.push(
  {
    run_id: 'r1',
    event_type: 'cos_pretrigger_tool_call',
    created_at: '2026-04-08T10:00:10Z',
    payload: {
      smoke_session_id: sid,
      at: '2026-04-08T10:00:10Z',
      attempt_seq: 6,
      selected_tool: 'cursor',
      selected_action: 'emit_patch',
      payload_top_level_keys: ['objective', 'live_patch', 'ops'],
    },
  },
  {
    run_id: 'r1',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T10:00:11Z',
    payload: {
      smoke_session_id: sid,
      phase: 'emit_patch_payload_validated',
      at: '2026-04-08T10:00:11Z',
      attempt_seq: 6,
      payload_origin: 'delegate_stash_merged',
    },
  },
  {
    run_id: 'r1',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T10:00:12Z',
    payload: {
      smoke_session_id: sid,
      phase: 'trigger_outbound_callback_contract',
      at: '2026-04-08T10:00:12Z',
      attempt_seq: 6,
      callback_contract_present: true,
    },
  },
  {
    run_id: 'r1',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T10:00:13Z',
    payload: {
      smoke_session_id: sid,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-08T10:00:13Z',
      attempt_seq: 6,
      trigger_ok: true,
      invoked_tool: 'cursor',
      invoked_action: 'emit_patch',
      acceptance_response_has_callback_metadata: false,
    },
  },
);

const s1 = summarizeOpsSmokeSessionsFromFlatRows(mixed, { sessionLimit: 5 })[0];
assert.equal(s1.primary_attempt_seq, 6);
assert.equal(s1.attempt_count, 6);
assert.equal(s1.primary_attempt_status, 'accepted_trigger');
assert.deepEqual(s1.primary_payload_top_level_keys, ['objective', 'live_patch', 'ops']);
assert.equal(s1.primary_payload_origin, 'delegate_stash_merged');
assert.equal(s1.blocked_reason, null);
assert.ok(Array.isArray(s1.secondary_blocked_actions));
assert.equal(s1.secondary_blocked_actions.length, 5);
assert.ok(!s1.founder_facing_report_lines.some((ln) => ln.includes('early_fail')));

// 2) Truth planes: contract true, acceptance echo false, inbound false
assert.equal(s1.outbound_callback_contract_attached, true);
assert.equal(s1.acceptance_response_has_callback_metadata, false);
assert.equal(s1.inbound_callback_observed, false);

// 3) Blocked-only session — latest blocked attempt is primary
const sidB = 'sess_v13_56_blocked_only';
const blockedOnly = [
  {
    run_id: 'r2',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: '2026-04-08T11:00:01Z',
    payload: {
      smoke_session_id: sidB,
      at: '2026-04-08T11:00:01Z',
      attempt_seq: 1,
      blocked_reason: 'first',
      payload_top_level_keys: ['a'],
    },
  },
  {
    run_id: 'r2',
    event_type: 'cos_pretrigger_tool_call_blocked',
    created_at: '2026-04-08T11:00:02Z',
    payload: {
      smoke_session_id: sidB,
      at: '2026-04-08T11:00:02Z',
      attempt_seq: 2,
      blocked_reason: 'last_blocked',
      payload_top_level_keys: ['b'],
    },
  },
];
const s2 = summarizeOpsSmokeSessionsFromFlatRows(blockedOnly, { sessionLimit: 5 })[0];
assert.equal(s2.primary_attempt_seq, 2);
assert.equal(s2.primary_attempt_status, 'blocked');
assert.equal(s2.primary_blocked_reason, 'last_blocked');
const lines2 = formatOpsSmokeFounderFacingLines(s2);
assert.ok(lines2.some((l) => l.includes('last_blocked')));

// 4) Repo reflection secondary — founder line mentions 부가, not primary completion
const sidG = 'sess_v13_56_gh';
const withGh = [
  {
    run_id: 'r3',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T12:00:01Z',
    payload: {
      smoke_session_id: sidG,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-08T12:00:01Z',
      attempt_seq: 1,
      trigger_ok: true,
      invoked_action: 'emit_patch',
      acceptance_response_has_callback_metadata: false,
    },
  },
  {
    run_id: 'r3',
    event_type: 'cos_github_fallback_evidence',
    created_at: '2026-04-08T12:00:02Z',
    payload: {
      smoke_session_id: sidG,
      at: '2026-04-08T12:00:02Z',
      github_fallback_signal_seen: true,
      github_fallback_matched: true,
    },
  },
];
const s3 = summarizeOpsSmokeSessionsFromFlatRows(withGh, { sessionLimit: 5 })[0];
assert.equal(s3.repository_reflection_observed, true);
const lines3 = formatOpsSmokeFounderFacingLines(s3);
assert.ok(lines3.some((l) => l.includes('부가(2차)') && l.includes('반사')));

// 5) No founder module import in this file (smoke summary path only)
assert.equal(typeof formatOpsSmokeFounderFacingLines, 'function');

console.log('test-v13-56-execution-truth-reconciliation: ok');
