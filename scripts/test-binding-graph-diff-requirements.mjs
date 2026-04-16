/**
 * W8-A binding graph runtime — requirements vs existing bindings diff 회귀.
 * - buildBindingGraph 가 store 결과를 모으고 missing/satisfied/stale 을 분리한다.
 * - compact lines 가 8줄 cap 과 값 원시 미노출을 만족한다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const reqs = await import('../src/founder/bindingRequirements.js');
const graph = await import('../src/founder/projectSpaceBindingGraph.js');

const { upsertProjectSpace, recordBinding, openHumanGate, __resetProjectSpaceBindingMemoryForTests } = store;
const { buildBindingRequirement, diffRequirementsVsBindings } = reqs;
const { buildBindingGraph, formatBindingGraphCompactLines } = graph;

__resetProjectSpaceBindingMemoryForTests();

await upsertProjectSpace({ project_space_key: 'ps_alpha', display_name: 'Alpha' });
await recordBinding({ project_space_key: 'ps_alpha', binding_kind: 'repo_binding', binding_ref: 'acme/alpha-web' });
await recordBinding({ project_space_key: 'ps_alpha', binding_kind: 'deploy_binding', binding_ref: 'railway:alpha-web' });
await openHumanGate({ project_space_key: 'ps_alpha', gate_kind: 'oauth_authorization' });

const requirements = [
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'repo_binding',
    source_system: 'github',
    sink_system: 'cos',
    secret_handling_mode: 'plain_readable',
    binding_name: 'acme/alpha-web',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'deploy_binding',
    source_system: 'railway',
    sink_system: 'railway',
    secret_handling_mode: 'write_only',
    binding_name: 'alpha-web-worker', // stale: binding_ref 에 없음
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'db_binding',
    source_system: 'supabase',
    sink_system: 'cos',
    secret_handling_mode: 'smoke_only',
  }),
  buildBindingRequirement({
    project_space_key: 'ps_alpha',
    binding_kind: 'env_requirement',
    source_system: 'cos',
    sink_system: 'railway',
    secret_handling_mode: 'write_only',
    binding_name: 'SUPABASE_SERVICE_ROLE_KEY',
  }),
];

const existing = [
  { binding_kind: 'repo_binding', binding_ref: 'acme/alpha-web' },
  { binding_kind: 'deploy_binding', binding_ref: 'railway:alpha-web' },
];
const diff = diffRequirementsVsBindings(requirements, existing);
assert.equal(diff.satisfied.length, 1, 'repo is satisfied');
assert.equal(diff.stale.length, 1, 'deploy is stale (name mismatch)');
assert.equal(diff.missing.length, 2, 'db + env requirements missing');

const g = await buildBindingGraph('ps_alpha', { requirements });
assert.equal(g.project_space_key, 'ps_alpha');
assert.ok(g.project_space && g.project_space.project_space_key === 'ps_alpha');
assert.equal(g.bindings.length, 2);
assert.equal(g.open_human_gates.length, 1);
assert.equal(g.satisfied_requirements.length, 1);
assert.equal(g.stale_requirements.length, 1);
assert.equal(g.unfulfilled_requirements.length, 3, 'missing + stale');
assert.ok(g.computed_at);

const lines = formatBindingGraphCompactLines(g);
assert.ok(Array.isArray(lines));
assert.ok(lines.length <= 8);
assert.ok(lines.some((l) => l.startsWith('project_space:ps_alpha')));
assert.ok(lines.some((l) => l.startsWith('bindings_count:2')));
assert.ok(lines.some((l) => l.startsWith('open_human_gates:1')));
assert.ok(lines.some((l) => l.startsWith('unfulfilled_requirements:3')));
for (const l of lines) {
  assert.ok(!/service_role/i.test(l), 'no secret value leaks in lines');
  assert.ok(!/eyJ[A-Za-z0-9]/.test(l), 'no jwt-ish leak');
}

console.log('test-binding-graph-diff-requirements: ok');
