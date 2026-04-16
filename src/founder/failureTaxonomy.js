/**
 * W5-A Failure taxonomy SSOT.
 *
 * `resolution_class` 는 실행/툴/워크셀 실패의 기계 분류 enum (8종 고정). 헌법 §2/§6 에 따라
 * founder 본문에 **토큰을 노출하지 않는다**. 대신 `human_gate_required/reason/action` 같은
 * **자연어** 필드가 founder 표면 렌더러(W4)에 병치되어 "다음 조치: …" 한 줄로만 쓰인다.
 *
 * 이 모듈은 입력 heuristic 를 `resolution_class` 로 정규화하는 **순수 함수**만 제공하며,
 * 어떤 tool·lane·store 도 직접 참조하지 않는다 (단방향 의존).
 */

/** @typedef {'hil_required_external_auth' | 'hil_required_subscription_or_billing' | 'hil_required_policy_or_product_decision' | 'technical_capability_missing' | 'runtime_bug_or_regression' | 'provider_transient_failure' | 'model_coordination_failure' | 'tenancy_or_binding_ambiguity'} ResolutionClass */

export const FAILURE_RESOLUTION_CLASSES = Object.freeze([
  'hil_required_external_auth',
  'hil_required_subscription_or_billing',
  'hil_required_policy_or_product_decision',
  'technical_capability_missing',
  'runtime_bug_or_regression',
  'provider_transient_failure',
  'model_coordination_failure',
  'tenancy_or_binding_ambiguity',
]);

const RESOLUTION_SET = new Set(FAILURE_RESOLUTION_CLASSES);

export function isKnownResolutionClass(v) {
  return typeof v === 'string' && RESOLUTION_SET.has(v);
}

/**
 * Build the canonical failure classification envelope (W5-A).
 * Empty/unknown inputs collapse to null fields — callers must not invent categories.
 *
 * @param {object} [input]
 * @param {ResolutionClass | string | null} [input.resolution_class]
 * @param {boolean | null} [input.human_gate_required]
 * @param {string | null} [input.human_gate_reason]
 * @param {string | null} [input.human_gate_action]
 * @param {boolean | null} [input.retryable]
 * @param {number | null} [input.retry_budget_remaining]
 */
export function buildFailureClassification(input = {}) {
  const rc = isKnownResolutionClass(input.resolution_class) ? input.resolution_class : null;
  const hgr = typeof input.human_gate_required === 'boolean' ? input.human_gate_required : deriveHumanGateRequiredFromClass(rc);
  const reason = compactLine(input.human_gate_reason, 240);
  const action = compactLine(input.human_gate_action, 240);
  const retryable = typeof input.retryable === 'boolean' ? input.retryable : deriveRetryableFromClass(rc);
  const budget = Number.isFinite(input.retry_budget_remaining) && input.retry_budget_remaining >= 0
    ? Math.trunc(input.retry_budget_remaining)
    : null;
  return {
    resolution_class: rc,
    human_gate_required: hgr,
    human_gate_reason: reason,
    human_gate_action: action,
    retryable,
    retry_budget_remaining: budget,
  };
}

/**
 * HIL-classes are always human_gate_required; technical_capability_missing is human-gated too
 * (product/scope decision). Runtime bugs / transient failures / coordination failures are not
 * HIL-required by default. `tenancy_or_binding_ambiguity` escalates to founder when detected.
 */
export function deriveHumanGateRequiredFromClass(rc) {
  switch (rc) {
    case 'hil_required_external_auth':
    case 'hil_required_subscription_or_billing':
    case 'hil_required_policy_or_product_decision':
    case 'technical_capability_missing':
    case 'tenancy_or_binding_ambiguity':
      return true;
    case 'runtime_bug_or_regression':
    case 'provider_transient_failure':
    case 'model_coordination_failure':
      return false;
    default:
      return false;
  }
}

/**
 * Only transient failures and model coordination failures are retryable by default.
 * Others require code or human intervention first, so retrying them is misleading.
 */
export function deriveRetryableFromClass(rc) {
  switch (rc) {
    case 'provider_transient_failure':
    case 'model_coordination_failure':
      return true;
    default:
      return false;
  }
}

/**
 * Opinionated heuristic that turns a legacy free-text blocked_reason / capability hint into
 * a resolution_class. When confidence is low the function returns null — callers must not
 * fall back to runtime_bug_or_regression automatically. This keeps the classifier honest.
 *
 * @param {object} [input]
 * @param {string | null} [input.blocked_reason]
 * @param {string | null} [input.next_required_input]
 * @param {string | null} [input.hint_class] - caller-provided override, must be a known class
 * @returns {ResolutionClass | null}
 */
export function classifyLegacyBlockedSignal(input = {}) {
  if (isKnownResolutionClass(input.hint_class)) return input.hint_class;
  const blob = [input.blocked_reason, input.next_required_input]
    .map((s) => (typeof s === 'string' ? s.toLowerCase() : ''))
    .join(' \u0000 ');
  if (!blob.trim()) return null;
  if (/\b(oauth|bot token|slack_bot_token|sign in|authorize|authorization|credential|install the app)\b/.test(blob)) {
    return 'hil_required_external_auth';
  }
  if (/\b(billing|subscription|quota|plan|seat|upgrade|payment|invoice)\b/.test(blob)) {
    return 'hil_required_subscription_or_billing';
  }
  if (/\b(policy|approval|org admin|legal|privacy|security review|compliance)\b/.test(blob)) {
    return 'hil_required_policy_or_product_decision';
  }
  if (/\b(capability|feature not supported|not yet implemented|unsupported action|unknown tool)\b/.test(blob)) {
    return 'technical_capability_missing';
  }
  if (/\b(tenancy|workspace_key|product_key|project_space_key|parcel_deployment_key|missing tenancy|tenantless)\b/.test(blob)) {
    return 'tenancy_or_binding_ambiguity';
  }
  if (/\b(timeout|rate limit|5\d\d|temporar(ily|y)|transient|network|connection reset|ecgonnrefused|econnreset)\b/.test(blob)) {
    return 'provider_transient_failure';
  }
  if (/\b(contract|persona|packet.*missing|coordination|handoff|reviewer)\b/.test(blob)) {
    return 'model_coordination_failure';
  }
  return null;
}

function compactLine(v, max = 240) {
  if (typeof v !== 'string') return null;
  const t = v.replace(/\s+/g, ' ').trim();
  if (!t) return null;
  return t.length > max ? `${t.slice(0, max - 1)}\u2026` : t;
}
