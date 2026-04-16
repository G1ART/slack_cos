/**
 * W8-B human gate runtime — resumable continuation 컬럼 왕복 · detectGateCompletion 판정 회귀.
 * - 자동 재개 금지: closeGateAndResume 는 continuation payload 를 반환만 한다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const runtime = await import('../src/founder/humanGateRuntime.js');

const { upsertProjectSpace, __resetProjectSpaceBindingMemoryForTests } = store;
const { openResumableGate, closeGateAndResume, detectGateCompletion, formatUnresolvedHumanGatesCompactLines, listOpenHumanGates } = runtime;

__resetProjectSpaceBindingMemoryForTests();

await upsertProjectSpace({ project_space_key: 'ps_alpha', display_name: 'Alpha' });
const gate = await openResumableGate({
  project_space_key: 'ps_alpha',
  gate_kind: 'oauth_authorization',
  gate_reason: 'Supabase OAuth 승인 필요',
  opened_by_run_id: 'run_abc',
  continuation_packet_id: 'pkt_xyz',
  continuation_run_id: 'run_abc',
  continuation_thread_key: 'Tteam/Cchan/123.456',
  required_human_action: 'Supabase 콘솔에서 Auth provider 승인',
});
assert.equal(gate.continuation_packet_id, 'pkt_xyz');
assert.equal(gate.continuation_run_id, 'run_abc');
assert.equal(gate.continuation_thread_key, 'Tteam/Cchan/123.456');
assert.equal(gate.required_human_action, 'Supabase 콘솔에서 Auth provider 승인');
assert.equal(gate.gate_status, 'open');

// invalid gate_kind
await assert.rejects(() =>
  openResumableGate({ project_space_key: 'ps_alpha', gate_kind: 'bogus_kind' }),
);

// compact lines — required_human_action 자연어만, 토큰 없음
const openList = await listOpenHumanGates('ps_alpha');
const lines = formatUnresolvedHumanGatesCompactLines(openList);
assert.ok(lines.length === 1);
assert.ok(lines[0].startsWith('gate['));
assert.ok(lines[0].includes('oauth_authorization'));
assert.ok(lines[0].includes('Supabase 콘솔'));
assert.ok(lines[0].includes('cont_packet:pkt_xyz'));

// detectGateCompletion — no evidence → can_close=false
const det0 = detectGateCompletion(gate, null);
assert.equal(det0.can_close, false);
const det1 = detectGateCompletion(gate, { resolved: true });
assert.equal(det1.can_close, true);
assert.equal(det1.next_status, 'resolved');
const det2 = detectGateCompletion(gate, { abandoned: true });
assert.equal(det2.can_close, true);
assert.equal(det2.next_status, 'abandoned');

// closeGateAndResume → continuation payload 반환, 실제 재개는 호출자 책임
const closed = await closeGateAndResume({ id: gate.id, closed_by_run_id: 'run_done' });
assert.equal(closed.gate.gate_status, 'resolved');
assert.equal(closed.continuation.packet_id, 'pkt_xyz');
assert.equal(closed.continuation.run_id, 'run_abc');
assert.equal(closed.continuation.thread_key, 'Tteam/Cchan/123.456');
assert.equal(closed.continuation.required_human_action, 'Supabase 콘솔에서 Auth provider 승인');

// second close fails
await assert.rejects(() => closeGateAndResume({ id: gate.id }));

const openAfter = await listOpenHumanGates('ps_alpha');
assert.equal(openAfter.length, 0);
assert.deepEqual(formatUnresolvedHumanGatesCompactLines(openAfter), []);

console.log('test-human-gate-runtime-resumable: ok');
