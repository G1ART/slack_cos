/**
 * W5-A: workcell_runtime.failure_classification 에서 human_gate_action 이 제공되면
 * renderFounderSurfaceText 가 blocked/review 헤더 뒤에 "다음 조치: …" 한 줄을 trailer 로 붙인다.
 * 모델 산문에 이미 포함된 경우는 중복 출력하지 않는다.
 */
import assert from 'node:assert/strict';
import { buildFounderSurfaceModel } from '../src/founder/founderSurfaceModel.js';
import { renderFounderSurfaceText } from '../src/founder/founderSurfaceRenderer.js';
import { buildFailureClassification } from '../src/founder/failureTaxonomy.js';

function shellWithHumanGate({ status, workcellStatus, reason, action }) {
  return {
    status,
    workcell_runtime: {
      status: workcellStatus,
      escalation_open: workcellStatus === 'escalated',
      escalation_targets: workcellStatus === 'escalated' ? ['pm'] : [],
      packets: [],
      summary_lines: ['리뷰가 필요한 패킷이 하나 있습니다.'],
      failure_classification: buildFailureClassification({
        resolution_class: 'hil_required_external_auth',
        human_gate_reason: reason,
        human_gate_action: action,
      }),
    },
  };
}

{
  const shell = shellWithHumanGate({
    status: 'running',
    workcellStatus: 'blocked',
    reason: 'Slack 앱 인증이 만료되었습니다.',
    action: 'Slack 워크스페이스에서 앱을 재설치해 주세요.',
  });
  const sm = buildFounderSurfaceModel({ modelText: '지금 확인 중입니다.', activeRunShell: shell });
  assert.equal(sm.surface_intent, 'blocked');
  assert.equal(sm.human_gate_required, true);
  assert.equal(sm.human_gate_action, 'Slack 워크스페이스에서 앱을 재설치해 주세요.');
  const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: '지금 확인 중입니다.' });
  assert.ok(r.text.includes('다음 조치:'), 'human_gate_action trailer rendered');
  assert.ok(r.text.includes('Slack 워크스페이스에서 앱을 재설치해 주세요.'));
  assert.equal(r.appended_human_gate_action, 'Slack 워크스페이스에서 앱을 재설치해 주세요.');
  assert.ok(!r.text.includes('hil_required_external_auth'), 'resolution_class not leaked');
}

{
  const shell = shellWithHumanGate({
    status: 'running',
    workcellStatus: 'review_required',
    reason: '리뷰어가 추가 데이터를 요청했습니다.',
    action: 'QA 리뷰어에게 샘플 데이터를 공유해 주세요.',
  });
  const sm = buildFounderSurfaceModel({ modelText: 'QA 리뷰어에게 샘플 데이터를 공유해 주세요 라고 이미 말해두었습니다.', activeRunShell: shell });
  const r = renderFounderSurfaceText({
    surfaceModel: sm,
    modelText: 'QA 리뷰어에게 샘플 데이터를 공유해 주세요 라고 이미 말해두었습니다.',
  });
  assert.equal(r.appended_human_gate_action, undefined, 'skip when model text already contains action');
  assert.ok(!r.text.includes('다음 조치:'));
}

{
  const shell = shellWithHumanGate({
    status: 'completed',
    workcellStatus: 'active',
    reason: null,
    action: null,
  });
  shell.workcell_runtime.failure_classification = null;
  const sm = buildFounderSurfaceModel({ modelText: '완료했습니다.', activeRunShell: shell });
  const r = renderFounderSurfaceText({ surfaceModel: sm, modelText: '완료했습니다.' });
  assert.ok(!r.text.includes('다음 조치:'), 'no human_gate trailer when classification absent');
}

console.log('test-founder-surface-human-gate-line: ok');
