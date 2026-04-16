/**
 * W5-B projectSpaceBindingStore 메모리 roundtrip 회귀.
 * COS_RUN_STORE=memory 에서 upsert/record/list/open-close 가 일관되고 isolation 이 지켜지는지 검증.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');

const {
  PROJECT_SPACE_BINDING_KINDS,
  PROJECT_SPACE_GATE_KINDS,
  PROJECT_SPACE_GATE_STATUSES,
  getProjectSpace,
  upsertProjectSpace,
  recordBinding,
  listBindingsForSpace,
  openHumanGate,
  closeHumanGate,
  listOpenHumanGates,
  __resetProjectSpaceBindingMemoryForTests,
} = store;

// enum SSOT
assert.deepEqual(
  [...PROJECT_SPACE_BINDING_KINDS],
  ['repo_binding', 'default_branch', 'cursor_root', 'db_binding', 'deploy_binding', 'env_requirement'],
);
assert.deepEqual(
  [...PROJECT_SPACE_GATE_KINDS],
  ['oauth_authorization', 'billing_or_subscription', 'policy_or_product_decision', 'manual_secret_entry', 'high_risk_approval'],
);
assert.deepEqual([...PROJECT_SPACE_GATE_STATUSES], ['open', 'resolved', 'abandoned']);

// 1) upsert + get
__resetProjectSpaceBindingMemoryForTests();
await upsertProjectSpace({
  project_space_key: 'ps_alpha',
  display_name: 'Alpha Product',
  workspace_key: 'ws_demo',
  product_key: 'alpha',
  parcel_deployment_key: 'scenario_local',
});
const s = await getProjectSpace('ps_alpha');
assert.ok(s && s.project_space_key === 'ps_alpha');
assert.equal(s.display_name, 'Alpha Product');
assert.equal(s.parcel_deployment_key, 'scenario_local');
assert.ok(s.created_at && s.updated_at);

// upsert again should preserve created_at and update updated_at
const prevCreated = s.created_at;
await new Promise((r) => setTimeout(r, 5));
await upsertProjectSpace({ project_space_key: 'ps_alpha', display_name: 'Alpha v2' });
const s2 = await getProjectSpace('ps_alpha');
assert.equal(s2.created_at, prevCreated, 'created_at preserved across upsert');
assert.equal(s2.display_name, 'Alpha v2');

// 2) recordBinding — must reject unknown kind and refuse when project_space missing
await assert.rejects(() => recordBinding({ project_space_key: 'ps_alpha', binding_kind: 'bogus', binding_ref: 'x' }));
await assert.rejects(() => recordBinding({ project_space_key: 'ps_missing', binding_kind: 'repo_binding', binding_ref: 'org/repo' }));

const b1 = await recordBinding({
  project_space_key: 'ps_alpha',
  binding_kind: 'repo_binding',
  binding_ref: 'acme/alpha-web',
  evidence_run_id: 'run_1',
});
const b2 = await recordBinding({
  project_space_key: 'ps_alpha',
  binding_kind: 'deploy_binding',
  binding_ref: 'railway:alpha-web',
});
const b3 = await recordBinding({
  project_space_key: 'ps_alpha',
  binding_kind: 'env_requirement',
  binding_ref: 'SUPABASE_SERVICE_ROLE_KEY',
});
assert.ok(b1.id && b2.id && b3.id);
assert.notEqual(b1.id, b2.id);

const all = await listBindingsForSpace('ps_alpha');
assert.equal(all.length, 3);
const repos = await listBindingsForSpace('ps_alpha', { kind: 'repo_binding' });
assert.equal(repos.length, 1);
assert.equal(repos[0].binding_ref, 'acme/alpha-web');

// 3) isolation — second project space must not leak
await upsertProjectSpace({ project_space_key: 'ps_beta', display_name: 'Beta' });
await recordBinding({ project_space_key: 'ps_beta', binding_kind: 'repo_binding', binding_ref: 'acme/beta-web' });
const alphaAgain = await listBindingsForSpace('ps_alpha');
assert.equal(alphaAgain.length, 3, 'alpha unaffected by beta insert');
const beta = await listBindingsForSpace('ps_beta');
assert.equal(beta.length, 1);
assert.equal(beta[0].binding_ref, 'acme/beta-web');

// 4) human gate lifecycle
await assert.rejects(() => openHumanGate({ project_space_key: 'ps_alpha', gate_kind: 'nope' }));
const gate = await openHumanGate({
  project_space_key: 'ps_alpha',
  gate_kind: 'oauth_authorization',
  gate_reason: 'Supabase OAuth 미승인',
  gate_action: 'Supabase 콘솔에서 OAuth 승인을 완료해 주세요.',
  opened_by_run_id: 'run_1',
});
assert.equal(gate.gate_status, 'open');
assert.ok(gate.opened_at);
assert.equal(gate.closed_at, null);

const openList = await listOpenHumanGates('ps_alpha');
assert.equal(openList.length, 1);
assert.equal(openList[0].id, gate.id);

// closeHumanGate resolves
const closed = await closeHumanGate({ id: gate.id, gate_status: 'resolved', closed_by_run_id: 'run_2' });
assert.equal(closed.gate_status, 'resolved');
assert.ok(closed.closed_at);
assert.equal(closed.closed_by_run_id, 'run_2');

// second close fails
await assert.rejects(() => closeHumanGate({ id: gate.id, gate_status: 'resolved' }));

const openAfter = await listOpenHumanGates('ps_alpha');
assert.equal(openAfter.length, 0, 'no open gates after close');

// abandoned path
const gate2 = await openHumanGate({ project_space_key: 'ps_alpha', gate_kind: 'billing_or_subscription' });
const abandoned = await closeHumanGate({ id: gate2.id, gate_status: 'abandoned' });
assert.equal(abandoned.gate_status, 'abandoned');

// unknown status rejected
const gate3 = await openHumanGate({ project_space_key: 'ps_alpha', gate_kind: 'high_risk_approval' });
await assert.rejects(() => closeHumanGate({ id: gate3.id, gate_status: 'flubbed' }));

// gates are project-space scoped
const betaOpen = await listOpenHumanGates('ps_beta');
assert.equal(betaOpen.length, 0);

console.log('test-project-space-binding-store-memory-roundtrip: ok');
