/**
 * W12-D — scorecard 가 capability_mismatch_counts 를 집계하고 compact lines 에 한 줄 노출한다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildScenarioProofScorecard, toScorecardCompactLines } = await import(
  '../src/founder/scenarioProofScorecard.js'
);
const { buildScenarioProofEnvelope } = await import(
  '../scripts/scenario/scenarioProofEnvelope.js'
);

function mk(cause, res_class) {
  const b = buildScenarioProofEnvelope({
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'live_openai',
    started_at: new Date().toISOString(),
    finished_at: new Date().toISOString(),
    outcome: 'inconclusive',
    break_location: 'unclassified',
    break_reason_cause: cause,
    failure_classification: {
      resolution_class: res_class,
      human_gate_reason: 'x',
      human_gate_action: 'y',
    },
    founder_surface_slice: { headline: 'x' },
  });
  assert.ok(b.ok, `envelope build: ${(b.errors || []).join(';')}`);
  return b.envelope;
}

const envs = [
  mk('product_capability_missing', 'technical_capability_missing'),
  mk('product_capability_missing', 'technical_capability_missing'),
  mk('external_auth_gate', 'hil_required_policy_or_product_decision'),
];
const sc = buildScenarioProofScorecard(envs);
assert.equal(sc.capability_mismatch_counts, 2, 'two capability mismatches');
assert.equal(sc.total, 3);
const entriesMismatch = sc.entries.filter((e) => e.capability_mismatch === true).length;
assert.equal(entriesMismatch, 2);

const lines = toScorecardCompactLines(sc);
const joined = lines.join('\n');
assert.match(joined, /제품 기능 불일치 2건/);

console.log('test-scenario-scorecard-capability-mismatch-counts: ok');
