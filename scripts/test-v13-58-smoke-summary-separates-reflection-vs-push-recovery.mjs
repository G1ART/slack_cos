/**
 * vNext.13.58 — Ops smoke summary: repo reflection (fallback) vs GitHub push result recovery lines differ.
 */
import assert from 'node:assert';
import {
  summarizeOpsSmokeSessionsFromFlatRows,
  formatOpsSmokeFounderFacingLines,
} from '../src/founder/smokeOps.js';

const sid = 'sess_v13_58_split';
const flat = [
  {
    run_id: 'r_split',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T10:00:01Z',
    payload: {
      smoke_session_id: sid,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-09T10:00:01Z',
      trigger_ok: true,
      invoked_action: 'emit_patch',
    },
  },
  {
    run_id: 'r_split',
    event_type: 'cos_github_fallback_evidence',
    created_at: '2026-04-09T10:00:02Z',
    payload: {
      smoke_session_id: sid,
      at: '2026-04-09T10:00:02Z',
      github_fallback_signal_seen: true,
      github_fallback_matched: true,
    },
  },
  {
    run_id: 'r_split',
    event_type: 'result_recovery_github_secondary',
    created_at: '2026-04-09T10:00:03Z',
    payload: {
      smoke_session_id: sid,
      at: '2026-04-09T10:00:03Z',
      recovery_outcome: 'repository_reflection_path_match_only',
      is_primary_completion_authority: false,
    },
  },
];

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
assert.equal(s.repository_reflection_observed, true);
assert.equal(s.github_secondary_recovery_observed, true);
assert.equal(String(s.github_secondary_recovery_outcome || ''), 'repository_reflection_path_match_only');

const lines = formatOpsSmokeFounderFacingLines(s);
assert.ok(lines.some((l) => l.includes('부가(2차)') && l.includes('반사')));
assert.ok(lines.some((l) => l.includes('회복(2차·GitHub 푸시)') && l.includes('있음')));

console.log('test-v13-58-smoke-summary-separates-reflection-vs-push-recovery: ok');
