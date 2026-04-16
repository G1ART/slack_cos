#!/usr/bin/env node
/**
 * W10-B regression — harnessProofScorecard aggregate 합계·평균·histogram.
 */

import assert from 'node:assert/strict';

import {
  buildHarnessProofScorecard,
  toHarnessProofCompactLines,
} from '../src/founder/harnessProofScorecard.js';

const sessions = [
  {
    reviewer_findings_count: 3,
    rework_cause_code: 'reviewer_finding',
    acceptance_evidence_kind: 'test_pass',
    unresolved_disagreements: 1,
    correction_hit_rate: 0.6,
    patch_quality_delta: 0.1,
  },
  {
    reviewer_findings_count: 2,
    rework_cause_code: 'reviewer_finding',
    acceptance_evidence_kind: 'artifact_diff',
    unresolved_disagreements: 0,
    correction_hit_rate: 0.8,
    patch_quality_delta: -0.05,
  },
  {
    reviewer_findings_count: 0,
    rework_cause_code: null,
    acceptance_evidence_kind: 'test_pass',
    unresolved_disagreements: 0,
    correction_hit_rate: 1.0,
    patch_quality_delta: 0.2,
  },
];

const sc = buildHarnessProofScorecard(sessions);
assert.equal(sc.session_count, 3);
assert.equal(sc.reviewer_findings_total, 5);
assert.equal(sc.unresolved_disagreements_total, 1);
assert.equal(sc.sessions_with_rework, 2);
assert.equal(sc.rework_cause_histogram.reviewer_finding, 2);
assert.equal(sc.acceptance_evidence_histogram.test_pass, 2);
assert.equal(sc.acceptance_evidence_histogram.artifact_diff, 1);
assert.equal(sc.acceptance_coverage_ratio, 1); // 3/3
// (0.6 + 0.8 + 1.0) / 3 = 0.8
assert.equal(sc.correction_hit_rate_mean, 0.8);
// (0.1 - 0.05 + 0.2) / 3 = 0.0833...
assert.ok(Math.abs(sc.patch_quality_delta_mean - 0.0833) < 0.001);
assert.equal(sc.top_rework_cause.value, 'reviewer_finding');
assert.equal(sc.top_rework_cause.count, 2);

const lines = toHarnessProofCompactLines(sc);
assert.ok(lines.some((l) => l.includes('리뷰 지적')));
assert.ok(lines.some((l) => l.includes('3건')));
assert.ok(lines.some((l) => l.includes('교정 적중률')));

const sc0 = buildHarnessProofScorecard([]);
assert.equal(sc0.session_count, 0);
assert.deepEqual(toHarnessProofCompactLines(sc0), []);

console.log('test-harness-proof-scorecard-aggregate: ok');
