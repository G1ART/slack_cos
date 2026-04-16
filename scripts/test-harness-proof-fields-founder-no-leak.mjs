#!/usr/bin/env node
/**
 * W6-B regression #5 — founder surface no-leak.
 *
 * workcell_runtime 에 W6-B proof 필드(reviewer_findings_count, rework_cause_code,
 * acceptance_evidence_kind, correction_hit_rate, patch_quality_delta, unresolved_disagreements)
 * 가 채워져 있어도 founder surface model / renderer 출력에는 **내부 토큰이 절대 새지 않는다**.
 *
 * 헌법 §6 — founder 에 내부 jargon 금지. W4 closeout 은 summary_lines/escalation reasons 만
 * 자연어 경로로 founder surface 에 반영하고, proof 필드는 내부 감사/audit 용이다.
 */

import assert from 'node:assert/strict';

import { buildHarnessWorkcellRuntime } from '../src/founder/harnessWorkcellRuntime.js';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';

const build = buildHarnessWorkcellRuntime({
  dispatch_id: 'd_leak_check',
  personas: ['research', 'pm'],
  packets: [
    {
      packet_id: 'p1', persona: 'research', owner_persona: 'research',
      review_required: false,
      reviewer_findings_count: 7,
      rework_requested: true,
      rework_cause_code: 'external_regression',
      acceptance_evidence_kind: 'live_demo',
      disagreement_open: true,
    },
  ],
  persona_contract_runtime_snapshot: ['research: analyze'],
  correction_hit_rate: 0.42,
  patch_quality_delta: 0.05,
});
assert.equal(build.ok, true);
const wc = build.workcell_runtime;

// 1) model 빌드 — shell 은 workcell_runtime 을 그대로 싣는다
const shell = {
  status: 'review_required',
  workcell_runtime: wc,
};
const model = buildFounderSurfaceModel({
  threadKey: 't_leak',
  activeRunShell: shell,
  readModel: null,
  artifacts: [],
  modelText: '리뷰에서 몇 가지 이슈가 있어 정리 중입니다.',
});

// 2) model 의 모든 문자열 값을 합쳐 내부 토큰 검사
const modelText = JSON.stringify(model);
const FORBIDDEN_TOKENS = [
  'reviewer_findings_count',
  'rework_cause_code',
  'acceptance_evidence_kind',
  'unresolved_disagreements',
  'correction_hit_rate',
  'patch_quality_delta',
  'resolution_class',
  'external_regression',
  'live_demo',
];
for (const tok of FORBIDDEN_TOKENS) {
  assert.ok(!modelText.includes(tok), `model must not leak internal token: ${tok}`);
}

// 3) render 결과도 검사
const renderResult = renderFounderSurfaceText({
  surfaceModel: model,
  modelText: '리뷰에서 몇 가지 이슈가 있어 정리 중입니다.',
  tenancyPresent: false,
});
const renderedText = String(renderResult && renderResult.text != null ? renderResult.text : '');
for (const tok of FORBIDDEN_TOKENS) {
  assert.ok(!renderedText.includes(tok), `rendered text must not leak internal token: ${tok}`);
}

console.log('test-harness-proof-fields-founder-no-leak: ok');
