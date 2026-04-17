/**
 * W12-B — executePropagationPlan 이 secret_source_graph_snapshot 을 result 와 in-memory run 에 기록.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildBindingRequirement } = await import('../src/founder/bindingRequirements.js');
const { buildPropagationPlan } = await import('../src/founder/envSecretPropagationPlan.js');
const {
  executePropagationPlan,
  getPropagationRunSnapshotFromMemory,
  __resetPropagationEngineMemoryForTests,
} = await import('../src/founder/envSecretPropagationEngine.js');

__resetPropagationEngineMemoryForTests();

const reqs = [
  buildBindingRequirement({
    project_space_key: 'ps_snap',
    binding_kind: 'env_requirement',
    source_system: 'operator',
    sink_system: 'github',
    secret_handling_mode: 'write_only',
    binding_name: 'SOME_API_KEY',
  }),
];

const plan = buildPropagationPlan({
  project_space_key: 'ps_snap',
  requirements: reqs,
  existingBindings: [{ binding_kind: 'env_requirement', binding_ref: 'SOME_API_KEY' }],
});

assert.ok(plan.secret_source_graph, 'plan has secret_source_graph');

const result = await executePropagationPlan({
  plan,
  writers: {},
  dry_run: true,
});

assert.ok(result.secret_source_graph_snapshot, 'result has secret_source_graph_snapshot');
const snapFromMem = getPropagationRunSnapshotFromMemory(result.propagation_run_id);
assert.ok(snapFromMem, 'snapshot persisted in memory run');
assert.equal(snapFromMem.project_space_key, 'ps_snap');
assert.equal(snapFromMem.values.length, 1);
assert.equal(snapFromMem.values[0].value_name, 'SOME_API_KEY');

console.log('test-secret-source-graph-snapshot-persisted-per-run: ok');
