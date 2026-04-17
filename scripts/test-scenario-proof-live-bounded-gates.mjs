/**
 * W11-E — scenarioProofLiveRunner 의 bounded live gates.
 * 누락 조합별로 정직한 cause 로 inconclusive 를 반환해야 한다.
 *
 *  1) COS_SCENARIO_LIVE_OPENAI 미설정 → external_auth_gate
 *  2) COS_SCENARIO_LIVE_OPENAI=1 but writers 미주입/COS_LIVE_BINDING_WRITERS!=1 → product_capability_missing
 *  3) Supabase 강제 모드 → binding_propagation_stop
 *  4) 모두 통과 + writers 주입 → bounded block 해제, 기본 경로 진입
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const runner = await import('../src/founder/scenarioProofLiveRunner.js');

// (1) live_openai + COS_SCENARIO_LIVE_OPENAI 미설정 → external_auth_gate
{
  const env = {};
  const res = await runner.runScenarioProofLive({
    runMode: 'live_openai',
    env,
    scenarios: ['scenario_1_multi_project_spinup'],
  });
  assert.equal(res.run_mode, 'live_openai');
  assert.equal(res.runs.length, 1);
  const e = res.runs[0].envelope;
  assert.ok(e, 'envelope built');
  assert.equal(e.outcome, 'inconclusive');
  assert.equal(e.break_reason_cause, 'external_auth_gate');
}

// (2) COS_SCENARIO_LIVE_OPENAI=1 but no writers / COS_LIVE_BINDING_WRITERS!=1 → product_capability_missing
{
  const env = { COS_SCENARIO_LIVE_OPENAI: '1' };
  const res = await runner.runScenarioProofLive({
    runMode: 'live_openai',
    env,
    scenarios: ['scenario_2_research_to_bundle'],
  });
  const e = res.runs[0].envelope;
  assert.ok(e);
  assert.equal(e.outcome, 'inconclusive');
  assert.equal(e.break_reason_cause, 'product_capability_missing');
}

// (3) Supabase 강제 모드 → binding_propagation_stop
{
  // executionRunStore.storeMode() 는 createCosRuntimeSupabase() 가 truthy 일 때만 supabase 를
  // 반환하므로, SUPABASE_URL/SERVICE_ROLE_KEY 를 임시로 채워 supabase 모드를 흉내낸다.
  const prevUrl = process.env.SUPABASE_URL;
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevStore = process.env.COS_RUN_STORE;
  process.env.SUPABASE_URL = 'https://fake.supabase.co';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-value';
  delete process.env.COS_RUN_STORE;
  try {
    const res = await runner.runScenarioProofLive({
      runMode: 'live_openai',
      env: { COS_SCENARIO_LIVE_OPENAI: '1', COS_LIVE_BINDING_WRITERS: '1' },
      scenarios: ['scenario_1_multi_project_spinup'],
    });
    const e = res.runs[0].envelope;
    assert.ok(e);
    assert.equal(e.outcome, 'inconclusive');
    assert.equal(e.break_reason_cause, 'binding_propagation_stop');
  } finally {
    if (prevUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevStore == null) delete process.env.COS_RUN_STORE;
    else process.env.COS_RUN_STORE = prevStore;
  }
}

// (4) live_openai + 자격 모두 충족 + writers 주입 → bounded block 해제 (기본 러너 실행 경로)
// 이 경우 러너가 내부적으로 fixture 가 없으면 inconclusive 를 돌려줄 수 있지만 cause 는 bounded block
// 의 것과 달라야 한다. bounded block 이 해제되었음을 입증하기 위해 cause 가 product_capability_missing
// 또는 external_auth_gate 가 아님을 확인한다(기본 러너가 자체 cause 를 쓰지 않으면 'unclassified').
{
  const env = { COS_SCENARIO_LIVE_OPENAI: '1' };
  const res = await runner.runScenarioProofLive({
    runMode: 'live_openai',
    env,
    writers: { github: {}, railway: {}, supabase: {}, vercel: {} },
    scenarios: ['scenario_1_multi_project_spinup'],
  });
  const e = res.runs[0].envelope;
  // bounded block 은 해제 → 기본 러너 경로가 돌아가야 한다. 결과가 inconclusive 여도
  // break_reason_cause 가 external_auth_gate/product_capability_missing 이 아니어야 한다.
  assert.ok(e, 'bounded block lifted → base runner ran');
  assert.ok(
    !['external_auth_gate', 'product_capability_missing'].includes(e.break_reason_cause),
    `bounded block should be lifted, got cause=${e.break_reason_cause}`,
  );
}

console.log('test-scenario-proof-live-bounded-gates: ok');
