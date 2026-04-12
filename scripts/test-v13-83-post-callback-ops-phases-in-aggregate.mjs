/**
 * vNext.13.83 — Post-callback ops_smoke_phase rows (no attempt_seq) must not disappear from
 * session aggregate when primary attempt is 2+ (live_32: external_callback_matched, wake, closure).
 */
import assert from 'node:assert';
import {
  aggregateSmokeSessionProgress,
  filterRowsForSessionAggregateTopline,
  summarizeOpsSmokeSessionsFromFlatRows,
} from '../src/founder/smokeOps.js';

const sid = 'sess_v13_83';
const rows = [
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:07:00Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 2,
      phase: 'trigger_outbound_callback_contract',
      at: '2026-04-12T20:07:20.067Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:07:00.5Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 2,
      phase: 'emit_patch_payload_validated',
      at: '2026-04-12T20:07:19.971Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:07:01Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 2,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-12T20:07:21.311Z',
      trigger_ok: true,
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:07:01.2Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 2,
      phase: 'trigger_accepted_external_id_present',
      at: '2026-04-12T20:07:21.509Z',
    },
  },
  {
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-04-12T20:09:25Z',
    payload: {
      smoke_session_id: sid,
      target_run_id: 'run-83',
      terminal_bucket: 'positive_terminal',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:09:25.5Z',
    payload: {
      smoke_session_id: sid,
      phase: 'external_callback_matched',
      at: '2026-04-12T20:09:25.439Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:09:25.6Z',
    payload: {
      smoke_session_id: sid,
      phase: 'authoritative_callback_closure_applied',
      at: '2026-04-12T20:09:25.527Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:09:25.7Z',
    payload: {
      smoke_session_id: sid,
      phase: 'run_packet_progression_patched',
      at: '2026-04-12T20:09:25.613Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:09:25.8Z',
    payload: {
      smoke_session_id: sid,
      phase: 'supervisor_wake_enqueued',
      at: '2026-04-12T20:09:25.706Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T20:08:29Z',
    payload: {
      smoke_session_id: sid,
      phase: 'founder_milestone_sent',
      at: '2026-04-12T20:08:29.239Z',
      milestone: 'blocked',
    },
  },
];

const filtered = filterRowsForSessionAggregateTopline(rows, 2);
assert.ok(
  filtered.some(
    (r) =>
      String(r.event_type || '') === 'ops_smoke_phase' &&
      String(r.payload?.phase || '') === 'supervisor_wake_enqueued',
  ),
  'supervisor_wake_enqueued without attempt_seq must pass filter',
);
assert.ok(
  filtered.some(
    (r) =>
      String(r.event_type || '') === 'ops_smoke_phase' &&
      String(r.payload?.phase || '') === 'authoritative_callback_closure_applied',
  ),
);

const agg = aggregateSmokeSessionProgress(filtered);
assert.ok(agg.phases_seen.includes('supervisor_wake_enqueued'), 'aggregate must see supervisor_wake');
assert.ok(agg.phases_seen.includes('authoritative_callback_closure_applied'));
assert.equal(agg.final_status, 'authoritative_callback_closure_applied');
assert.equal(agg.emit_patch_structural_closure_complete, true);

const flatForSummary = rows.map((r) => ({
  run_id: 'run-83',
  event_type: r.event_type,
  created_at: r.created_at,
  payload: r.payload,
}));
const [one] = summarizeOpsSmokeSessionsFromFlatRows(flatForSummary, { sessionLimit: 5 });
assert.equal(one.smoke_session_id, sid);
assert.equal(one.final_status, 'authoritative_callback_closure_applied');
assert.equal(one.breaks_at, null);
assert.ok(one.phases_seen.includes('founder_milestone_sent'));

console.log('test-v13-83-post-callback-ops-phases-in-aggregate: ok');
