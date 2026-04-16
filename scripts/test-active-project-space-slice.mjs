/**
 * W5-B: active_project_space slice 회귀.
 *   1) pure builder — bindings/gates 주입 시 compact lines 와 카운트가 맞는다.
 *   2) store loader — 2 개 프로젝트 공간 간 isolation (no cross-contamination).
 *   3) gate 전이 — open → resolved 시 slice 의 open_human_gate_count 가 0 으로 수렴.
 *   4) resolution_class 같은 내부 taxonomy 토큰이 슬라이스에 유출되지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const slice = await import('../src/founder/activeProjectSpaceSlice.js');
const lane = await import('../src/founder/toolPlane/lanes/projectSpaceLane.js');
const store = await import('../src/founder/projectSpaceBindingStore.js');
const taxonomy = await import('../src/founder/failureTaxonomy.js');

const {
  buildActiveProjectSpaceSlice,
  formatBindingsCompactLines,
  formatOpenHumanGatesCompactLines,
  loadActiveProjectSpaceSlice,
} = slice;

store.__resetProjectSpaceBindingMemoryForTests();

// 1) pure builder
{
  const s = buildActiveProjectSpaceSlice({
    project_space_key: 'ps_alpha',
    display_name: 'Alpha',
    bindings: [
      { binding_kind: 'repo_binding', binding_ref: 'acme/alpha-web', evidence_run_id: 'run_1' },
      { binding_kind: 'db_binding', binding_ref: 'supabase:alpha' },
    ],
    open_human_gates: [
      { gate_kind: 'oauth_authorization', gate_reason: 'Supabase OAuth 미승인', gate_action: '콘솔에서 승인하세요.' },
    ],
  });
  assert.equal(s.project_space_key, 'ps_alpha');
  assert.equal(s.display_name, 'Alpha');
  assert.equal(s.binding_count, 2);
  assert.equal(s.open_human_gate_count, 1);
  assert.equal(s.bindings_compact_lines.length, 2);
  assert.ok(s.bindings_compact_lines[0].includes('repo_binding'));
  assert.ok(s.bindings_compact_lines[0].includes('run:run_1'));
  assert.equal(s.open_human_gates_compact_lines.length, 1);
  assert.ok(s.open_human_gates_compact_lines[0].includes('oauth_authorization'));
}

// 2) empty input
{
  const s = buildActiveProjectSpaceSlice({ project_space_key: null });
  assert.equal(s.project_space_key, null);
  assert.equal(s.binding_count, 0);
  assert.deepEqual(s.bindings_compact_lines, []);
}

// 3) store isolation
{
  await lane.applyProjectSpaceAction(
    'bind_repo',
    { project_space_key: 'ps_isolate_a', binding_ref: 'acme/a' },
    { display_name: 'A' },
  );
  await lane.applyProjectSpaceAction(
    'bind_repo',
    { project_space_key: 'ps_isolate_b', binding_ref: 'acme/b' },
    { display_name: 'B' },
  );
  const sa = await loadActiveProjectSpaceSlice('ps_isolate_a');
  const sb = await loadActiveProjectSpaceSlice('ps_isolate_b');
  assert.ok(sa && sb);
  assert.equal(sa.binding_count, 1);
  assert.equal(sb.binding_count, 1);
  assert.ok(sa.bindings_compact_lines[0].includes('acme/a'));
  assert.ok(sb.bindings_compact_lines[0].includes('acme/b'));
  // cross-contamination check
  assert.ok(!sa.bindings_compact_lines[0].includes('acme/b'));
  assert.ok(!sb.bindings_compact_lines[0].includes('acme/a'));
}

// 4) gate lifecycle transitions
{
  store.__resetProjectSpaceBindingMemoryForTests();
  const opened = await lane.applyProjectSpaceAction(
    'open_human_gate',
    {
      project_space_key: 'ps_gate',
      gate_kind: 'oauth_authorization',
      gate_reason: 'OAuth 미승인',
      gate_action: 'Supabase OAuth 를 승인해 주세요.',
    },
    { display_name: 'GateProj' },
  );
  assert.equal(opened.ok, true);

  const s1 = await loadActiveProjectSpaceSlice('ps_gate');
  assert.ok(s1);
  assert.equal(s1.open_human_gate_count, 1);
  assert.ok(s1.open_human_gates_compact_lines[0].includes('oauth_authorization'));

  const closed = await lane.applyProjectSpaceAction(
    'close_human_gate',
    { id: opened.gate.id, gate_status: 'resolved' },
    {},
  );
  assert.equal(closed.ok, true);

  const s2 = await loadActiveProjectSpaceSlice('ps_gate');
  assert.ok(s2);
  assert.equal(s2.open_human_gate_count, 0);
  assert.deepEqual(s2.open_human_gates_compact_lines, []);
}

// 5) no resolution_class / failure_classification leakage
{
  const s = buildActiveProjectSpaceSlice({
    project_space_key: 'ps_x',
    bindings: [{ binding_kind: 'repo_binding', binding_ref: 'acme/x' }],
    open_human_gates: [{ gate_kind: 'policy_or_product_decision', gate_reason: 'policy?' }],
  });
  const payload = JSON.stringify(s);
  for (const token of taxonomy.FAILURE_RESOLUTION_CLASSES) {
    assert.ok(!payload.includes(token), `slice must not leak ${token}`);
  }
  assert.ok(!payload.includes('failure_classification'));
  assert.ok(!payload.includes('resolution_class'));
}

// 6) compact formatter truncation
{
  const many = Array.from({ length: 20 }, (_, i) => ({ binding_kind: 'env_requirement', binding_ref: `VAR_${i}` }));
  const lines = formatBindingsCompactLines(many);
  assert.ok(lines.length <= 13);
  assert.ok(lines[lines.length - 1].includes('more bindings'));

  const gates = Array.from({ length: 10 }, (_, i) => ({ gate_kind: 'billing_or_subscription', gate_reason: `r${i}` }));
  const glines = formatOpenHumanGatesCompactLines(gates);
  assert.ok(glines.length <= 9);
  assert.ok(glines[glines.length - 1].includes('more gates'));
}

console.log('test-active-project-space-slice: ok');
