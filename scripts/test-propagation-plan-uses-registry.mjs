/**
 * W11-A — buildPropagationPlan 이 sinkCapabilities 미전달 시 registry 를 사용하는지 회귀.
 *
 * - sinkCapabilities 생략하면 supabase 는 verification_kind='none' 으로 나와야 함 (can_write=false).
 * - github(write_only) 는 registry 상 can_write=true → 'smoke' 로 나와야 함.
 * - 호출측이 sinkCapabilities 를 직접 넘기면 그 값이 우선 사용되어야 함.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_w11a',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'OPENAI_API_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_w11a',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'supabase',
    secret_handling_mode: 'smoke_only',
    binding_name: 'INTERNAL_SVC',
  }),
];

// (1) sinkCapabilities 없이 → registry 기본값 사용
const planDefault = buildPropagationPlan({
  project_space_key: 'ps_w11a',
  requirements: reqs,
  existingBindings: [],
});
assert.equal(planDefault.steps.length, 2);
const githubStep = planDefault.steps.find((s) => s.sink_system === 'github');
const supabaseStep = planDefault.steps.find((s) => s.sink_system === 'supabase');
assert.equal(githubStep.verification_kind, 'smoke', 'github default → smoke');
assert.equal(supabaseStep.verification_kind, 'none', 'supabase default → none (no write cap)');

// (2) 호출측이 legacy shape 을 주면 그대로 우선
const planOverride = buildPropagationPlan({
  project_space_key: 'ps_w11a',
  requirements: reqs,
  existingBindings: [],
  sinkCapabilities: {
    github: { supports_secret_write: false, supports_read_back: false },
    supabase: { supports_secret_write: true, supports_read_back: true },
  },
});
const ghOverride = planOverride.steps.find((s) => s.sink_system === 'github');
const sbOverride = planOverride.steps.find((s) => s.sink_system === 'supabase');
assert.equal(ghOverride.verification_kind, 'none', 'override forces github → none');
assert.equal(sbOverride.verification_kind, 'read_back', 'override forces supabase → read_back');

console.log('test-propagation-plan-uses-registry: ok');
