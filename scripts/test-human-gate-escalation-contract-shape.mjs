/**
 * W12-C — buildHumanGateEscalationContract 의 shape 회귀.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildHumanGateEscalationContract } = await import(
  '../src/founder/humanGateEscalationContract.js'
);

const gate = {
  id: 'gate-1',
  gate_kind: 'manual_secret_entry',
  gate_reason: 'OpenAI API key needed',
  gate_action: 'OPENAI_API_KEY 값을 GitHub Actions secrets 에 등록',
  required_human_action: 'GitHub 저장소의 Settings → Secrets 에서 OPENAI_API_KEY 를 직접 입력',
  continuation_packet_id: 'pkt-9',
  continuation_run_id: null,
  continuation_thread_key: null,
  sink_system: 'github',
};

const contract = buildHumanGateEscalationContract({
  gate_row: gate,
  failure_classification: { resolution_class: 'manual_entry_required' },
});

assert.equal(contract.gate_id, 'gate-1');
assert.equal(contract.gate_kind, 'manual_secret_entry');
assert.ok(typeof contract.reason_why === 'string' && contract.reason_why.length > 0);
assert.ok(typeof contract.where_to_act === 'string' && contract.where_to_act.length > 0);
assert.ok(typeof contract.exact_action === 'string' && contract.exact_action.length > 0);
assert.equal(contract.resumable, true);
assert.ok(contract.what_resumes && contract.what_resumes.length > 0, 'what_resumes populated');

// technical tokens must not leak
for (const tok of ['hil_required', 'tool_adapter_unavailable', 'technical_capability_missing']) {
  assert.equal(
    String(contract.reason_why + contract.where_to_act + contract.exact_action).includes(tok),
    false,
    `no leaked token: ${tok}`,
  );
}

console.log('test-human-gate-escalation-contract-shape: ok');
