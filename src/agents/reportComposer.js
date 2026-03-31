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

  const lines = [];
  if (primary.one_line_summary) lines.push(`*요약*\n${primary.one_line_summary}`);
  if (primary.recommendation) lines.push(`*COS 권고*\n${primary.recommendation}`);
  if (strongestObjection) lines.push(`*주요 반론*\n${strongestObjection}`);
  if (allRisks?.length) lines.push(`*리스크*\n${bulletList(allRisks)}`);
  if (primary.next_actions?.length) lines.push(`*다음 행동*\n${bulletList(primary.next_actions)}`);
  if (decisionState.decisionNeeded) {
    lines.push(`*대표 결정 필요*\n${decisionState.decisionQuestion}`);
  }

  return lines.join('\n\n').trim() || '검토 결과를 요약할 수 없습니다. 다시 시도해 주세요.';
}
