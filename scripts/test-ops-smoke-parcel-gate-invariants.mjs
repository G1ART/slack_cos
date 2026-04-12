/**
 * 택배사무소 게이트: 세션 버킷·교차 레인 집합 불변식.
 */
import assert from 'node:assert';
import {
  SESSION_WIDE_AGGREGATE_EVENT_TYPES,
  buildSmokeSessionBucketsFromFlatRows,
  filterRowsForSessionAggregateTopline,
  inferPreferredSmokeSessionIdPerRunFromFlatRows,
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

// 동일 run_id · 다중 smoke_session: dominant 세션에만 orphan intake (이중 집계 방지)
const multiSid = [
  {
    run_id: 'r_parallel',
    event_type: 'ops_smoke_phase',
    created_at: '2026-01-01T00:00:00Z',
    payload: { smoke_session_id: 's_heavy', phase: 'a' },
  },
  {
    run_id: 'r_parallel',
    event_type: 'ops_smoke_phase',
    created_at: '2026-01-01T00:00:01Z',
    payload: { smoke_session_id: 's_heavy', phase: 'b' },
  },
  {
    run_id: 'r_parallel',
    event_type: 'ops_smoke_phase',
    created_at: '2026-01-01T00:00:02Z',
    payload: { smoke_session_id: 's_light', phase: 'c' },
  },
  {
    run_id: 'r_parallel',
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-01-01T00:00:03Z',
    payload: { target_run_id: 'r_parallel' },
  },
];
assert.equal(
  inferPreferredSmokeSessionIdPerRunFromFlatRows(multiSid, allowed).get('r_parallel'),
  's_heavy',
);
const bm = buildSmokeSessionBucketsFromFlatRows(multiSid, allowed);
assert.equal(bm.get('s_heavy')?.rows.length, 3, 'heavy gets 2 ops + intake');
assert.equal(bm.get('s_light')?.rows.length, 1, 'light must not inherit orphan intake');

// 동률 → sid 문자열 오름차순 우선
const tie = [
  {
    run_id: 'r_tie',
    event_type: 'ops_smoke_phase',
    created_at: '1',
    payload: { smoke_session_id: 's_bbb', phase: 'x' },
  },
  {
    run_id: 'r_tie',
    event_type: 'ops_smoke_phase',
    created_at: '2',
    payload: { smoke_session_id: 's_aaa', phase: 'y' },
  },
  {
    run_id: 'r_tie',
    event_type: 'cursor_receive_intake_committed',
    created_at: '3',
    payload: { target_run_id: 'r_tie' },
  },
];
assert.equal(inferPreferredSmokeSessionIdPerRunFromFlatRows(tie, allowed).get('r_tie'), 's_aaa');
const bt = buildSmokeSessionBucketsFromFlatRows(tie, allowed);
assert.ok(bt.get('s_aaa')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));
assert.ok(!bt.get('s_bbb')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));

// 하니스 맵: 추론과 무관하게 해당 sid 로 고정
const harnessMap = new Map([['r_parallel', 's_light']]);
const bh = buildSmokeSessionBucketsFromFlatRows(multiSid, allowed, {
  preferredSmokeSessionByRunId: harnessMap,
});
assert.ok(bh.get('s_light')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));
assert.ok(!bh.get('s_heavy')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));

// 레거시: 명시적 전 구간 복제
const ball = buildSmokeSessionBucketsFromFlatRows(multiSid, allowed, { intakeOrphanReplication: 'all' });
assert.ok(ball.get('s_heavy')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));
assert.ok(ball.get('s_light')?.rows.some((r) => r.event_type === 'cursor_receive_intake_committed'));

console.log('test-ops-smoke-parcel-gate-invariants: ok');
