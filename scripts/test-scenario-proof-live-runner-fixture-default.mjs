#!/usr/bin/env node
/**
 * W9 regression — scenarioProofLiveRunner 기본 fixture_replay 경로.
 *
 * scenario 1 + scenario 2 기본 fixture 로 성공, scorecard 가 2건 카운트, compact_lines 생성.
 * 디스크 write 는 하지 않는다.
 */

import assert from 'node:assert/strict';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

__resetProjectSpaceBindingMemoryForTests();
const out = await runScenarioProofLive({ runMode: 'fixture_replay', writeToDisk: false });
assert.equal(out.run_mode, 'fixture_replay');
assert.equal(out.runs.length, 2);
for (const r of out.runs) {
  assert.ok(r.envelope, 'envelope should be built');
  assert.ok(r.classification, 'classification should be present');
  assert.equal(r.build_errors, null);
}
assert.equal(out.scorecard.total, 2);
assert.equal(out.scorecard.passed, 2, 'default fixtures should pass');
assert.equal(out.scorecard.broken, 0);
assert.equal(out.scorecard.inconclusive, 0);
assert.ok(out.compact_lines.length >= 1);
assert.ok(out.compact_lines[0].includes('2건'));

console.log('test-scenario-proof-live-runner-fixture-default: ok');
