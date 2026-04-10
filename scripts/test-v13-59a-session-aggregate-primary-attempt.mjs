/**
 * vNext.13.59a — Session aggregate uses primary attempt rows only (no older without_callback_contract pollution).
 */
import assert from 'node:assert';
import {
  aggregateSmokeSessionProgress,
  filterRowsForSessionAggregateTopline,
} from '../src/founder/smokeOps.js';

const sid = 'sess_v13_59a';
const rows = [
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T10:00:00Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 1,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-09T10:00:00Z',
      trigger_ok: true,
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T10:00:01Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 1,
      phase: 'trigger_sent_without_callback_contract',
      at: '2026-04-09T10:00:01Z',
    },
  },
  {
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-09T11:00:00Z',
    payload: {
      smoke_session_id: sid,
      attempt_seq: 2,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-09T11:00:00Z',
      trigger_ok: true,
      outbound_callback_contract_present: true,
    },
  },
];

const filtered = filterRowsForSessionAggregateTopline(rows, 2);
const aggFull = aggregateSmokeSessionProgress(rows);
const aggPri = aggregateSmokeSessionProgress(filtered);

assert.ok(aggFull.phases_seen.includes('trigger_sent_without_callback_contract'));
assert.equal(aggPri.phases_seen.includes('trigger_sent_without_callback_contract'), false);

console.log('test-v13-59a-session-aggregate-primary-attempt: ok');
