/**
 * W11-C — resume (close → resolved) 를 거쳐도 tenancy 3축 + project_space_key 가 보존된다.
 * cross-tenant contamination 회귀.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const runtime = await import('../src/founder/humanGateRuntime.js');

const { upsertProjectSpace, __resetProjectSpaceBindingMemoryForTests, listOpenHumanGates } = store;
const { openResumableGate, closeGateAndResume, markGateResumed } = runtime;

__resetProjectSpaceBindingMemoryForTests();

await upsertProjectSpace({
  project_space_key: 'ps_tenantA',
  workspace_key: 'wsA',
  product_key: 'prodA',
  parcel_deployment_key: 'pdA',
});
await upsertProjectSpace({
  project_space_key: 'ps_tenantB',
  workspace_key: 'wsB',
  product_key: 'prodB',
  parcel_deployment_key: 'pdB',
});

const gateA = await openResumableGate({
  project_space_key: 'ps_tenantA',
  gate_kind: 'manual_secret_entry',
  workspace_key: 'wsA',
  product_key: 'prodA',
  parcel_deployment_key: 'pdA',
  continuation_run_id: 'runA',
  resume_target_kind: 'run',
  resume_target_ref: 'runA',
});
const gateB = await openResumableGate({
  project_space_key: 'ps_tenantB',
  gate_kind: 'manual_secret_entry',
  workspace_key: 'wsB',
  product_key: 'prodB',
  parcel_deployment_key: 'pdB',
  continuation_run_id: 'runB',
  resume_target_kind: 'run',
  resume_target_ref: 'runB',
});

assert.equal(gateA.workspace_key, 'wsA');
assert.equal(gateB.workspace_key, 'wsB');
assert.notEqual(gateA.project_space_key, gateB.project_space_key);

// close A with resume → tenancy 3축 + project_space_key 보존
const closedA = await closeGateAndResume({ id: gateA.id, resumed_by: 'opA' });
assert.equal(closedA.gate.project_space_key, 'ps_tenantA');
assert.equal(closedA.gate.workspace_key, 'wsA');
assert.equal(closedA.gate.product_key, 'prodA');
assert.equal(closedA.gate.parcel_deployment_key, 'pdA');
assert.equal(closedA.gate.reopened_count, 1);

// A 닫힘 후에도 B 는 정확히 tenant B 의 open gate 로만 나와야 함
const openA = await listOpenHumanGates('ps_tenantA');
const openB = await listOpenHumanGates('ps_tenantB');
assert.equal(openA.length, 0, 'tenant A has no open gates after close');
assert.equal(openB.length, 1, 'tenant B still has its gate');
assert.equal(openB[0].project_space_key, 'ps_tenantB');
assert.equal(openB[0].workspace_key, 'wsB');

// markGateResumed on B: 여전히 tenant B 컨텍스트 유지
const marked = await markGateResumed({ id: gateB.id, resumed_by: 'opB' });
assert.equal(marked.project_space_key, 'ps_tenantB');
assert.equal(marked.workspace_key, 'wsB');
assert.equal(marked.reopened_count, 1);

console.log('test-human-gate-tenancy-preserved-across-resume: ok');
