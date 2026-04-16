/**
 * W5-B projectSpaceLane 회귀:
 *   1) precheck 가 unknown action / 누락된 project_space_key / env 값 유출 케이스에서 blocked 로
 *      failure_classification(W5-A) 을 붙여 반환.
 *   2) applyProjectSpaceAction 이 bind_repo/bind_deploy/bind_db/declare_env_requirement 를 store 에
 *      안전하게 기록하고, gate open/close 라이프사이클을 이어간다.
 *   3) declare_env_requirement 가 값(secret) 을 거부하고 NAME 만 허용한다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const lane = await import('../src/founder/toolPlane/lanes/projectSpaceLane.js');
const store = await import('../src/founder/projectSpaceBindingStore.js');

const {
  PROJECT_SPACE_ACTIONS,
  projectSpaceInvocationPrecheck,
  applyProjectSpaceAction,
  detectEnvValueLeak,
  listBindingsForSpace,
  listOpenHumanGates,
} = lane;

store.__resetProjectSpaceBindingMemoryForTests();

// 1) action enum
assert.deepEqual(
  [...PROJECT_SPACE_ACTIONS],
  ['bind_repo', 'bind_deploy', 'bind_db', 'declare_env_requirement', 'open_human_gate', 'close_human_gate'],
);

// 2) unknown action
{
  const r = projectSpaceInvocationPrecheck('whatever', { project_space_key: 'ps_a' });
  assert.equal(r.blocked, true);
  assert.ok(r.failure_classification);
  assert.equal(r.failure_classification.resolution_class, 'model_coordination_failure');
}

// 3) missing project_space_key → tenancy_or_binding_ambiguity
{
  const r = projectSpaceInvocationPrecheck('bind_repo', { binding_ref: 'acme/foo' });
  assert.equal(r.blocked, true);
  assert.equal(r.next_required_input, 'project_space_key');
  assert.equal(r.failure_classification.resolution_class, 'tenancy_or_binding_ambiguity');
  assert.equal(r.failure_classification.human_gate_required, true);
}

// 4) binding_ref missing
{
  const r = projectSpaceInvocationPrecheck('bind_repo', { project_space_key: 'ps_a' });
  assert.equal(r.blocked, true);
  assert.equal(r.next_required_input, 'binding_ref');
}

// 5) env value leak guard
assert.equal(detectEnvValueLeak('SUPABASE_URL'), null, 'pure env NAME is ok');
assert.ok(detectEnvValueLeak('SUPABASE_URL=https://xyz.supabase.co'));
assert.ok(detectEnvValueLeak('https://xyz.supabase.co'));
assert.ok(detectEnvValueLeak('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.sig'));
assert.ok(detectEnvValueLeak('AKIA1234567890ABCDEF1234567890ABCDEF1234'));
assert.ok(detectEnvValueLeak('lower_case_name'));
assert.ok(detectEnvValueLeak('NAME with spaces'));

// 6) declare_env_requirement rejects concrete value
{
  const r = projectSpaceInvocationPrecheck('declare_env_requirement', {
    project_space_key: 'ps_a',
    binding_ref: 'SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payload.signature',
  });
  assert.equal(r.blocked, true);
  assert.ok(/NAME|값/i.test(r.blocked_reason));
  assert.ok(r.failure_classification.human_gate_action);
}

// 7) declare_env_requirement passes for NAME only
{
  const r = projectSpaceInvocationPrecheck('declare_env_requirement', {
    project_space_key: 'ps_a',
    binding_ref: 'SUPABASE_SERVICE_ROLE_KEY',
  });
  assert.equal(r.blocked, false);
  assert.equal(r.failure_classification, null);
}

// 8) apply — end-to-end roundtrip
{
  const r1 = await applyProjectSpaceAction(
    'bind_repo',
    { project_space_key: 'ps_alpha', binding_ref: 'acme/alpha-web' },
    { display_name: 'Alpha', parcel_deployment_key: 'scenario_local' },
  );
  assert.equal(r1.ok, true);
  assert.equal(r1.binding.binding_kind, 'repo_binding');
  assert.equal(r1.binding.binding_ref, 'acme/alpha-web');
  assert.equal(r1.binding.parcel_deployment_key, 'scenario_local');

  const r2 = await applyProjectSpaceAction(
    'declare_env_requirement',
    { project_space_key: 'ps_alpha', binding_ref: 'SUPABASE_URL' },
    {},
  );
  assert.equal(r2.ok, true);
  assert.equal(r2.binding.binding_kind, 'env_requirement');
  assert.equal(r2.binding.binding_ref, 'SUPABASE_URL');

  // env value rejection also rejected at apply layer
  const r3 = await applyProjectSpaceAction(
    'declare_env_requirement',
    { project_space_key: 'ps_alpha', binding_ref: 'SUPABASE_URL=https://x.supabase.co' },
    {},
  );
  assert.equal(r3.ok, false);
  assert.equal(r3.blocked, true);

  const bindings = await listBindingsForSpace('ps_alpha');
  assert.equal(bindings.length, 2, 'rejected insert did not leak into store');
}

// 9) open / close human gate
{
  const g1 = await applyProjectSpaceAction(
    'open_human_gate',
    {
      project_space_key: 'ps_alpha',
      gate_kind: 'oauth_authorization',
      gate_reason: 'Supabase OAuth 미승인',
      gate_action: 'Supabase 콘솔에서 OAuth 승인을 완료해 주세요.',
    },
    { opened_by_run_id: 'run_1' },
  );
  assert.equal(g1.ok, true);
  assert.equal(g1.gate.gate_status, 'open');

  const open = await listOpenHumanGates('ps_alpha');
  assert.equal(open.length, 1);

  const close = await applyProjectSpaceAction(
    'close_human_gate',
    { id: g1.gate.id, gate_status: 'resolved' },
    { closed_by_run_id: 'run_2' },
  );
  assert.equal(close.ok, true);
  assert.equal(close.gate.gate_status, 'resolved');

  // invalid close
  const bad = await applyProjectSpaceAction('close_human_gate', { id: g1.gate.id, gate_status: 'nope' }, {});
  assert.equal(bad.ok, false);

  // unknown gate_kind
  const badOpen = projectSpaceInvocationPrecheck('open_human_gate', { project_space_key: 'ps_alpha', gate_kind: 'bogus' });
  assert.equal(badOpen.blocked, true);
  assert.equal(badOpen.next_required_input, 'gate_kind');
}

console.log('test-project-space-lane-precheck-and-env-guard: ok');
