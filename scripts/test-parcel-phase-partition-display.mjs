/**
 * 택배사무소 요약: phases_seen → primary / advisory 분리 (운영 가독성).
 */
import assert from 'node:assert';
import {
  partitionPhasesSeenForParcelDisplay,
  PARCEL_ADVISORY_DISPLAY_PHASES,
} from '../src/founder/opsSmokeParcelGate.js';
import { summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';

const p = partitionPhasesSeenForParcelDisplay([
  'emit_patch_payload_validated',
  'github_fallback_evidence',
  'external_callback_matched',
  'github_secondary_recovery_matched',
]);
assert.deepEqual(p.advisory_phases_seen, [
  'github_fallback_evidence',
  'github_secondary_recovery_matched',
]);
assert.ok(p.primary_phases_seen.includes('external_callback_matched'));
assert.ok(PARCEL_ADVISORY_DISPLAY_PHASES.has('github_fallback_evidence'));

const SID = 'sess_parcel_partition';
const RID = 'run_parcel_partition';
const flat = [
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T10:00:00.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-12T10:00:00.000Z',
      trigger_ok: true,
    },
  },
  {
    run_id: RID,
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-12T10:00:05.000Z',
    payload: {
      smoke_session_id: SID,
      phase: 'github_fallback_evidence',
      at: '2026-04-12T10:00:05.000Z',
    },
  },
];

const sums = summarizeOpsSmokeSessionsFromFlatRows(flat);
const s = sums.find((x) => x.smoke_session_id === SID);
assert.ok(s);
assert.ok(s.phases_seen.includes('github_fallback_evidence'));
assert.ok(s.advisory_phases_seen.includes('github_fallback_evidence'));
assert.ok(!s.primary_phases_seen.includes('github_fallback_evidence'));

console.log('test-parcel-phase-partition-display: ok');
