/**
 * W13-E — 6 axes SSOT + honest counting.
 */
import assert from 'node:assert/strict';
import {
  HARNESS_QUALITY_PROOF_AXES,
  buildHarnessQualityProofReadModel,
} from '../src/founder/harnessQualityProofReadModel.js';

assert.equal(HARNESS_QUALITY_PROOF_AXES.length, 6);
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('review_intervention_count'));
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('rework_loop_count'));
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('blocked_before_false_completion_count'));
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('human_gate_reopen_coherence_count'));
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('artifact_to_live_mismatch_count'));
assert.ok(HARNESS_QUALITY_PROOF_AXES.includes('run_outcome_by_team_shape'));

// Mixed fixture with evidence in every axis
const rm = buildHarnessQualityProofReadModel({
  workcell_sessions: [
    { reviewer_findings_count: 3, rework_cause_code: 'reviewer_finding' },
    { reviewer_findings_count: 0, rework_cause_code: null },
    { reviewer_findings_count: 1, rework_cause_code: 'external_regression' },
  ],
  scenario_envelopes: [
    { scenario_id: 'A', outcome: 'broken', delivery_ready: true },
    { scenario_id: 'B', outcome: 'broken', delivery_ready: false },
    { scenario_id: 'C', outcome: 'success', delivery_ready: true },
  ],
  human_gate_rows: [
    {
      id: 'g1',
      reopened_count: 2,
      continuation_packet_id: 'p1',
      resume_target_kind: 'packet',
      resume_target_ref: 'p1',
    },
    { id: 'g2', reopened_count: 0 },
  ],
  run_rows: [
    { run_id: 'r1', outcome: 'success', team_shape: 'solo' },
    { run_id: 'r2', outcome: 'failed', team_shape: 'solo' },
    { run_id: 'r3', outcome: 'partial_success', team_shape: 'pair' },
  ],
});

assert.equal(rm.review_intervention.value, 2, 'review_intervention = sessions with findings>0');
assert.equal(rm.review_intervention.sample_size, 3);
assert.equal(rm.rework_loop.value, 2);
assert.equal(rm.blocked_before_false_completion.sample_size, 3);
// 2 broken envelopes exist and review signal is present → value=2
assert.equal(rm.blocked_before_false_completion.value, 2);
assert.equal(rm.human_gate_reopen_coherence.value, 1);
assert.equal(rm.human_gate_reopen_coherence.sample_size, 2);
assert.equal(rm.artifact_to_live_mismatch.value, 1);
assert.equal(rm.run_outcome_by_team_shape.sample_size, 3);
assert.equal(rm.run_outcome_by_team_shape.histogram.solo.success, 1);
assert.equal(rm.run_outcome_by_team_shape.histogram.solo.failed, 1);
assert.equal(rm.run_outcome_by_team_shape.histogram.pair.partial_success, 1);
assert.equal(rm.evidence_grade, 'sufficient');

console.log('test-harness-quality-proof-read-model-axes: ok');
