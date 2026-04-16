/**
 * W9 — ScenarioProofResultClassifier.
 *
 * ScenarioProofEnvelope(W6-A SSOT) 를 입력으로 받아 "어디서 멈췄는지"·"사람 필요 vs 구현 미비"·
 * "adapter/policy/model/runtime"·"continuation path 존재 여부" 4축으로 분류한다.
 *
 * 순수 함수 — 외부 store/fetch/Slack 호출 금지. founder 본문에 토큰 그대로 흘리지 않는다
 * (compact_lines 는 자연어로만 표현).
 */

import {
  FAILURE_RESOLUTION_CLASSES,
} from './failureTaxonomy.js';

/** @typedef {'none'|'adapter'|'policy'|'model'|'runtime'|'human'|'unclassified'} BreakCategory */
/** @typedef {'n_a'|'hil_required'|'implementation_missing'|'flaky_or_transient'|'model_coordination'|'ambiguous'} BreakReasonKind */

export const BREAK_CATEGORIES = Object.freeze([
  'none',
  'adapter',
  'policy',
  'model',
  'runtime',
  'human',
  'unclassified',
]);

export const BREAK_REASON_KINDS = Object.freeze([
  'n_a',
  'hil_required',
  'implementation_missing',
  'flaky_or_transient',
  'model_coordination',
  'ambiguous',
]);

const RES_TO_CATEGORY = Object.freeze({
  hil_required_external_auth: 'human',
  hil_required_subscription_or_billing: 'human',
  hil_required_policy_or_product_decision: 'human',
  technical_capability_missing: 'adapter',
  runtime_bug_or_regression: 'runtime',
  provider_transient_failure: 'adapter',
  model_coordination_failure: 'model',
  tenancy_or_binding_ambiguity: 'runtime',
});

const RES_TO_REASON = Object.freeze({
  hil_required_external_auth: 'hil_required',
  hil_required_subscription_or_billing: 'hil_required',
  hil_required_policy_or_product_decision: 'hil_required',
  technical_capability_missing: 'implementation_missing',
  runtime_bug_or_regression: 'implementation_missing',
  provider_transient_failure: 'flaky_or_transient',
  model_coordination_failure: 'model_coordination',
  tenancy_or_binding_ambiguity: 'ambiguous',
});

/**
 * @typedef {Object} ScenarioProofClassification
 * @property {string} scenario_id
 * @property {string} run_mode
 * @property {string} outcome
 * @property {string} break_location
 * @property {BreakCategory} break_category
 * @property {BreakReasonKind} break_reason_kind
 * @property {boolean} human_gate_required
 * @property {boolean} continuation_path_exists
 * @property {string|null} resolution_class
 * @property {string|null} headline
 */

/**
 * @param {import('../../scripts/scenario/scenarioProofEnvelope.js').ScenarioProofEnvelope} envelope
 * @returns {ScenarioProofClassification}
 */
export function classifyScenarioProofEnvelope(envelope) {
  if (!envelope || typeof envelope !== 'object') {
    return {
      scenario_id: '',
      run_mode: '',
      outcome: 'inconclusive',
      break_location: 'unclassified',
      break_category: 'unclassified',
      break_reason_kind: 'ambiguous',
      human_gate_required: false,
      continuation_path_exists: false,
      resolution_class: null,
      headline: null,
    };
  }
  const outcome = envelope.outcome || 'inconclusive';
  const breakLoc = envelope.break_location || (outcome === 'succeeded' ? 'none' : 'unclassified');
  const fc = envelope.failure_classification || null;
  const resolution_class =
    fc && fc.resolution_class && FAILURE_RESOLUTION_CLASSES.includes(fc.resolution_class) ? fc.resolution_class : null;

  /** @type {BreakCategory} */
  let break_category = 'none';
  /** @type {BreakReasonKind} */
  let break_reason_kind = 'n_a';
  if (outcome === 'succeeded') {
    break_category = 'none';
    break_reason_kind = 'n_a';
  } else if (resolution_class) {
    break_category = RES_TO_CATEGORY[resolution_class] || 'unclassified';
    break_reason_kind = RES_TO_REASON[resolution_class] || 'ambiguous';
  } else if (breakLoc === 'human_gate') {
    break_category = 'human';
    break_reason_kind = 'hil_required';
  } else if (breakLoc === 'tool_dispatch' || breakLoc === 'workcell_runtime') {
    break_category = 'model';
    break_reason_kind = 'model_coordination';
  } else if (breakLoc === 'callback_closure') {
    break_category = 'adapter';
    break_reason_kind = 'implementation_missing';
  } else if (breakLoc === 'none') {
    break_category = 'unclassified';
    break_reason_kind = 'ambiguous';
  } else {
    break_category = 'unclassified';
    break_reason_kind = 'ambiguous';
  }

  const human_gate_required =
    !!(fc && (fc.human_gate_required === true || (fc.human_gate_reason && break_category === 'human'))) ||
    break_reason_kind === 'hil_required';

  const continuation_path_exists =
    (Array.isArray(envelope.steps) && envelope.steps.some((s) => s && s.step_id && /^continuation_/.test(s.step_id))) ||
    (human_gate_required && Boolean(fc && (fc.human_gate_action || fc.human_gate_reason)));

  const headline =
    envelope.founder_surface_slice && typeof envelope.founder_surface_slice.headline === 'string'
      ? envelope.founder_surface_slice.headline
      : null;

  return {
    scenario_id: envelope.scenario_id || '',
    run_mode: envelope.run_mode || '',
    outcome,
    break_location: breakLoc,
    break_category,
    break_reason_kind,
    human_gate_required,
    continuation_path_exists,
    resolution_class,
    headline: headline || null,
  };
}
