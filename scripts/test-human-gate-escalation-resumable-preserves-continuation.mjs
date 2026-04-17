/**
 * W12-C — resumable 인 gate 는 contract.resumable=true 이고 what_resumes 가 채워진다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildHumanGateEscalationContract } = await import(
  '../src/founder/humanGateEscalationContract.js'
);

const packetGate = buildHumanGateEscalationContract({
  gate_row: {
    id: 'g1',
    gate_kind: 'manual_secret_entry',
    continuation_packet_id: 'pkt-9',
  },
});
assert.equal(packetGate.resumable, true);
assert.ok(packetGate.what_resumes && /패킷|단계/.test(packetGate.what_resumes));

const runGate = buildHumanGateEscalationContract({
  gate_row: {
    id: 'g2',
    gate_kind: 'manual_secret_entry',
    continuation_run_id: 'run-7',
  },
});
assert.equal(runGate.resumable, true);
assert.ok(runGate.what_resumes && /실행|단계/.test(runGate.what_resumes));

const nope = buildHumanGateEscalationContract({
  gate_row: {
    id: 'g3',
    gate_kind: 'manual_secret_entry',
  },
});
assert.equal(nope.resumable, false);
assert.equal(nope.what_resumes, null);

console.log('test-human-gate-escalation-resumable-preserves-continuation: ok');
