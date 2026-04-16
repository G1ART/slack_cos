#!/usr/bin/env node
/**
 * W10-B regression — founderCosToolHandlers 가 read_execution_context 응답에
 * harness_proof_scorecard + harness_proof_scorecard_lines 를 병치한다.
 *
 * 정적 + 동적 검사:
 *  - 소스에 buildHarnessProofScorecard import / return 필드 존재.
 *  - 빈 active_run_shell 에선 session_count=0, lines=[].
 *  - active_run_shell.workcell_runtime 에 proof 필드 주입 시 session_count=1, 합계 반영.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildHarnessProofScorecard,
  toHarnessProofCompactLines,
} from '../src/founder/harnessProofScorecard.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const handlerSrc = fs.readFileSync(path.resolve(here, '..', 'src/founder/founderCosToolHandlers.js'), 'utf8');
assert.ok(
  /from\s+['"]\.\/harnessProofScorecard\.js['"]/.test(handlerSrc),
  'founderCosToolHandlers must import harnessProofScorecard',
);
assert.ok(/harness_proof_scorecard\s*,/.test(handlerSrc), 'return object includes harness_proof_scorecard');
assert.ok(/harness_proof_scorecard_lines\s*,/.test(handlerSrc), 'return object includes harness_proof_scorecard_lines');

const sc0 = buildHarnessProofScorecard([]);
assert.equal(sc0.session_count, 0);
assert.deepEqual(toHarnessProofCompactLines(sc0), []);

const sc1 = buildHarnessProofScorecard([
  {
    reviewer_findings_count: 4,
    rework_cause_code: 'disagreement_unresolved',
    acceptance_evidence_kind: 'reviewer_sign_off',
    unresolved_disagreements: 2,
    correction_hit_rate: 0.5,
    patch_quality_delta: 0.02,
  },
]);
assert.equal(sc1.session_count, 1);
assert.equal(sc1.reviewer_findings_total, 4);
assert.equal(sc1.unresolved_disagreements_total, 2);
assert.equal(sc1.top_rework_cause.value, 'disagreement_unresolved');
const lines1 = toHarnessProofCompactLines(sc1);
assert.ok(lines1.length >= 1);
assert.ok(lines1[0].includes('1건'));

console.log('test-harness-proof-scorecard-read-context-slice: ok');
