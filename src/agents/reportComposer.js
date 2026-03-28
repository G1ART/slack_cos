import { mergeRisks } from './risk.js';

export function bulletList(items) {
  if (!items || items.length === 0) return '- 없음';
  return items.map((item) => `- ${item}`).join('\n');
}

export function yesNo(value) {
  return value ? '예' : '아니오';
}

export function deriveDecisionState(route, primary, risk) {
  const decisionNeeded =
    primary.ceo_decision_needed ||
    Boolean(risk?.decision_should_pause) ||
    route.urgency === 'high';

  const decisionQuestion =
    primary.ceo_decision_question && primary.ceo_decision_question.trim()
      ? primary.ceo_decision_question.trim()
      : decisionNeeded
      ? '이 안건을 지금 승인할지, 보류할지 결정이 필요합니다.'
      : '현재는 즉시 대표 결정이 필수는 아닙니다.';

  return { decisionNeeded, decisionQuestion };
}

export function composeFinalReport({ route, primary, risk, channelContext, approvalItem }) {
  const strongestObjection = risk?.strongest_objection || primary.strongest_objection;
  const allRisks = mergeRisks(primary.key_risks, risk?.hidden_risks || []);
  const decisionState = deriveDecisionState(route, primary, risk);

  let report = '';
  report += `한 줄 요약\n${primary.one_line_summary}\n\n`;
  report += `추천안\n${primary.recommendation}\n\n`;
  report += `가장 강한 반대 논리\n${strongestObjection}\n\n`;
  report += `핵심 리스크\n${bulletList(allRisks)}\n\n`;
  report += `다음 행동\n${bulletList(primary.next_actions)}\n\n`;
  report += `대표 결정 필요 여부\n${yesNo(decisionState.decisionNeeded)}\n`;
  report += `${decisionState.decisionQuestion}\n\n`;

  if (risk?.reconsider_triggers?.length) {
    report += `재검토 트리거\n${bulletList(risk.reconsider_triggers)}\n\n`;
  }

  if (approvalItem) {
    report += `승인 대기열\n- 상태: pending\n- 승인 ID: ${approvalItem.id}\n\n`;
  }

  report += `내부 처리 정보\n`;
  report += `- 채널 기본 설정: ${channelContext || '없음'}\n`;
  report += `- 분류: ${route.task_type}\n`;
  report += `- 주 담당 에이전트: ${route.primary_agent}\n`;
  report += `- 리스크 검토 포함: ${yesNo(route.include_risk)}\n`;
  report += `- 긴급도: ${route.urgency}`;

  return report.trim();
}
