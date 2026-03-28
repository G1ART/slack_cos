/**
 * 스레드/DM 버퍼에 PLN 이 남아 있을 때, 접두 없는 후속 자연어에 짧은 조회 안내를 붙인다.
 * @see registerHandlers — planner·조회 등 app.js 직접 반환도 버퍼에 기록
 */

/**
 * @param {string} transcript
 * @returns {string | null}
 */
export function extractLastPlanIdFromTranscript(transcript) {
  const t = String(transcript || '');
  let last = null;
  let m;
  const re = /\b(PLN-\d{6}-\d{2,})\b/g;
  while ((m = re.exec(t)) !== null) last = m[1];
  return last;
}

/**
 * @param {{ priorTranscript: string, currentUserText: string }} p
 * @returns {string | null} plan_id
 */
export function pickThreadPlanFollowUpHint({ priorTranscript, currentUserText }) {
  const prior = String(priorTranscript || '').trim();
  if (!prior) return null;
  const lastPln = extractLastPlanIdFromTranscript(prior);
  if (!lastPln) return null;
  const cur = String(currentUserText || '').trim();
  if (!cur) return null;

  if (/^계획(상세|진행|발행목록|작업목록|승인|기각|발행|시작|완료|차단|변경|요약)(?:\s|$|[：:])/u.test(cur)) {
    return null;
  }
  if (/^계획등록\b/u.test(cur)) return null;
  if (cur.includes(lastPln)) return null;
  if (/^협의모드|^매트릭스셀:|^관점추가\s+/m.test(cur)) return null;
  if (/^COS(?:\s|[,:])/i.test(cur) || /^비서(?:\s|[,:])/m.test(cur)) return null;

  return lastPln;
}

/**
 * Slack mrkdwn 한 줄 (이탤릭 블록 안에 넣지 않고 단독 줄 권장)
 * @param {string} planId
 */
export function formatThreadPlanFollowUpFooter(planId) {
  const id = String(planId || '').trim();
  if (!id) return '';
  return [
    '—',
    `참고: 직전에 이 대화에 *${id}* 가 포함된 응답이 있습니다.`,
    `- 확인: \`계획상세 ${id}\` · 진행: \`계획진행 ${id}\``,
    `- 새로 목표를 문서화하려면 \`계획등록: …\` 를 다시 보내 주세요.`,
  ].join('\n');
}
