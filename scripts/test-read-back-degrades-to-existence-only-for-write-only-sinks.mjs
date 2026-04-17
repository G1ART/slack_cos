/**
 * W13-A — write-only sink 의 verification_kind 는 propagation plan 에서 read_back 이 선택되지 않고
 * existence_only (또는 smoke) 로 강등되어야 한다. (write_only_write_back_forbidden:true)
 *
 * github, vercel 모두 can_read_back_value=false + write_only_write_back_forbidden=true 이므로
 * plan 은 existence_only 를 선택해야 한다 (registry 에서 existence_only 가 지원되므로).
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const { getCapabilityForSink } = await import('../src/founder/liveBindingCapabilityRegistry.js');

for (const sink of ['github', 'vercel']) {
  const cap = getCapabilityForSink(sink);
  assert.equal(cap.write_only_write_back_forbidden, true, `${sink} must forbid write-back`);
  assert.equal(cap.can_read_back_value, false, `${sink} must have can_read_back_value=false`);

  const plan = buildPropagationPlan({
    project_space_key: 'ps_w13_readback',
    requirements: [
      buildBindingRequirement({
        project_space_key: 'ps_w13_readback',
        binding_kind: 'env_requirement',
        source_system: 'cos',
        sink_system: sink,
        secret_handling_mode: 'write_only',
        binding_name: 'MY_KEY',
      }),
    ],
    existingBindings: [],
  });
  const step = plan.steps[0];
  assert.notEqual(step.verification_kind, 'read_back', `${sink}: must not choose read_back`);
  assert.equal(step.verification_kind, 'existence_only', `${sink}: must choose existence_only`);
}

// Even with sinkCapabilities override { supports_read_back: true },
// registry 의 can_write+write_only_write_back_forbidden 이 true 인 sink 는 read_back 으로 승격되지 않는다.
const planOverride = buildPropagationPlan({
  project_space_key: 'ps_w13_readback',
  requirements: [
    buildBindingRequirement({
      project_space_key: 'ps_w13_readback',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'github',
      secret_handling_mode: 'write_only',
      binding_name: 'OVERRIDE_KEY',
    }),
  ],
  existingBindings: [],
  sinkCapabilities: { github: { supports_secret_write: true, supports_read_back: true } },
});
assert.notEqual(
  planOverride.steps[0].verification_kind,
  'read_back',
  'registry write_only_write_back_forbidden must veto read_back override',
);

console.log('test-read-back-degrades-to-existence-only-for-write-only-sinks: ok');
