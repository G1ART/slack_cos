/**
 * W5-A: founder 표면(모델+렌더)에 resolution_class enum 토큰이 **절대** 노출되지 않는다.
 * surfaceModel 의 human_gate_reason/action 필드에서도 스네이크_케이스 enum 은 필터된다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';
import { FAILURE_RESOLUTION_CLASSES } from '../src/founder/failureTaxonomy.js';

const SHELL = {
  status: 'running',
  workcell_runtime: {
    status: 'blocked',
    escalation_open: true,
    escalation_targets: ['pm'],
    packets: [],
    summary_lines: ['프로젝트 바인딩이 애매해 진행이 막혔습니다.'],
    failure_classification: {
      resolution_class: 'hil_required_external_auth',
      human_gate_required: true,
      human_gate_reason: '접근 권한 토큰이 없어 tenancy_or_binding_ambiguity 로 막혔습니다.',
      human_gate_action: 'Supabase management API 에 관리자 권한으로 접속해 재발급해 주세요.',
      retryable: false,
      retry_budget_remaining: null,
    },
  },
};

const sm = buildFounderSurfaceModel({
  modelText: '진행이 막혀 원인을 확인 중입니다.',
  activeRunShell: SHELL,
});

for (const rc of FAILURE_RESOLUTION_CLASSES) {
  assert.ok(!String(sm.human_gate_reason || '').includes(rc), `surfaceModel.human_gate_reason must not expose ${rc}`);
  assert.ok(!String(sm.human_gate_action || '').includes(rc), `surfaceModel.human_gate_action must not expose ${rc}`);
  assert.ok(!String(sm.blocker_reason || '').includes(rc));
  assert.ok(!String(sm.review_reason || '').includes(rc));
}

const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: '진행이 막혀 원인을 확인 중입니다.' });
for (const rc of FAILURE_RESOLUTION_CLASSES) {
  assert.ok(!r.text.includes(rc), `rendered founder text must not expose ${rc}`);
}
assert.ok(!r.text.includes('resolution_class'));
assert.ok(!r.text.includes('failure_classification'));
assert.ok(!r.text.includes('retry_budget_remaining'));

const SHELL_WITH_TOKEN_IN_REASON = {
  status: 'running',
  workcell_runtime: {
    status: 'blocked',
    escalation_open: true,
    escalation_targets: ['pm'],
    packets: [],
    summary_lines: ['진행이 막혔습니다.'],
    failure_classification: {
      resolution_class: 'runtime_bug_or_regression',
      human_gate_required: false,
      human_gate_reason: 'runtime_bug_or_regression 토큰이 섞여 있습니다.',
      human_gate_action: null,
      retryable: false,
      retry_budget_remaining: null,
    },
  },
};
const sm2 = buildFounderSurfaceModel({
  modelText: '조사 중입니다.',
  activeRunShell: SHELL_WITH_TOKEN_IN_REASON,
});
assert.equal(sm2.human_gate_reason, null, 'jargon-heavy reason filtered to null');

console.log('test-founder-surface-resolution-class-not-exposed: ok');
