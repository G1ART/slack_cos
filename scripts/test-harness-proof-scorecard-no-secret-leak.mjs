#!/usr/bin/env node
/**
 * W10-B regression — compact lines 에 내부 토큰·secret 이 새지 않는다.
 */

import assert from 'node:assert/strict';

import {
  buildHarnessProofScorecard,
  toHarnessProofCompactLines,
} from '../src/founder/harnessProofScorecard.js';

const FORBIDDEN = [
  /resolution_class/i,
  /run_id/i,
  /packet_id/i,
  /parcel_deployment_key/i,
  /workcell_runtime/i,
  /Bearer\s+[A-Za-z0-9._-]{10,}/i,
  /ghp_[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9._-]{20,}/,
];

const sessions = [
  {
    reviewer_findings_count: 1,
    rework_cause_code: 'reviewer_finding',
    acceptance_evidence_kind: 'artifact_diff',
    unresolved_disagreements: 0,
    correction_hit_rate: 0.5,
    patch_quality_delta: 0,
  },
];

const sc = buildHarnessProofScorecard(sessions);
const lines = toHarnessProofCompactLines(sc);
for (const line of lines) {
  for (const re of FORBIDDEN) {
    assert.ok(!re.test(line), `forbidden pattern ${re} leaked: ${line}`);
  }
}

console.log('test-harness-proof-scorecard-no-secret-leak: ok');
