/**
 * W11-F — humanGateResumeAuditLines pure builder.
 *  - project_space_key 로 스코프되고 다른 space 의 gate 는 필터된다.
 *  - reopened_count / resume_target_kind+ref / continuation_key 가 정확히 반영된다.
 *  - 시크릿/URL/토큰은 재다션된다.
 *  - 빈 입력은 빈 결과를 안전하게 반환한다.
 */
import assert from 'node:assert/strict';

const { buildHumanGateResumeAuditLines } = await import(
  '../src/founder/humanGateResumeAuditLines.js'
);

// 빈 입력
const empty = buildHumanGateResumeAuditLines({ project_space_key: 'p_a', human_gates: [] });
assert.equal(empty.gate_count, 0);
assert.equal(empty.reopened_gate_count, 0);
assert.deepEqual(empty.human_gate_resume_audit_lines, []);

// 다른 project space 의 gate 는 필터
const gates = [
  {
    id: 'aaaaaaaa-1111-4111-8111-111111111111',
    project_space_key: 'p_a',
    gate_kind: 'manual_secret_entry',
    gate_status: 'open',
    required_human_action: '토큰 재발급',
    reopened_count: 2,
    resume_target_kind: 'packet',
    resume_target_ref: 'packet_rotate_gh_pat',
    continuation_packet_id: 'packet_P1',
    continuation_run_id: 'run_R1',
    continuation_thread_key: 'thread_T1',
  },
  {
    id: 'bbbbbbbb-2222-4222-8222-222222222222',
    project_space_key: 'p_other', // 다른 space — 반드시 스코프 밖
    gate_kind: 'oauth_authorization',
    required_human_action: 'should not appear',
    reopened_count: 5,
    resume_target_kind: 'packet',
    resume_target_ref: 'cross-space-leak',
  },
  {
    id: 'cccccccc-3333-4333-8333-333333333333',
    project_space_key: 'p_a',
    gate_kind: 'policy_or_product_decision',
    reopened_count: 0,
    resume_target_kind: null,
    resume_target_ref: null,
  },
];

const r = buildHumanGateResumeAuditLines({ project_space_key: 'p_a', human_gates: gates });
assert.equal(r.gate_count, 2, 'other-space gate filtered out');
assert.equal(r.reopened_gate_count, 1, 'one gate has reopened>0');
const joined = r.human_gate_resume_audit_lines.join('\n');
assert.ok(/gate\[/.test(joined));
assert.ok(/kind=manual_secret_entry/.test(joined));
assert.ok(/reopened=2/.test(joined));
assert.ok(/resume=packet\/packet_rotate_gh_pat/.test(joined));
assert.ok(/cont=packet:packet_P1\|run:run_R1\|thread:thread_T1/.test(joined));
// cross-space leak 금지
assert.ok(!/cross-space-leak/.test(joined));
assert.ok(!/p_other/.test(joined));

// 시크릿 재다션: token-ish 값이 ref 에 잘못 섞여 들어왔을 때
const leaky = buildHumanGateResumeAuditLines({
  project_space_key: 'p_a',
  human_gates: [
    {
      id: 'dddddddd-4444-4444-8444-444444444444',
      project_space_key: 'p_a',
      gate_kind: 'manual_secret_entry',
      reopened_count: 0,
      resume_target_kind: 'packet',
      resume_target_ref: 'ghp_supersecrettokenplaceholder1234567890',
    },
    {
      id: 'eeeeeeee-5555-4555-8555-555555555555',
      project_space_key: 'p_a',
      gate_kind: 'oauth_authorization',
      reopened_count: 0,
      resume_target_kind: 'packet',
      resume_target_ref: 'https://example.com/secret-link',
    },
  ],
});
const leakyJoined = leaky.human_gate_resume_audit_lines.join('\n');
assert.ok(!/ghp_[A-Za-z0-9]{8,}/.test(leakyJoined), 'github token redacted');
assert.ok(!/https?:\/\//.test(leakyJoined), 'full URL redacted');

console.log('test-human-gate-resume-audit-lines-pure: ok');
