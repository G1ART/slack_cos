/**
 * W8-B propagation plan — 어떠한 path 로도 값(secret) 원시 저장 금지.
 * - plan JSON 을 순회해서 값 모양(eyJ jwt / AKIA / KEY=VALUE) 이 없음을 확인.
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
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'vercel',
    secret_handling_mode: 'write_only',
    binding_name: 'OPENAI_API_KEY',
  }),
];

const plan = buildPropagationPlan({
  project_space_key: 'ps_alpha',
  requirements: reqs,
  existingBindings: [],
  sinkCapabilities: {
    railway: { supports_secret_write: true },
    vercel: { supports_secret_write: true, supports_read_back: true },
  },
});

const canonical = JSON.stringify(plan);
assert.ok(!/eyJ[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+\.[A-Za-z0-9_\-]+/.test(canonical), 'no jwt-ish secret');
assert.ok(!/\bAKIA[A-Z0-9]{12,}\b/.test(canonical), 'no aws access key');
assert.ok(!/[A-Z_]+=[A-Za-z0-9]/.test(canonical), 'no KEY=VALUE form');
assert.ok(!/sk-[A-Za-z0-9]{16,}/.test(canonical), 'no openai-like secret');
// binding_name 자체는 NAME 이므로 허용
assert.ok(/SUPABASE_SERVICE_ROLE_KEY/.test(canonical));
assert.ok(/OPENAI_API_KEY/.test(canonical));

console.log('test-propagation-plan-no-secret-value: ok');
