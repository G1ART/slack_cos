/**
 * W11-A — 알 수 없는 sink 에 대해 registry fallback 이 fail-closed (verification_kind='none') 인지 회귀.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const { getCapabilityForSink } = await import('../src/founder/liveBindingCapabilityRegistry.js');

const unknown = getCapabilityForSink('some-totally-new-sink');
assert.equal(unknown.can_write, false, 'unknown sink must be fail-closed');

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_unknown',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'some-totally-new-sink',
    secret_handling_mode: 'write_only',
    binding_name: 'SECRET_NAME',
  }),
];

const plan = buildPropagationPlan({
  project_space_key: 'ps_unknown',
  requirements: reqs,
  existingBindings: [],
});
assert.equal(plan.steps.length, 1);
assert.equal(
  plan.steps[0].verification_kind,
  'none',
  'unknown sink must fall through to verification_kind=none',
);

console.log('test-propagation-plan-unknown-sink-fails-closed: ok');
