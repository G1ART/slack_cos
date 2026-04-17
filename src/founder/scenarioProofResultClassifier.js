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
import { getCapabilityForSink } from './liveBindingCapabilityRegistry.js';
import { BREAK_REASON_CAUSES } from '../../scripts/scenario/scenarioProofEnvelope.js';

/** @typedef {'none'|'adapter'|'policy'|'model'|'runtime'|'human'|'unclassified'} BreakCategory */
/** @typedef {'n_a'|'hil_required'|'implementation_missing'|'flaky_or_transient'|'model_coordination'|'ambiguous'} BreakReasonKind */
/** @typedef {'none'|'binding_propagation_stop'|'external_auth_gate'|'subscription_billing_gate'|'provider_transient_failure'|'product_capability_missing'|'runtime_regression'|'unclassified'} BreakReasonCause */

export { BREAK_REASON_CAUSES };

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
 * @property {BreakReasonCause} break_reason_cause
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
      break_reason_cause: 'unclassified',
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

  // W11-E: break_reason_cause 축 결정. envelope 에 명시된 값이 있으면 우선 사용, 아니면 규칙 유도.
  let break_reason_cause =
    typeof envelope.break_reason_cause === 'string' &&
    BREAK_REASON_CAUSES.includes(envelope.break_reason_cause)
      ? envelope.break_reason_cause
      : null;
  if (!break_reason_cause) {
    break_reason_cause = deriveBreakReasonCause({
      outcome,
      resolution_class,
      break_category,
      break_location: breakLoc,
      failure_classification: fc,
    });
  }

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
    break_reason_cause,
    headline: headline || null,
  };
}

/**
 * Mapping 규칙 (plan §7):
 *  - succeeded → 'none'
 *  - resolution_class='technical_capability_missing' → sink 가 requires_manual_confirmation 이면
 *    'product_capability_missing' 아니면 'provider_transient_failure'
 *  - resolution_class='provider_transient_failure' → 'provider_transient_failure'
 *  - resolution_class 가 hil_required_external_auth / hil_required_subscription_or_billing / hil_required_policy_or_product_decision 중 하나 →
 *    각각 external_auth_gate / subscription_billing_gate / external_auth_gate (policy 는 external_auth_gate 로 보수적 매핑)
 *  - resolution_class='tenancy_or_binding_ambiguity' → 'binding_propagation_stop'
 *  - break_category='runtime' + outcome='broken' → 'runtime_regression'
 *  - 그 외 alert/broken → 'unclassified'
 */
function deriveBreakReasonCause({
  outcome,
  resolution_class,
  break_category,
  break_location,
  failure_classification,
}) {
  void break_location;
  if (outcome === 'succeeded') return 'none';
  if (resolution_class === 'technical_capability_missing') {
    const sink =
      failure_classification && typeof failure_classification.human_gate_reason === 'string'
        ? extractSinkHint(failure_classification.human_gate_reason)
        : null;
    if (sink) {
      const cap = getCapabilityForSink(sink);
      if (cap.requires_manual_confirmation === true) return 'product_capability_missing';
    }
    return 'product_capability_missing';
  }
  if (resolution_class === 'provider_transient_failure') return 'provider_transient_failure';
  if (resolution_class === 'hil_required_external_auth') return 'external_auth_gate';
  if (resolution_class === 'hil_required_subscription_or_billing') return 'subscription_billing_gate';
  if (resolution_class === 'hil_required_policy_or_product_decision') return 'external_auth_gate';
  if (resolution_class === 'tenancy_or_binding_ambiguity') return 'binding_propagation_stop';
  if (resolution_class === 'runtime_bug_or_regression') return 'runtime_regression';
  if (break_category === 'runtime' && outcome === 'broken') return 'runtime_regression';
  return 'unclassified';
}

function extractSinkHint(text) {
  const lower = String(text || '').toLowerCase();
  for (const sink of ['supabase', 'github', 'vercel', 'railway']) {
    if (lower.includes(sink)) return sink;
  }
  return null;
}
