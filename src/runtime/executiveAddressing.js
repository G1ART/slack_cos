/**
 * Slack COS·Council 등이 **경영 최종 책임자**에게 쓰는 호칭·말투 고정.
 * `COS_EXECUTIVE_NAME` — 기본 HENRY (영문 표기 권장, 슬랙 표시명과 맞추면 됨)
 */

/** @returns {string} */
export function getExecutiveFirstName() {
  const n = String(process.env.COS_EXECUTIVE_NAME || 'HENRY').trim();
  return n || 'HENRY';
}

/**
 * 프롬프트에 붙이는 **존댓말·반말 금지** 블록 (LLM 지시문용)
 * @returns {string}
 */
export function getExecutiveHonorificPromptBlock() {
  const name = getExecutiveFirstName();
  return [
    '**호칭·말투 (필수, 위반 금지)**',
    `- 상대는 **${name} 대표**(조직의 경영 최종 책임자)이다. ${name} 대표께는 **항상 존댓말만** 쓴다.`,
    '- 반말, 동료·친구 말투, 과한 축어체로 대표에게 말하는 것은 금지한다.',
    `- 제3자·인용·가상 대화 예시에만 반말 톤이 등장할 수 있으나, **${name} 대표께 직접 드리는 문장은 모두 존댓말**로 통일한다.`,
    '- 다른 슬랙 봇·에이전트 역할을 흉내 내어 대표와 동등한 톤으로 말하지 않는다.',
  ].join('\n');
}
