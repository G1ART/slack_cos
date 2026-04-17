/**
 * W12-B — buildSecretSourceGraph 가 메타데이터만 돌려주고 값(secret) 은 절대 포함하지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildSecretSourceGraph, GRAPH_VERSION, detectSecretLeakInGraph } = await import(
  '../src/founder/secretSourceGraph.js'
);

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_a',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'OPENAI_API_KEY',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_a',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'vercel',
    secret_handling_mode: 'write_only',
    binding_name: 'OPENAI_API_KEY',
  }),
];

const graph = buildSecretSourceGraph({
  project_space_key: 'ps_a',
  requirements: reqs,
  existingBindings: [],
});

assert.equal(graph.graph_version, GRAPH_VERSION);
assert.equal(graph.project_space_key, 'ps_a');
assert.equal(graph.values.length, 1, 'same binding_name aggregated');
const node = graph.values[0];
assert.equal(node.value_name, 'OPENAI_API_KEY');
assert.equal(node.source_kind, 'operator_manual');
assert.equal(node.sink_targets.length, 2, 'two sinks');
for (const s of node.sink_targets) {
  assert.ok(['github', 'vercel'].includes(s.sink_system));
  assert.ok(['autowrite', 'human_gate_required', 'forbidden'].includes(s.write_policy));
  assert.ok(['read_back', 'smoke', 'existence_only', 'none'].includes(s.verification_policy));
  assert.equal(typeof s.manual_gate_required, 'boolean');
}
assert.equal(node.redaction_policy, 'never_persist_value');

// 값 저장 금지 — graph 텍스트에 raw value/token/URL 없음
assert.equal(detectSecretLeakInGraph(graph), null, 'no secret-like pattern in graph');

console.log('test-secret-source-graph-derivation-metadata-only: ok');
