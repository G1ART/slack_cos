/**
 * W12-B — write_only binding 과 read_back binding 이 source_read_mode 로 구분됨.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildSecretSourceGraph } = await import('../src/founder/secretSourceGraph.js');

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_b',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'GHPAT_NAME',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_b',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'github',
    secret_handling_mode: 'plain_readable',
    binding_name: 'PUBLIC_CFG',
  }),
];

const existing = [
  {
    binding_kind: 'env_requirement',
    binding_ref: 'GHPAT_NAME',
    secret_handling_mode: 'write_only',
  },
  {
    binding_kind: 'env_requirement',
    binding_ref: 'PUBLIC_CFG',
    secret_handling_mode: 'plain_readable',
  },
];

const graph = buildSecretSourceGraph({
  project_space_key: 'ps_b',
  requirements: reqs,
  existingBindings: existing,
});

const writeOnly = graph.values.find((v) => v.value_name === 'GHPAT_NAME');
const readBack = graph.values.find((v) => v.value_name === 'PUBLIC_CFG');

assert.ok(writeOnly, 'write_only node present');
assert.ok(readBack, 'read_back node present');
assert.equal(writeOnly.source_read_mode, 'write_only');
assert.equal(readBack.source_read_mode, 'read_back');

console.log('test-secret-source-graph-write-only-vs-readback-distinguished: ok');
