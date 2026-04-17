/**
 * W11-F — founderCosToolHandlers 가 read_execution_context 응답에
 *  - human_gate_resume_audit_lines
 *  - propagation_run_audit_lines
 * 두 audit-only 슬라이스를 병치한다.
 *
 * 정적 + 최소 런타임 검사:
 *  1. handler 소스에 두 모듈 import 존재 + 응답 필드 포함.
 *  2. handler 를 project_space_key 없는 threadKey 로 호출해도 두 슬라이스는 **빈 배열** 로 존재(fail-open).
 *  3. 두 pure builder 가 허용 shape(string[])을 돌려준다(founder 본문 노출 금지 검증).
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.COS_RUN_STORE = 'memory';
process.env.COS_MEMORY_TEST_TENANCY_DEFAULTS = '1';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const handlerSrc = fs.readFileSync(
  path.join(ROOT, 'src/founder/founderCosToolHandlers.js'),
  'utf8',
);

// 1) 정적: import + 응답 필드
assert.ok(
  /from\s+['"]\.\/humanGateResumeAuditLines\.js['"]/.test(handlerSrc),
  'handler must import humanGateResumeAuditLines',
);
assert.ok(
  /from\s+['"]\.\/propagationRunAuditLines\.js['"]/.test(handlerSrc),
  'handler must import propagationRunAuditLines',
);
assert.ok(
  /human_gate_resume_audit_lines\s*,/.test(handlerSrc),
  'return object includes human_gate_resume_audit_lines',
);
assert.ok(
  /propagation_run_audit_lines\s*,/.test(handlerSrc),
  'return object includes propagation_run_audit_lines',
);

// 2) 최소 런타임: project_space_key 가 없으면 빈 배열이어도 반드시 필드 자체는 존재해야 한다.
const { handleReadExecutionContext } = await import(
  '../src/founder/founderCosToolHandlers.js'
);
const out = await handleReadExecutionContext({ limit: 5 }, `thread_w11f_${Date.now()}`);
assert.equal(out.ok, true);
assert.ok(Array.isArray(out.human_gate_resume_audit_lines), 'slice present even when empty');
assert.ok(Array.isArray(out.propagation_run_audit_lines), 'slice present even when empty');
for (const line of out.human_gate_resume_audit_lines) assert.equal(typeof line, 'string');
for (const line of out.propagation_run_audit_lines) assert.equal(typeof line, 'string');

// 3) pure builder 가 string[] 을 보장한다(founder 본문 jargon 누수 검증과 함께)
const { buildHumanGateResumeAuditLines } = await import(
  '../src/founder/humanGateResumeAuditLines.js'
);
const { buildPropagationRunAuditLines } = await import(
  '../src/founder/propagationRunAuditLines.js'
);

const hg = buildHumanGateResumeAuditLines({
  project_space_key: 'ps_alpha',
  human_gates: [
    {
      id: '01234567-89ab-4cde-8f01-23456789abcd',
      project_space_key: 'ps_alpha',
      gate_kind: 'manual_secret_entry',
      reopened_count: 1,
      resume_target_kind: 'packet',
      resume_target_ref: 'packet_X1',
      continuation_packet_id: 'P1',
      continuation_run_id: 'R1',
      continuation_thread_key: 'T1',
    },
  ],
});
assert.ok(Array.isArray(hg.human_gate_resume_audit_lines));
for (const line of hg.human_gate_resume_audit_lines) assert.equal(typeof line, 'string');

const pr = buildPropagationRunAuditLines({
  project_space_key: 'ps_alpha',
  recent_propagation_runs: [
    {
      run: { id: 'r1', project_space_key: 'ps_alpha', status: 'succeeded' },
      steps: [{ step_status: 'completed', verification_kind: 'smoke' }],
    },
  ],
});
assert.ok(Array.isArray(pr.propagation_run_audit_lines));
for (const line of pr.propagation_run_audit_lines) assert.equal(typeof line, 'string');

// summary_lines 에 audit 토큰이 섞여 들지 않았는지 (최소 보증).
const summary = Array.isArray(out.summary_lines) ? out.summary_lines.join('\n') : '';
assert.ok(!/resume=packet\//.test(summary));
assert.ok(!/run\[[a-z0-9-]+\].*attempted=/.test(summary));

console.log('test-read-execution-context-w11f-audit-slices: ok');
