/**
 * W8-A — binding requirement 는 값(secret) 을 절대 저장하지 않는다.
 * env_requirement 에는 NAME 만 허용, 다른 kind 의 binding_name 도 공백·과대 길이 차단.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');

// env_requirement 는 NAME 만 허용 — 값 모양 차단
assert.throws(
  () =>
    buildBindingRequirement({
      project_space_key: 'ps_alpha',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'railway',
      secret_handling_mode: 'write_only',
      binding_name: 'AKIAIOSFODNN7EXAMPLE',
    }),
  /env_requirement\.binding_ref/i,
);
assert.throws(
  () =>
    buildBindingRequirement({
      project_space_key: 'ps_alpha',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'railway',
      secret_handling_mode: 'write_only',
      binding_name: 'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi',
    }),
);
assert.throws(
  () =>
    buildBindingRequirement({
      project_space_key: 'ps_alpha',
      binding_kind: 'env_requirement',
      source_system: 'cos',
      sink_system: 'railway',
      secret_handling_mode: 'write_only',
      binding_name: 'https://supabase.co/api',
    }),
);

// NAME OK
const ok = buildBindingRequirement({
  project_space_key: 'ps_alpha',
  binding_kind: 'env_requirement',
  source_system: 'cos',
  sink_system: 'railway',
  secret_handling_mode: 'write_only',
  binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
});
assert.equal(ok.binding_name, 'SUPABASE_SERVICE_ROLE_KEY');

// 다른 kind 도 공백/과대 길이 차단
assert.throws(() =>
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'plain_readable',
    binding_name: 'acme / web',
  }),
);
assert.throws(() =>
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'plain_readable',
    binding_name: 'x'.repeat(200),
  }),
);

console.log('test-binding-requirements-no-secret-value: ok');
