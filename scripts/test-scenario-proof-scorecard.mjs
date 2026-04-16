#!/usr/bin/env node
/**
 * W9 regression — scenarioProofScorecard.
 */

import assert from 'node:assert/strict';

import {
  buildScenarioProofScorecard,
  toScorecardCompactLines,
} from '../src/founder/scenarioProofScorecard.js';

const envelopes = [
  {
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome: 'succeeded',
    break_location: 'none',
    founder_surface_slice: { headline: '모든 프로젝트 독립 개설.' },
  },
  {
    scenario_id: 'scenario_2_research_to_bundle',
    run_mode: 'fixture_replay',
    outcome: 'broken',
    break_location: 'human_gate',
    failure_classification: {
      resolution_class: 'hil_required_external_auth',
      human_gate_required: true,
      human_gate_reason: 'OAuth 승인 필요',
      human_gate_action: '관리자에게 Supabase OAuth 승인 요청',
    },
    founder_surface_slice: { headline: 'Supabase OAuth 승인이 필요합니다.' },
  },
  {
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'live_openai',
    outcome: 'inconclusive',
    break_location: 'unclassified',
    failure_classification: { resolution_class: 'hil_required_policy_or_product_decision' },
    founder_surface_slice: { headline: '라이브 실행 게이트 상태입니다.' },
  },
];

const sc = buildScenarioProofScorecard(envelopes);
assert.equal(sc.total, 3);
assert.equal(sc.passed, 1);
assert.equal(sc.broken, 1);
assert.equal(sc.inconclusive, 1);
assert.equal(sc.human_gate_required, 2, '2 hil entries (broken + inconclusive both carry hil class)');
assert.ok(sc.continuation_available >= 1);
assert.equal(sc.break_category_counts.none, 1);
assert.equal(sc.break_category_counts.human, 2);
assert.equal(sc.entries.length, 3);

const lines = toScorecardCompactLines(sc);
assert.ok(lines.length >= 1);
assert.ok(lines[0].includes('3건'));
assert.ok(lines[0].includes('성공 1'));
assert.ok(lines[0].includes('중단 1'));
assert.ok(lines[0].includes('미결 1'));
// 지배 카테고리는 human
const dominantLine = lines.find((l) => l.includes('가장 잦은'));
assert.ok(dominantLine && /사람 승인/.test(dominantLine));

// 빈 입력
const sc0 = buildScenarioProofScorecard([]);
assert.equal(sc0.total, 0);
assert.deepEqual(toScorecardCompactLines(sc0), []);

console.log('test-scenario-proof-scorecard: ok');
