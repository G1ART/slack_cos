/**
 * 택배사무소 게이트: 세션 버킷·교차 레인 집합 불변식.
 */
import assert from 'node:assert';
import {
  SESSION_WIDE_AGGREGATE_EVENT_TYPES,
  buildSmokeSessionBucketsFromFlatRows,
  filterRowsForSessionAggregateTopline,
} from '../src/founder/opsSmokeParcelGate.js';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES } from '../src/founder/runStoreSupabase.js';

const allowed = new Set(COS_OPS_SMOKE_SUMMARY_EVENT_TYPES);

assert.ok(SESSION_WIDE_AGGREGATE_EVENT_TYPES.has('cursor_receive_intake_committed'));
for (const et of SESSION_WIDE_AGGREGATE_EVENT_TYPES) {
  assert.ok(allowed.has(et), `SESSION_WIDE type ${et} must be in COS_OPS_SMOKE_SUMMARY_EVENT_TYPES`);
}

const flat = [
  {
    run_id: 'r1',
    event_type: 'ops_smoke_phase',
    created_at: '2026-01-01T00:00:00Z',
    payload: { smoke_session_id: 's_gate', phase: 'cursor_trigger_recorded', at: '1' },
  },
  {
    run_id: 'r1',
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-01-01T00:01:00Z',
    payload: { target_run_id: 'r1', at: '2' },
  },
];
const buckets = buildSmokeSessionBucketsFromFlatRows(flat, allowed);
const b = buckets.get('s_gate');
assert.ok(b, 'intake without sid must attach via run_id');
assert.equal(b.rows.length, 2);

const lineage = filterRowsForSessionAggregateTopline(
  [
    { event_type: 'ops_smoke_phase', payload: { attempt_seq: 1, phase: 'x', at: '1' } },
    { event_type: 'cursor_receive_intake_committed', payload: { at: '2' } },
  ],
  1,
);
assert.equal(lineage.length, 2);

console.log('test-ops-smoke-parcel-gate-invariants: ok');
