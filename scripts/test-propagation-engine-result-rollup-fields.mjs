/**
 * W11-D — executePropagationPlan 반환에 attempted/completed/blocked/verification_modes_used/
 * resumable/next_human_action additive 필드가 포함되는지 회귀.
 * 기존 필드(propagation_run_id, plan_hash, status, step_rows, failure_resolution_class) 는 보존.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');
const store = await import('../src/founder/projectSpaceBindingStore.js');
const runtime = await import('../src/founder/humanGateRuntime.js');

engine.__resetPropagationEngineMemoryForTests();
store.__resetProjectSpaceBindingMemoryForTests();

await store.upsertProjectSpace({ project_space_key: 'ps_rollup' });

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_rollup',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'OPENAI_API_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_rollup',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'railway',
    secret_handling_mode: 'write_only',
    binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
    required_human_action: '운영자가 Railway 에 SERVICE_ROLE_KEY 직접 입력',
  }),
];
const plan = buildPropagationPlan({
  project_space_key: 'ps_rollup',
  requirements: reqs,
  existingBindings: [],
});

const writers = {
  github: {
    write: async () => ({
      wrote_at: null,
      sink_ref: 'acme/alpha',
      secret_handling_mode: 'write_only',
      verification_kind: 'smoke',
      verification_result: 'ok',
      live: false,
    }),
  },
  railway: {
    write: async () => ({
      wrote_at: null,
      sink_ref: 'svc_x',
      secret_handling_mode: 'write_only',
      verification_kind: 'smoke',
      verification_result: 'failed',
      live: false,
      failure_resolution_class: 'tool_adapter_unavailable',
    }),
  },
};

// open human gate 하나 열어둠 → resumable=true 기대
await runtime.openResumableGate({
  project_space_key: 'ps_rollup',
  gate_kind: 'manual_secret_entry',
  required_human_action: '운영자가 Railway 콘솔에서 SERVICE_ROLE_KEY 확인',
});

const result = await engine.executePropagationPlan({ plan, writers });

// 기존 필드 보존
assert.ok(result.propagation_run_id);
assert.equal(result.plan_hash, plan.plan_hash);
assert.equal(result.status, 'failed');
assert.equal(result.step_rows.length, 2);
assert.equal(result.failure_resolution_class, 'tool_adapter_unavailable');

// W11-D additive 필드
assert.equal(result.attempted_steps_count, 2);
assert.equal(result.completed_steps_count, 1);
assert.equal(result.blocked_steps_count, 1);
assert.ok(Array.isArray(result.verification_modes_used));
assert.ok(result.verification_modes_used.includes('smoke'));
assert.equal(result.resumable, true, 'open human gate exists → resumable=true');
assert.ok(
  typeof result.next_human_action === 'string' && result.next_human_action.length > 0,
  'next_human_action derived',
);

console.log('test-propagation-engine-result-rollup-fields: ok');
