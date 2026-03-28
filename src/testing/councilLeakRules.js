/**
 * planner/query 응답 회귀 — Council 본문 시그니처가 섞이면 즉시 실패.
 * (프로덕션 sanitize 는 topLevelRouter.looksLikeCouncilSynthesisBody 와 별도 휴리스틱)
 */

export const COUNCIL_LEAK_RULE_SUBSTRINGS = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '핵심 리스크',
  '실행 작업 후보로 보입니다',
];

/**
 * @param {string} text
 * @returns {string | null} 첫 매칭 룰 문자열 또는 없음
 */
export function firstCouncilLeakRuleHit(text) {
  const t = String(text || '');
  for (const s of COUNCIL_LEAK_RULE_SUBSTRINGS) {
    if (t.includes(s)) return s;
  }
  return null;
}

/**
 * @param {string} text
 * @param {{ responder: string }} ctx
 * @returns {{ ok: true } | { ok: false, reason: string, hit: string }}
 */
export function assertNoCouncilLeakInNonCouncilResponse(text, ctx) {
  const r = String(ctx?.responder || '');
  if (r === 'council') return { ok: true };
  const hit = firstCouncilLeakRuleHit(text);
  if (hit) {
    return {
      ok: false,
      reason: `responder=${r} 인데 Council 시그니처 "${hit}" 포함`,
      hit,
    };
  }
  return { ok: true };
}
