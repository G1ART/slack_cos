#!/usr/bin/env node
/**
 * W9 regression — scenarioProofResultClassifier.
 *
 * 고정 케이스: envelope(succeeded/broken/inconclusive) → break_category/human_gate/continuation 정합.
 */

import assert from 'node:assert/strict';

import {
  classifyScenarioProofEnvelope,
  BREAK_CATEGORIES,
  BREAK_REASON_KINDS,
} from '../src/founder/scenarioProofResultClassifier.js';

{
  const c = classifyScenarioProofEnvelope({
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome: 'succeeded',
    break_location: 'none',
    steps: [{ step_id: 'ok1', status: 'ok' }],
    founder_surface_slice: { headline: '모든 프로젝트가 독립적으로 열렸습니다.' },
  });
  assert.equal(c.outcome, 'succeeded');
  assert.equal(c.break_category, 'none');
  assert.equal(c.break_reason_kind, 'n_a');
  assert.equal(c.human_gate_required, false);
  assert.equal(c.continuation_path_exists, false);
}

{
  const c = classifyScenarioProofEnvelope({
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome: 'broken',
    break_location: 'human_gate',
    founder_surface_slice: { headline: '빌링 승인이 필요합니다.' },
    failure_classification: {
      resolution_class: 'hil_required_subscription_or_billing',
      human_gate_required: true,
      human_gate_reason: 'Supabase 유료 플랜 필요',
      human_gate_action: 'Supabase 빌링 활성화',
    },
  });
  assert.equal(c.break_category, 'human');
  assert.equal(c.break_reason_kind, 'hil_required');
  assert.equal(c.human_gate_required, true);
  assert.equal(c.continuation_path_exists, true);
  assert.equal(c.resolution_class, 'hil_required_subscription_or_billing');
}

{
  const c = classifyScenarioProofEnvelope({
    scenario_id: 'scenario_2_research_to_bundle',
    run_mode: 'fixture_replay',
    outcome: 'broken',
    break_location: 'workcell_runtime',
    failure_classification: { resolution_class: 'model_coordination_failure' },
  });
  assert.equal(c.break_category, 'model');
  assert.equal(c.break_reason_kind, 'model_coordination');
  assert.equal(c.human_gate_required, false);
}

{
  const c = classifyScenarioProofEnvelope({
    scenario_id: 'scenario_2_research_to_bundle',
    run_mode: 'live_openai',
    outcome: 'inconclusive',
    break_location: 'unclassified',
    failure_classification: { resolution_class: 'tool_adapter_unavailable' },
  });
  // unknown resolution_class (not in FAILURE_RESOLUTION_CLASSES) → null
  assert.equal(c.resolution_class, null);
  assert.equal(c.break_category, 'unclassified');
  assert.equal(c.break_reason_kind, 'ambiguous');
}

{
  assert.ok(BREAK_CATEGORIES.includes('human'));
  assert.ok(BREAK_CATEGORIES.includes('adapter'));
  assert.ok(BREAK_REASON_KINDS.includes('hil_required'));
  assert.ok(BREAK_REASON_KINDS.includes('implementation_missing'));
}

{
  // steps 에 continuation_* 가 있으면 continuation_path_exists=true
  const c = classifyScenarioProofEnvelope({
    scenario_id: 'scenario_1_multi_project_spinup',
    run_mode: 'fixture_replay',
    outcome: 'broken',
    break_location: 'tool_dispatch',
    steps: [{ step_id: 'continuation_after_oauth', status: 'skipped' }],
    failure_classification: { resolution_class: 'technical_capability_missing' },
  });
  assert.equal(c.break_category, 'adapter');
  assert.equal(c.continuation_path_exists, true);
}

console.log('test-scenario-proof-result-classifier: ok');
