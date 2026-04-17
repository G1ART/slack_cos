/**
 * W11-F — propagationRunAuditLines pure builder.
 *  - project_space_key 스코프, 다른 space 의 run 은 필터된다.
 *  - 결과 라인에 attempted/completed/blocked/modes/resumable 가 올바르게 집계된다.
 *  - resumable=yes 는 failed 상태 + (blocked step 또는 hil/adapter resolution) 일 때만.
 *  - 시크릿/URL/토큰은 재다션된다.
 */
import assert from 'node:assert/strict';

const { buildPropagationRunAuditLines } = await import(
  '../src/founder/propagationRunAuditLines.js'
);

// 빈 입력
const empty = buildPropagationRunAuditLines({ project_space_key: 'p_a', recent_propagation_runs: [] });
assert.equal(empty.run_count, 0);
assert.deepEqual(empty.propagation_run_audit_lines, []);

const runs = [
  {
    run: {
      id: 'run-0001',
      project_space_key: 'p_a',
      status: 'succeeded',
      failure_resolution_class: null,
    },
    steps: [
      { step_status: 'completed', verification_kind: 'read_back' },
      { step_status: 'completed', verification_kind: 'smoke' },
      { step_status: 'completed', verification_kind: 'none' },
    ],
  },
  {
    run: {
      id: 'run-0002',
      project_space_key: 'p_a',
      status: 'failed',
      failure_resolution_class: 'hil_required_external_auth',
    },
    steps: [
      { step_status: 'completed', verification_kind: 'smoke' },
      { step_status: 'blocked', verification_kind: 'none' },
    ],
  },
  {
    run: {
      id: 'run-OTHER',
      project_space_key: 'p_other',
      status: 'failed',
    },
    steps: [{ step_status: 'blocked', verification_kind: 'none' }],
  },
];

const r = buildPropagationRunAuditLines({ project_space_key: 'p_a', recent_propagation_runs: runs });
assert.equal(r.run_count, 2, 'other-space run filtered out');
assert.equal(r.failed_run_count, 1);

const lines = r.propagation_run_audit_lines;
assert.equal(lines.length, 2);

const l0 = lines[0];
assert.ok(/status=succeeded/.test(l0));
assert.ok(/attempted=3/.test(l0));
assert.ok(/completed=3/.test(l0));
assert.ok(/blocked=0/.test(l0));
assert.ok(/modes=read_back,smoke/.test(l0));
assert.ok(/resumable=no/.test(l0));

const l1 = lines[1];
assert.ok(/status=failed/.test(l1));
assert.ok(/attempted=2/.test(l1));
assert.ok(/completed=1/.test(l1));
assert.ok(/blocked=1/.test(l1));
assert.ok(/resumable=yes/.test(l1), `hil_* resolution → resumable=yes, got: ${l1}`);

// cross-space leak 금지
const joined = lines.join('\n');
assert.ok(!/run-OTHER/.test(joined));
assert.ok(!/p_other/.test(joined));

// 시크릿 재다션
const leaky = buildPropagationRunAuditLines({
  project_space_key: 'p_a',
  recent_propagation_runs: [
    {
      run: {
        id: 'run-leak',
        project_space_key: 'p_a',
        status: 'ghp_supersecrettokenplaceholder1234567890', // 잘못 주입되어도 재다션
      },
      steps: [
        { step_status: 'completed', verification_kind: 'https://evil.example.com/tok' },
      ],
    },
  ],
});
const leakyJoined = leaky.propagation_run_audit_lines.join('\n');
assert.ok(!/ghp_[A-Za-z0-9]{8,}/.test(leakyJoined));
assert.ok(!/https?:\/\//.test(leakyJoined));

console.log('test-propagation-run-audit-lines-pure: ok');
