/**
 * 택배사무소 요약: phases_seen → primary / advisory 분리 (운영 가독성).
 */
import assert from 'node:assert';
import {
  partitionPhasesSeenForParcelDisplay,
  PARCEL_ADVISORY_DISPLAY_PHASES,
} from '../src/founder/opsSmokeParcelGate.js';
import {
  formatOpsSmokeFounderFacingLines,
  summarizeOpsSmokeSessionsFromFlatRows,
} from '../src/founder/smokeOps.js';

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

const founderBase = {
  smoke_session_id: SID,
  primary_attempt_seq: 1,
  attempt_count: 1,
  primary_attempt_status: 'accepted_trigger',
  primary_selected_tool: 't',
  primary_selected_action: 'a',
  accepted_external_id: 'ext',
  provider_callback_ingress_observed: false,
  synthetic_callback_ingress_observed: false,
  manual_probe_callback_ingress_observed: false,
  unknown_source_callback_ingress_observed: false,
  outbound_callback_contract_attached: true,
  acceptance_response_has_callback_metadata: true,
  callback_completion_state: 'closed_ok',
  repository_reflection_observed: false,
  github_secondary_recovery_observed: false,
  advisory_phases_seen: s.advisory_phases_seen,
};
const flines = formatOpsSmokeFounderFacingLines(founderBase);
assert.ok(
  flines.some((ln) => ln.includes('부차 관측') && ln.includes('github_fallback_evidence')),
  flines.join('\n'),
);

console.log('test-parcel-phase-partition-display: ok');
