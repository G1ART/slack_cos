#!/usr/bin/env node
/**
 * W9 regression — 운영 Supabase 모드(COS_RUN_STORE_MODE=supabase) 에서는 시나리오 러너가
 * inconclusive(tenancy_or_binding_ambiguity) 로 내려앉아야 한다. scenario 1 + scenario 2 둘 다.
 */

import assert from 'node:assert/strict';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

__resetProjectSpaceBindingMemoryForTests();
const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL = 'https://fake-test.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'fake-service-role-key-for-w9-guard-test';
try {
  const out = await runScenarioProofLive({ runMode: 'fixture_replay', writeToDisk: false });
  assert.equal(out.runs.length, 2);
  for (const r of out.runs) {
    assert.ok(r.envelope);
    assert.equal(r.envelope.outcome, 'inconclusive');
    assert.equal(r.envelope.failure_classification.resolution_class, 'tenancy_or_binding_ambiguity');
  }
  assert.equal(out.scorecard.inconclusive, 2);
  assert.equal(out.scorecard.passed, 0);
} finally {
  if (prevUrl == null) delete process.env.SUPABASE_URL;
  else process.env.SUPABASE_URL = prevUrl;
  if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
}

console.log('test-scenario-proof-live-supabase-guard: ok');
