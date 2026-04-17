/**
 * W12-B — 같은 value_name 이 여러 sink 로 fan-out 될 때 aggregate policy 가 보수적으로 결정되고
 * graph 어디에도 raw secret/URL/token 이 들어가지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const {
  buildSecretSourceGraph,
  formatSecretSourceGraphCompactLines,
  detectSecretLeakInGraph,
} = await import('../src/founder/secretSourceGraph.js');

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_fan',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'API_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_fan',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'vercel',
    secret_handling_mode: 'write_only',
    binding_name: 'API_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_fan',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'supabase',
    secret_handling_mode: 'smoke_only',
    binding_name: 'API_KEY',
  }),
];

const graph = buildSecretSourceGraph({
  project_space_key: 'ps_fan',
  requirements: reqs,
  existingBindings: [],
});

assert.equal(graph.values.length, 1, 'aggregated to single node');
const node = graph.values[0];
assert.equal(node.sink_targets.length, 3);
// Supabase requires manual confirmation → aggregate must be human_gate_required or forbidden
assert.notEqual(node.write_policy, 'autowrite', 'supabase drags policy away from autowrite');
assert.equal(node.requires_human_gate, true);

// compact lines must not leak secrets
const lines = formatSecretSourceGraphCompactLines(graph);
for (const l of lines) {
  assert.equal(/ghp_|sk-|eyJ|https?:\/\//.test(l), false, `no secret-like token in compact line: ${l}`);
}

// structural guard passes (no secret patterns)
assert.equal(detectSecretLeakInGraph(graph), null);

console.log('test-secret-source-graph-mixed-sink-fanout-no-leak: ok');
