/**
 * W8-B propagation engine — writer failure → step.verification_result=failed + failure_resolution_class
 * roll up 해서 run.status=failed, run.failure_resolution_class 도 첫 실패 클래스로 채워짐.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');

engine.__resetPropagationEngineMemoryForTests();

const plan = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: [
    buildBindingRequirement({
      project_space_key: 'ps_alpha',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'railway',
      secret_handling_mode: 'write_only',
      binding_name: 'OPENAI_API_KEY',
    }),
  ],
  existingBindings: [],
  sinkCapabilities: { railway: { supports_secret_write: true } },
});

const failingWriter = {
  write: async () => ({
    wrote_at: null,
    sink_ref: null,
    secret_handling_mode: 'write_only',
    verification_kind: 'smoke',
    verification_result: 'failed',
    live: false,
    failure_resolution_class: 'tool_adapter_unavailable',
  }),
};

const res = await engine.executePropagationPlan({ plan, writers: { railway: failingWriter } });
assert.equal(res.status, 'failed');
assert.equal(res.failure_resolution_class, 'tool_adapter_unavailable');
assert.equal(res.step_rows[0].verification_result, 'failed');
assert.equal(res.step_rows[0].failure_resolution_class, 'tool_adapter_unavailable');

// writer 자체가 throw 해도 'tool_adapter_unavailable' 로 classify
engine.__resetPropagationEngineMemoryForTests();
const throwingWriter = {
  write: async () => {
    throw new Error('network down');
  },
};
const res2 = await engine.executePropagationPlan({ plan, writers: { railway: throwingWriter } });
assert.equal(res2.status, 'failed');
assert.equal(res2.failure_resolution_class, 'tool_adapter_unavailable');

console.log('test-propagation-engine-failure-classifies: ok');
