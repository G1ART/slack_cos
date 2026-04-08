/**
 * vNext.13.53 — Smoke summary: GitHub fallback fields remain advisory; no conflation with verified direct Cursor callback.
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const flat = [
  {
    run_id: 'r_gh2',
    event_type: 'cos_github_fallback_evidence',
    created_at: '2026-04-02T11:00:00Z',
    payload: {
      smoke_session_id: 'sess_gh2',
      at: '2026-04-02T11:00:00Z',
      github_fallback_signal_seen: true,
      github_fallback_match_attempted: true,
      github_fallback_matched: true,
    },
  },
];

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
assert.equal(s.github_fallback_matched, true);
assert.notEqual(s.cursor_callback_observed, true);
assert.ok(s.primary_trigger_state === 'no_ops_smoke_events' || !String(s.final_status || '').includes('github'));

console.log('test-github-remains-secondary-evidence-only: ok');
