#!/usr/bin/env node
/**
 * W9 regression (W13-B 재구성) — Supabase 운영 모드에서:
 *   - `fixture_replay` 는 메모리 격리로 실행 허용 (outcome 은 러너 판단에 따름)
 *   - `live_openai` 는 `ops/rehearsal_eligibility.json` 에 sandbox_safe entry 가 없을 때
 *     inconclusive(tenancy_or_binding_ambiguity) 로 차단되어야 한다.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

__resetProjectSpaceBindingMemoryForTests();
const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const prevLiveFlag = process.env.COS_SCENARIO_LIVE_OPENAI;
process.env.SUPABASE_URL = 'https://fake-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-w13b-guard-test';

// rehearsal eligibility 파일이 없을 때의 운영 디렉터리 시뮬레이션
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'w13b_guard_'));
const prevCwd = process.cwd();
process.chdir(tmp);

try {
  // (A) fixture_replay 는 Supabase 모드에서도 허용 — inconclusive 로 막히지 않음.
  const outFixture = await runScenarioProofLive({ runMode: 'fixture_replay', writeToDisk: false });
  assert.equal(outFixture.runs.length, 2);
  for (const r of outFixture.runs) {
    // fixture_replay 는 시나리오 자체 결과만 평가한다 — supabase guard 로 막히지 말아야 한다.
    if (r.envelope) {
      assert.notEqual(
        r.envelope.failure_classification?.human_gate_reason,
        'run_store_mode=supabase 상태에서 시나리오 격리를 보장할 수 없습니다.',
        'fixture_replay must not be blocked by legacy supabase guard',
      );
    }
  }

  // (B) live_openai + rehearsal eligibility 없음 → inconclusive block
  process.env.COS_SCENARIO_LIVE_OPENAI = '1';
  const outLive = await runScenarioProofLive({ runMode: 'live_openai', writeToDisk: false });
  assert.equal(outLive.runs.length, 2);
  for (const r of outLive.runs) {
    assert.ok(r.envelope, 'envelope must exist');
    assert.equal(r.envelope.outcome, 'inconclusive');
    assert.equal(
      r.envelope.failure_classification.resolution_class,
      'tenancy_or_binding_ambiguity',
    );
    assert.match(r.envelope.failure_classification.human_gate_reason || '', /rehearsal/);
  }
  assert.equal(outLive.scorecard.inconclusive, 2);
  assert.equal(outLive.scorecard.passed, 0);
} finally {
  process.chdir(prevCwd);
  fs.rmSync(tmp, { recursive: true, force: true });
  if (prevUrl == null) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prevUrl;
  if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
  if (prevLiveFlag == null) delete process.env.COS_SCENARIO_LIVE_OPENAI;
  else process.env.COS_SCENARIO_LIVE_OPENAI = prevLiveFlag;
}

console.log('test-scenario-proof-live-supabase-guard: ok');
