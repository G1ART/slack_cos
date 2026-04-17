/**
 * W11-C — closeGateAndResume 시 reopened_count += 1, last_resumed_at/by 기록.
 * markGateResumed 보조 훅도 카운터를 증가시킨다. abandoned 는 카운터를 올리지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const runtime = await import('../src/founder/humanGateRuntime.js');

const { upsertProjectSpace, __resetProjectSpaceBindingMemoryForTests } = store;
const { openResumableGate, closeGateAndResume, markGateResumed, listOpenHumanGates } = runtime;

__resetProjectSpaceBindingMemoryForTests();
await upsertProjectSpace({ project_space_key: 'ps_w11c_cnt', display_name: 'cnt' });

// gate 1: close resolved → reopened_count=1, last_resumed_at/by 세팅
const g1 = await openResumableGate({
  project_space_key: 'ps_w11c_cnt',
  gate_kind: 'manual_secret_entry',
  required_human_action: '값 입력',
  resume_target_kind: 'run',
  resume_target_ref: 'run_abc',
});
assert.equal(g1.reopened_count, 0);
assert.equal(g1.last_resumed_at, null);

const closed1 = await closeGateAndResume({
  id: g1.id,
  closed_by_run_id: 'run_closer',
  resumed_by: 'operator:alice',
});
assert.equal(closed1.gate.gate_status, 'resolved');
assert.equal(closed1.gate.reopened_count, 1);
assert.ok(closed1.gate.last_resumed_at, 'last_resumed_at set');
assert.equal(closed1.gate.last_resumed_by, 'operator:alice');
assert.equal(closed1.continuation.resume_target_kind, 'run');
assert.equal(closed1.continuation.resume_target_ref, 'run_abc');

// gate 2: markGateResumed 보조 훅 2회 → reopened_count=2, last_resumed_at 갱신
const g2 = await openResumableGate({
  project_space_key: 'ps_w11c_cnt',
  gate_kind: 'oauth_authorization',
});
const m1 = await markGateResumed({ id: g2.id, resumed_by: 'op1' });
assert.equal(m1.reopened_count, 1);
const m2 = await markGateResumed({ id: g2.id, resumed_by: 'op2' });
assert.equal(m2.reopened_count, 2);
assert.equal(m2.last_resumed_by, 'op2');

// gate 3: abandoned 는 reopened_count 증가 X
const g3 = await openResumableGate({
  project_space_key: 'ps_w11c_cnt',
  gate_kind: 'billing_or_subscription',
});
const closed3 = await closeGateAndResume({
  id: g3.id,
  gate_status: 'abandoned',
  closed_by_run_id: 'run_x',
});
assert.equal(closed3.gate.gate_status, 'abandoned');
assert.equal(closed3.gate.reopened_count, 0);
assert.equal(closed3.gate.last_resumed_at ?? null, null);

const still = await listOpenHumanGates('ps_w11c_cnt');
// g2 는 여전히 open (markGateResumed 는 상태 변경 없음)
assert.equal(still.length, 1);
assert.equal(still[0].id, g2.id);
assert.equal(still[0].reopened_count, 2);

console.log('test-human-gate-reopened-count-and-timestamps: ok');
