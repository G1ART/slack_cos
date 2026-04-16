/**
 * W5-A: src/founder/failureTaxonomy.js 이 8-enum resolution_class 를 고정하고
 * buildFailureClassification / deriveHumanGateRequiredFromClass / deriveRetryableFromClass /
 * classifyLegacyBlockedSignal 이 예상대로 동작한다.
 */
import assert from 'node:assert/strict';
import {
  FAILURE_RESOLUTION_CLASSES,
  isKnownResolutionClass,
  buildFailureClassification,
  deriveHumanGateRequiredFromClass,
  deriveRetryableFromClass,
  classifyLegacyBlockedSignal,
} from '../src/founder/failureTaxonomy.js';

assert.deepEqual(
  [...FAILURE_RESOLUTION_CLASSES],
  [
    'hil_required_external_auth',
    'hil_required_subscription_or_billing',
    'hil_required_policy_or_product_decision',
    'technical_capability_missing',
    'runtime_bug_or_regression',
    'provider_transient_failure',
    'model_coordination_failure',
    'tenancy_or_binding_ambiguity',
  ],
  'enum exact order and values',
);
assert.equal(FAILURE_RESOLUTION_CLASSES.length, 8);
assert.throws(() => {
  FAILURE_RESOLUTION_CLASSES.push('unknown_kind');
}, 'enum is frozen');

for (const rc of FAILURE_RESOLUTION_CLASSES) assert.ok(isKnownResolutionClass(rc));
assert.equal(isKnownResolutionClass('bogus'), false);
assert.equal(isKnownResolutionClass(null), false);
assert.equal(isKnownResolutionClass(''), false);

assert.equal(deriveHumanGateRequiredFromClass('hil_required_external_auth'), true);
assert.equal(deriveHumanGateRequiredFromClass('hil_required_subscription_or_billing'), true);
assert.equal(deriveHumanGateRequiredFromClass('hil_required_policy_or_product_decision'), true);
assert.equal(deriveHumanGateRequiredFromClass('technical_capability_missing'), true);
assert.equal(deriveHumanGateRequiredFromClass('tenancy_or_binding_ambiguity'), true);
assert.equal(deriveHumanGateRequiredFromClass('runtime_bug_or_regression'), false);
assert.equal(deriveHumanGateRequiredFromClass('provider_transient_failure'), false);
assert.equal(deriveHumanGateRequiredFromClass('model_coordination_failure'), false);
assert.equal(deriveHumanGateRequiredFromClass(null), false);

assert.equal(deriveRetryableFromClass('provider_transient_failure'), true);
assert.equal(deriveRetryableFromClass('model_coordination_failure'), true);
assert.equal(deriveRetryableFromClass('runtime_bug_or_regression'), false);
assert.equal(deriveRetryableFromClass('hil_required_external_auth'), false);
assert.equal(deriveRetryableFromClass(null), false);

const empty = buildFailureClassification({});
assert.deepEqual(empty, {
  resolution_class: null,
  human_gate_required: false,
  human_gate_reason: null,
  human_gate_action: null,
  retryable: false,
  retry_budget_remaining: null,
});

const withClass = buildFailureClassification({ resolution_class: 'hil_required_external_auth', human_gate_reason: '   Slack 봇 토큰을 설치해야 합니다.   ', human_gate_action: 'Slack 워크스페이스에서 앱을 설치해 주세요.' });
assert.equal(withClass.resolution_class, 'hil_required_external_auth');
assert.equal(withClass.human_gate_required, true, 'hil class auto-flags gate');
assert.equal(withClass.human_gate_reason, 'Slack 봇 토큰을 설치해야 합니다.');
assert.equal(withClass.human_gate_action, 'Slack 워크스페이스에서 앱을 설치해 주세요.');
assert.equal(withClass.retryable, false);

const bogus = buildFailureClassification({ resolution_class: 'not_a_real_class' });
assert.equal(bogus.resolution_class, null, 'unknown resolution_class collapses to null');

const retryableFromClass = buildFailureClassification({ resolution_class: 'provider_transient_failure' });
assert.equal(retryableFromClass.retryable, true);
assert.equal(retryableFromClass.human_gate_required, false);

const override = buildFailureClassification({ resolution_class: 'provider_transient_failure', retryable: false, retry_budget_remaining: 3 });
assert.equal(override.retryable, false, 'explicit override wins');
assert.equal(override.retry_budget_remaining, 3);

const budgetNeg = buildFailureClassification({ retry_budget_remaining: -1 });
assert.equal(budgetNeg.retry_budget_remaining, null, 'negative budget dropped');
const budgetBogus = buildFailureClassification({ retry_budget_remaining: 'many' });
assert.equal(budgetBogus.retry_budget_remaining, null);

assert.equal(classifyLegacyBlockedSignal({}), null);
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: '' }), null);
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'missing tenancy workspace_key' }), 'tenancy_or_binding_ambiguity');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'Please authorize OAuth app in Slack' }), 'hil_required_external_auth');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'Supabase billing quota exceeded, please upgrade plan' }), 'hil_required_subscription_or_billing');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'org admin approval required before policy can apply' }), 'hil_required_policy_or_product_decision');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'feature not supported by adapter' }), 'technical_capability_missing');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'transient ECONNRESET from provider' }), 'provider_transient_failure');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'reviewer packet coordination mismatch' }), 'model_coordination_failure');
assert.equal(classifyLegacyBlockedSignal({ blocked_reason: 'completely unrelated short text' }), null, 'low-confidence stays null');
assert.equal(classifyLegacyBlockedSignal({ hint_class: 'technical_capability_missing', blocked_reason: 'whatever' }), 'technical_capability_missing');
assert.equal(classifyLegacyBlockedSignal({ hint_class: 'bogus', blocked_reason: 'please sign in' }), 'hil_required_external_auth', 'bogus hint ignored');

const longReason = buildFailureClassification({ resolution_class: 'runtime_bug_or_regression', human_gate_reason: 'x'.repeat(400) });
assert.ok(longReason.human_gate_reason.length <= 240, 'reason truncated');
assert.ok(longReason.human_gate_reason.endsWith('\u2026'), 'truncation adds ellipsis');

console.log('test-failure-taxonomy-ssot: ok');
