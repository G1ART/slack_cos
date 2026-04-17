/**
 * W12-C — contract 와 render 결과에 raw secret/token/URL 이 섞이지 않는다.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildHumanGateEscalationContract, renderHumanGateEscalationFounderLines } = await import(
  '../src/founder/humanGateEscalationContract.js'
);

const poisoned = {
  id: 'g-poison',
  gate_kind: 'manual_secret_entry',
  gate_action:
    'GitHub 저장소 Settings 에서 ghp_ABCDEFGHIJKLMNOPQRSTUVWX 를 넣고 https://secret.example.com/token 확인',
  required_human_action: 'Authorization: Bearer sk-abcdefghijklmnopqrstuvwxyz123456 사용',
  sink_system: 'github',
  continuation_packet_id: 'pkt-poison',
};

const contract = buildHumanGateEscalationContract({ gate_row: poisoned });
const lines = renderHumanGateEscalationFounderLines([contract]);
const allText = [contract.reason_why, contract.where_to_act, contract.exact_action, ...(contract.what_resumes ? [contract.what_resumes] : []), ...lines].join('\n');

for (const pat of [
  /ghp_[A-Za-z0-9]{20,}/,
  /sk-[A-Za-z0-9_\-]{20,}/,
  /eyJ[A-Za-z0-9._\-]{10,}/,
  /https?:\/\/secret\.example\.com/,
]) {
  assert.equal(pat.test(allText), false, `no ${pat}`);
}

console.log('test-human-gate-escalation-no-raw-token-leak: ok');
