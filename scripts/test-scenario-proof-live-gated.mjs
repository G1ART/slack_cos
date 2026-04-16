#!/usr/bin/env node
/**
 * W9 regression — live_openai 모드는 COS_SCENARIO_LIVE_OPENAI 미설정 시 inconclusive.
 */

import assert from 'node:assert/strict';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

__resetProjectSpaceBindingMemoryForTests();
const prev = process.env.COS_SCENARIO_LIVE_OPENAI;
delete process.env.COS_SCENARIO_LIVE_OPENAI;
try {
  const out = await runScenarioProofLive({ runMode: 'live_openai', writeToDisk: false });
  assert.equal(out.run_mode, 'live_openai');
  assert.equal(out.runs.length, 2);
  for (const r of out.runs) {
    assert.ok(r.envelope, 'envelope should still be built in gated inconclusive mode');
    assert.equal(r.envelope.outcome, 'inconclusive');
    assert.equal(r.envelope.run_mode, 'live_openai');
    assert.equal(r.classification.human_gate_required, true);
  }
  assert.equal(out.scorecard.passed, 0);
  assert.equal(out.scorecard.broken, 0);
  assert.equal(out.scorecard.inconclusive, 2);
} finally {
  if (prev != null) process.env.COS_SCENARIO_LIVE_OPENAI = prev;
}

console.log('test-scenario-proof-live-gated: ok');
