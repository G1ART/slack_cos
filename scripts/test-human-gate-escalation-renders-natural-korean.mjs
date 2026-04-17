/**
 * W12-C — renderHumanGateEscalationFounderLines 가 jargon/금지어 없이 자연스러운 한국어 줄 반환.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { buildHumanGateEscalationContract, renderHumanGateEscalationFounderLines } = await import(
  '../src/founder/humanGateEscalationContract.js'
);

const gates = [
  {
    id: 'g1',
    gate_kind: 'manual_secret_entry',
    gate_action: 'GitHub Actions secrets 에 OPENAI_API_KEY 등록',
    required_human_action: 'GitHub Actions secrets 화면에서 OPENAI_API_KEY 를 직접 추가',
    sink_system: 'github',
    continuation_packet_id: 'pkt-1',
  },
  {
    id: 'g2',
    gate_kind: 'oauth_authorization',
    gate_action: 'Vercel 계정 권한 승인',
    required_human_action: 'Vercel 대시보드에서 프로젝트 접근 권한을 승인',
    sink_system: 'vercel',
    continuation_run_id: 'run-2',
  },
];

const contracts = gates.map((g) =>
  buildHumanGateEscalationContract({
    gate_row: g,
    failure_classification: { resolution_class: 'manual_entry_required' },
  }),
);

const lines = renderHumanGateEscalationFounderLines(contracts, { max: 3 });
assert.ok(lines.length > 0, 'non-empty lines');
assert.ok(lines.length <= 3, 'at most 3 lines');

const joined = lines.join('\n');
for (const jargon of [
  'hil_required',
  'tool_adapter_unavailable',
  'technical_capability_missing',
  'workcell:',
  'persona:',
  'binding_propagation_stop',
  'external_auth_gate',
]) {
  assert.equal(joined.includes(jargon), false, `no jargon "${jargon}"`);
}

// founder-facing: at least one Korean character present
assert.ok(/[가-힣]/.test(joined), 'Korean content present');

console.log('test-human-gate-escalation-renders-natural-korean: ok');
