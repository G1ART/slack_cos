/**
 * W13-E — read model 은 주어진 입력 collection 외의 project_space 데이터를 **혼합하지 않는다**.
 * 테스트는 동일 모듈이 호출측이 필터링한 두 개의 다른 슬라이스(psAlpha / psBeta)를 독립적으로
 * roll-up 하고, 서로의 counts 가 섞이지 않음을 보장.
 *
 * 또한 CLI (audit-harness-quality-proof.mjs) fixture 모드에서 두 개의 fixture 를 돌려도
 * 결과가 교차 오염되지 않음을 확인한다.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';

import { buildHarnessQualityProofReadModel } from '../src/founder/harnessQualityProofReadModel.js';

// --- pure-function isolation ---
const alphaInput = {
  workcell_sessions: [
    { reviewer_findings_count: 5, rework_cause_code: 'reviewer_finding' },
    { reviewer_findings_count: 1, rework_cause_code: 'other' },
  ],
  scenario_envelopes: [
    { scenario_id: 'psAlpha/s1', outcome: 'broken', delivery_ready: true },
  ],
  run_rows: [
    { run_id: 'a1', outcome: 'success', team_shape: 'solo' },
  ],
};
const betaInput = {
  workcell_sessions: [
    { reviewer_findings_count: 0, rework_cause_code: null },
  ],
  scenario_envelopes: [
    { scenario_id: 'psBeta/s1', outcome: 'success', delivery_ready: true },
  ],
  run_rows: [
    { run_id: 'b1', outcome: 'failed', team_shape: 'pair' },
    { run_id: 'b2', outcome: 'failed', team_shape: 'pair' },
  ],
};

const alphaRm = buildHarnessQualityProofReadModel(alphaInput);
const betaRm = buildHarnessQualityProofReadModel(betaInput);

assert.equal(alphaRm.review_intervention.value, 2, 'alpha: 2 reviews');
assert.equal(betaRm.review_intervention.value, 0, 'beta: 0 reviews — no cross-pollination');
assert.equal(alphaRm.artifact_to_live_mismatch.value, 1);
assert.equal(betaRm.artifact_to_live_mismatch.value, 0);
assert.equal(alphaRm.run_outcome_by_team_shape.histogram.solo?.success, 1);
assert.equal(betaRm.run_outcome_by_team_shape.histogram.pair?.failed, 2);
assert.ok(
  !('pair' in alphaRm.run_outcome_by_team_shape.histogram),
  'alpha histogram must not include pair shape from beta',
);
assert.ok(
  !('solo' in betaRm.run_outcome_by_team_shape.histogram),
  'beta histogram must not include solo shape from alpha',
);

// --- CLI isolation via fixture round-trip ---
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13e_cli_'));
const scriptPath = path.resolve(path.dirname(new URL(import.meta.url).pathname), 'audit-harness-quality-proof.mjs');
try {
  const alphaFixture = path.join(tmp, 'alpha.json');
  const betaFixture = path.join(tmp, 'beta.json');
  fs.writeFileSync(alphaFixture, JSON.stringify(alphaInput));
  fs.writeFileSync(betaFixture, JSON.stringify(betaInput));
  const resA = spawnSync('node', [scriptPath, '--fixture', alphaFixture, '--json'], { encoding: 'utf8' });
  const resB = spawnSync('node', [scriptPath, '--fixture', betaFixture, '--json'], { encoding: 'utf8' });
  assert.equal(resA.status, 0, `alpha CLI failed: ${resA.stderr}`);
  assert.equal(resB.status, 0, `beta CLI failed: ${resB.stderr}`);
  const outA = JSON.parse(resA.stdout);
  const outB = JSON.parse(resB.stdout);
  assert.equal(outA.read_model.review_intervention.value, 2);
  assert.equal(outB.read_model.review_intervention.value, 0);
  assert.equal(outA.read_model.artifact_to_live_mismatch.value, 1);
  assert.equal(outB.read_model.artifact_to_live_mismatch.value, 0);
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log('test-harness-quality-proof-project-space-isolation: ok');
