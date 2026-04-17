/**
 * W12-B — 두 project_space 가 같은 value_name 을 써도 graph/snapshot 이 교차 유출되지 않음.
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

async function runSpace(key) {
  const reqs = [
    buildBindingRequirement({
      project_space_key: key,
      binding_kind: 'env_requirement',
      source_system: 'operator',
      sink_system: 'github',
      secret_handling_mode: 'write_only',
      binding_name: 'SHARED_NAME',
    }),
  ];
  const plan = buildPropagationPlan({
    project_space_key: key,
    requirements: reqs,
    existingBindings: [{ binding_kind: 'env_requirement', binding_ref: 'SHARED_NAME' }],
  });
  const res = await executePropagationPlan({ plan, writers: {}, dry_run: true });
  return res;
}

const a = await runSpace('ps_alpha');
const b = await runSpace('ps_beta');

const snapA = getPropagationRunSnapshotFromMemory(a.propagation_run_id);
const snapB = getPropagationRunSnapshotFromMemory(b.propagation_run_id);

assert.equal(snapA.project_space_key, 'ps_alpha');
assert.equal(snapB.project_space_key, 'ps_beta');
assert.notEqual(snapA, snapB, 'different snapshot refs');

// A 의 snapshot 이 B 의 project_space_key 를 참조하면 안 됨
assert.equal(
  JSON.stringify(snapA).includes('ps_beta'),
  false,
  'A snapshot must not mention ps_beta',
);
assert.equal(
  JSON.stringify(snapB).includes('ps_alpha'),
  false,
  'B snapshot must not mention ps_alpha',
);

console.log('test-secret-source-graph-project-space-isolation: ok');
