/**
 * W8-A bindingRequirements SSOT — enum·shape·필수 필드 회귀.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const {
  BINDING_REQUIREMENT_KINDS,
  SECRET_HANDLING_MODES,
  buildBindingRequirement,
} = await import('../src/founder/bindingRequirements.js');

// enum SSOT — W5-B binding_kind 재사용
assert.deepEqual(
  [...BINDING_REQUIREMENT_KINDS],
  ['repo_binding', 'default_branch', 'cursor_root', 'db_binding', 'deploy_binding', 'env_requirement'],
);
assert.deepEqual([...SECRET_HANDLING_MODES], ['plain_readable', 'write_only', 'smoke_only']);

// 필수 필드 — project_space_key / binding_kind / source_system / sink_system / secret_handling_mode
assert.throws(() =>
  buildBindingRequirement({
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'plain_readable',
  }),
);
assert.throws(() =>
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'bogus_kind',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'plain_readable',
  }),
);
assert.throws(() =>
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'neither',
  }),
);

const r = buildBindingRequirement({
  project_space_key: 'ps_alpha',
  binding_kind: 'repo_binding',
  source_system: 'github',
  sink_system: 'cos',
  secret_handling_mode: 'plain_readable',
  binding_name: 'acme/alpha-web',
  required_human_action: 'GitHub org 초대 수락',
});
assert.equal(r.project_space_key, 'ps_alpha');
assert.equal(r.binding_kind, 'repo_binding');
assert.equal(r.source_system, 'github');
assert.equal(r.sink_system, 'cos');
assert.equal(r.secret_handling_mode, 'plain_readable');
assert.equal(r.binding_name, 'acme/alpha-web');
assert.equal(r.required_human_action, 'GitHub org 초대 수락');

assert.ok(Object.isFrozen(r), 'requirement immutable');

// required_human_action 생략 허용
const r2 = buildBindingRequirement({
  project_space_key: 'ps_alpha',
  binding_kind: 'deploy_binding',
  source_system: 'railway',
  sink_system: 'railway',
  secret_handling_mode: 'write_only',
});
assert.equal(r2.required_human_action, null);
assert.equal(r2.binding_name, null);

console.log('test-binding-requirements-ssot-schema: ok');
