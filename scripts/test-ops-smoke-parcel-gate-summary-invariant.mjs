/**
 * 택배사무소 끝단: summarizeOpsSmokeSessionsFromFlatRows 경로에서
 * provider 상관(cos_cursor_webhook_ingress_safe matched) + intake committed 가
 * 집계 phases_seen 에 반영되는지 (실 DB 없이 flat fixture).
 */
import assert from 'node:assert';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const SID = 'sess_parcel_summary_inv';
const RID = 'run_parcel_summary_inv';

const baseFlat = [
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-01T00:00:00.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-01T00:00:00.000Z',
      trigger_ok: true,
    },
  },
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-01T00:00:01.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'external_run_id_extracted',
      at: '2026-04-01T00:00:01.000Z',
    },
  },
  {
    run_id: RID,
    event_type: 'cos_cursor_webhook_ingress_safe',
    created_at: '2026-04-01T00:00:02.000Z',
    payload: {
      smoke_session_id: SID,
      at: '2026-04-01T00:00:02.000Z',
      correlation_outcome: 'matched',
      callback_source_kind: 'provider_runtime',
    },
  },
  {
    run_id: RID,
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-04-01T00:00:03.000Z',
    payload: { target_run_id: RID, at: '2026-04-01T00:00:03.000Z' },
  },
];

const sums = summarizeOpsSmokeSessionsFromFlatRows(baseFlat);
const s = sums.find((x) => x.smoke_session_id === SID);
assert.ok(s, 'session bucket');
assert.ok(
  s.phases_seen.includes('cursor_provider_callback_correlated'),
  'provider correlated in phases_seen',
);
assert.ok(
  s.phases_seen.includes('run_packet_progression_patched'),
  'intake maps to run_packet_progression_patched',
);

// attempt lineage: 주 시도 필터가 켜져도 교차 레인(ingress·intake)은 집계에 남는다
const lineageFlat = [
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-01T00:00:00.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'cursor_trigger_recorded',
      attempt_seq: 1,
      at: '2026-04-01T00:00:00.000Z',
      trigger_ok: true,
    },
  },
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-01T00:00:01.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'cursor_trigger_recorded',
      attempt_seq: 2,
      at: '2026-04-01T00:00:01.000Z',
      trigger_ok: true,
    },
  },
  {
    run_id: RID,
    event_type: 'cos_cursor_webhook_ingress_safe',
    created_at: '2026-04-01T00:00:02.000Z',
    payload: {
      smoke_session_id: SID,
      attempt_seq: 2,
      at: '2026-04-01T00:00:02.000Z',
      correlation_outcome: 'matched',
      callback_source_kind: 'provider_runtime',
    },
  },
  {
    run_id: RID,
    event_type: 'cursor_receive_intake_committed',
    created_at: '2026-04-01T00:00:03.000Z',
    payload: { target_run_id: RID, at: '2026-04-01T00:00:03.000Z' },
  },
];

const sumsL = summarizeOpsSmokeSessionsFromFlatRows(lineageFlat);
const sl = sumsL.find((x) => x.smoke_session_id === SID);
assert.ok(sl);
assert.ok(sl.phases_seen.includes('cursor_provider_callback_correlated'), 'lineage + ingress');
assert.ok(sl.phases_seen.includes('run_packet_progression_patched'), 'lineage + intake');
assert.equal(sl.primary_attempt_seq, 2);

console.log('test-ops-smoke-parcel-gate-summary-invariant: ok');
