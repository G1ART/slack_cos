/**
 * W11-D — blocked step 의 required_human_action 이 비어 있을 때 registry 기반 fallback 이 동작.
 * supabase (requires_manual_confirmation=true) 블록 → "supabase 콘솔에서 수동 확인 필요" 류 문자열.
 * 또한 blocked step 없고 open gate 없으면 resumable=false, next_human_action=null.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const engine = await import('../src/founder/envSecretPropagationEngine.js');
const store = await import('../src/founder/projectSpaceBindingStore.js');

engine.__resetPropagationEngineMemoryForTests();
store.__resetProjectSpaceBindingMemoryForTests();
await store.upsertProjectSpace({ project_space_key: 'ps_fallback' });

// supabase sink + required_human_action 없음 → registry fallback
const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_fallback',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'supabase',
    secret_handling_mode: 'smoke_only',
    binding_name: 'SUPABASE_ANON_KEY',
  }),
];
const plan = buildPropagationPlan({ project_space_key: 'ps_fallback', requirements: reqs });

// supabase writer 없음 → verification_result='not_applicable' → blocked
const result = await engine.executePropagationPlan({ plan, writers: {} });
assert.equal(result.blocked_steps_count, 1);
assert.equal(result.resumable, false, 'no open gate → resumable false');
assert.ok(
  typeof result.next_human_action === 'string' &&
    result.next_human_action.toLowerCase().includes('supabase'),
  'registry fallback should mention supabase',
);

// 모든 step 성공인 케이스 → blocked=0, next_human_action=null
engine.__resetPropagationEngineMemoryForTests();
const plan2 = buildPropagationPlan({
  project_space_key: 'ps_fallback',
  requirements: [
    buildBindingRequirement({
      project_space_key: 'ps_fallback',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'github',
      secret_handling_mode: 'write_only',
      binding_name: 'OPENAI_API_KEY',
    }),
  ],
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
};
const ok = await engine.executePropagationPlan({ plan: plan2, writers });
assert.equal(ok.blocked_steps_count, 0);
assert.equal(ok.completed_steps_count, 1);
assert.equal(ok.next_human_action, null);
assert.equal(ok.resumable, false);

console.log('test-propagation-engine-next-human-action-fallback: ok');
