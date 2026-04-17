/**
 * W13-E — 증거가 없으면 quality proof 주장을 하지 않는다.
 *   - 모든 axis value 는 null
 *   - evidence_grade === 'none'
 *   - compact lines 는 빈 배열
 */
import assert from 'node:assert/strict';
import {
  buildHarnessQualityProofReadModel,
  toQualityProofCompactLines,
} from '../src/founder/harnessQualityProofReadModel.js';

const rm = buildHarnessQualityProofReadModel({});
assert.equal(rm.review_intervention.value, null);
assert.equal(rm.rework_loop.value, null);
assert.equal(rm.blocked_before_false_completion.value, null);
assert.equal(rm.human_gate_reopen_coherence.value, null);
assert.equal(rm.artifact_to_live_mismatch.value, null);
assert.equal(rm.run_outcome_by_team_shape.sample_size, 0);
assert.equal(rm.evidence_grade, 'none');

const lines = toQualityProofCompactLines(rm);
assert.deepEqual(lines, [], 'must emit zero lines when evidence is absent');

// Partial evidence → weak grade, but still must not manufacture missing axes.
const partial = buildHarnessQualityProofReadModel({
  workcell_sessions: [{ reviewer_findings_count: 0, rework_cause_code: null }],
});
assert.equal(partial.evidence_grade, 'weak');
assert.equal(partial.review_intervention.value, 0);
assert.equal(partial.artifact_to_live_mismatch.value, null);
assert.equal(partial.human_gate_reopen_coherence.value, null);

console.log('test-harness-quality-proof-no-claim-without-evidence: ok');
