#!/usr/bin/env node
/**
 * W9 regression — runner 출력(compact_lines + scorecard entries) 에 시크릿/토큰/내부 jargon 이 새지 않는다.
 *
 * fixture 에 악의적 secret 을 심어도 founder 표면(compact_lines, headline) 에는 드러나지 않아야 한다.
 * (scenarioProofEnvelope 은 founder_surface_slice.headline 에 대해 이미 internal jargon 패턴을 검사한다.)
 */

import assert from 'node:assert/strict';

import { runScenarioProofLive } from '../src/founder/scenarioProofLiveRunner.js';
import { __resetProjectSpaceBindingMemoryForTests } from '../src/founder/projectSpaceBindingStore.js';

const SECRET_PATTERNS = [
  /ghp_[A-Za-z0-9_-]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /eyJ[A-Za-z0-9._-]{20,}/,
  /Bearer\s+[A-Za-z0-9._-]{20,}/i,
  /resolution_class=/,
  /parcel_deployment_key/,
];

function assertNoSecret(s, ctx) {
  for (const re of SECRET_PATTERNS) {
    assert.ok(!re.test(String(s)), `secret-like pattern ${re} leaked in ${ctx}: ${s}`);
  }
}

__resetProjectSpaceBindingMemoryForTests();
const out = await runScenarioProofLive({ runMode: 'fixture_replay', writeToDisk: false });
for (const ln of out.compact_lines) assertNoSecret(ln, 'compact_lines');
for (const entry of out.scorecard.entries) {
  if (entry.headline) assertNoSecret(entry.headline, 'scorecard.entries.headline');
  assertNoSecret(entry.scenario_id, 'scorecard.entries.scenario_id');
  assertNoSecret(entry.outcome, 'scorecard.entries.outcome');
  assertNoSecret(entry.break_category, 'scorecard.entries.break_category');
}
for (const r of out.runs) {
  if (r.envelope && r.envelope.founder_surface_slice) {
    const fs = r.envelope.founder_surface_slice;
    if (fs.headline) assertNoSecret(fs.headline, 'envelope.founder_surface_slice.headline');
    if (fs.human_gate_action) assertNoSecret(fs.human_gate_action, 'envelope.founder_surface_slice.human_gate_action');
  }
}

console.log('test-scenario-proof-live-no-secret-leak: ok');
