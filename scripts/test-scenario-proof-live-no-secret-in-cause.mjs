/**
 * W11-E — bounded live gates 경로의 envelope/compact lines 에 어떤 secret, token, URL,
 * 내부 jargon 도 섞이지 않아야 한다(헌법 §4 Founder Surface 최소 토큰).
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const runner = await import('../src/founder/scenarioProofLiveRunner.js');
const { classifyScenarioProofEnvelope } = await import(
  '../src/founder/scenarioProofResultClassifier.js'
);
const { buildScenarioProofScorecard, toScorecardCompactLines } = await import(
  '../src/founder/scenarioProofScorecard.js'
);

const env = {
  COS_SCENARIO_LIVE_OPENAI: '1',
  OPENAI_API_KEY: 'sk-test-secret-not-for-log-xyzxyzxyzxyz',
  GITHUB_TOKEN: 'ghp_supersecrettokenplaceholder1234567890',
  SUPABASE_SERVICE_ROLE_KEY: 'eyJsecretjwt.payload.sig',
};

// writers 없음 → product_capability_missing bounded inconclusive
const res = await runner.runScenarioProofLive({
  runMode: 'live_openai',
  env,
  scenarios: ['scenario_1_multi_project_spinup', 'scenario_2_research_to_bundle'],
});

const envelopes = res.runs.map((r) => r.envelope).filter(Boolean);
assert.equal(envelopes.length, 2);

for (const ev of envelopes) {
  const json = JSON.stringify(ev);
  assert.ok(!/sk-test-secret/.test(json), 'no openai key leak in envelope');
  assert.ok(!/ghp_[A-Za-z0-9]{8,}/.test(json), 'no github token in envelope');
  assert.ok(!/eyJ[A-Za-z0-9._-]{10,}/.test(json), 'no supabase JWT in envelope');
  assert.ok(!/https?:\/\//.test(json), 'no URL in envelope');
}

const scorecard = buildScenarioProofScorecard(
  envelopes.map((e) => ({
    ...e,
    // classifier 를 통해 cause 를 최종 확정해도 같은 제약이 유지되는지 확인
    break_reason_cause: classifyScenarioProofEnvelope(e).break_reason_cause,
  })),
);

const lines = toScorecardCompactLines(scorecard);
const joined = lines.join('\n');

assert.ok(!/sk-test-secret/.test(joined));
assert.ok(!/ghp_[A-Za-z0-9]{8,}/.test(joined));
assert.ok(!/eyJ[A-Za-z0-9._-]{10,}/.test(joined));
assert.ok(!/https?:\/\//.test(joined));

// 내부 토큰/enum 그대로 노출 금지
assert.ok(!/product_capability_missing/.test(joined));
assert.ok(!/external_auth_gate/.test(joined));
assert.ok(!/resolution_class/.test(joined));
assert.ok(!/break_reason_cause/.test(joined));

console.log('test-scenario-proof-live-no-secret-in-cause: ok');
