/**
 * W8-B propagation plan SSOT — schema · step shape · plan_hash 안정성 회귀.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'railway',
    secret_handling_mode: 'write_only',
    binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
    required_human_action: '운영자가 .env 에 붙여 넣기',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'github',
    secret_handling_mode: 'plain_readable',
    binding_name: 'acme/alpha-web',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'db_binding',
    source_system: 'supabase',
    sink_system: 'supabase',
    secret_handling_mode: 'smoke_only',
  }),
];

const sinkCapabilities = {
  github: { supports_secret_write: true, supports_read_back: false },
  railway: { supports_secret_write: true, supports_read_back: false },
  supabase: { supports_secret_write: false, supports_read_back: false },
  vercel: { supports_secret_write: true, supports_read_back: true },
};

const plan = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: reqs,
  existingBindings: [],
  sinkCapabilities,
});

assert.equal(plan.project_space_key, 'ps_alpha');
assert.equal(plan.steps.length, 3);
assert.ok(plan.plan_hash && plan.plan_hash.length === 32);
assert.ok(Array.isArray(plan.missing_source_values_names));
assert.ok(plan.missing_source_values_names.includes('SUPABASE_SERVICE_ROLE_KEY'));

// step shape
for (const s of plan.steps) {
  assert.ok(typeof s.step_index === 'number');
  assert.ok(['read_back', 'smoke', 'none'].includes(s.verification_kind));
  assert.ok(['plain_readable', 'write_only', 'smoke_only'].includes(s.secret_handling_mode));
}

// Railway(env_requirement, write-only) → smoke
assert.equal(plan.steps[0].verification_kind, 'smoke');
// GitHub (repo, readable) → smoke (no read_back cap set)
assert.equal(plan.steps[1].verification_kind, 'smoke');
// Supabase (no secret_write cap) → none
assert.equal(plan.steps[2].verification_kind, 'none');

// 동일 입력 → 동일 hash (deterministic)
const plan2 = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: reqs,
  existingBindings: [],
  sinkCapabilities,
});
assert.equal(plan2.plan_hash, plan.plan_hash);

// requirement 가 이미 binding 으로 있으면 missing_source_values 에서 빠짐
const plan3 = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: reqs,
  existingBindings: [
    { binding_kind: 'env_requirement', binding_ref: 'SUPABASE_SERVICE_ROLE_KEY' },
  ],
  sinkCapabilities,
});
assert.ok(!plan3.missing_source_values_names.includes('SUPABASE_SERVICE_ROLE_KEY'));

console.log('test-propagation-plan-schema: ok');
