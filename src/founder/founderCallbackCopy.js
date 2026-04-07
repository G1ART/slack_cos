/**
 * Founder milestone callbacks — 한국어 자연어, 내부 id·스키마·원시 ledger 금지.
 */

/**
 * @param {{ objective?: string, tool?: string, action?: string }} p
 */
export function renderStartedMilestone(p) {
  const o = String(p.objective || '요청하신 작업').trim().slice(0, 100);
  const tool = String(p.tool || '외부 도구');
  const action = String(p.action || '실행');
  return `${o} 건은 지금 실행에 들어갔습니다. 먼저 ${tool}에서 ${action} 단계를 시작했습니다.`;
}

/**
 * @param {{ objective?: string, lines?: string[] }} p
 */
export function renderReviewMilestone(p) {
  const o = String(p.objective || '진행 중인 작업').trim().slice(0, 80);
  const lines = Array.isArray(p.lines) ? p.lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 3) : [];
  const body = lines.length ? lines.map((l) => `· ${l.slice(0, 200)}`).join('\n') : '· 검토가 필요한 항목이 있습니다.';
  return `${o} 건에서 확인이 필요합니다.\n${body}\n다음 결정을 주시면 이어서 진행하겠습니다.`;
}

/**
 * @param {{ objective?: string, need_line?: string }} p
 */
export function renderBlockedMilestone(p) {
  const o = String(p.objective || '작업').trim().slice(0, 80);
  const need = String(p.need_line || '추가 입력이나 설정이 필요합니다.').trim().slice(0, 220);
  return `${o} 건이 잠시 멈춰 있습니다. ${need}`;
}

/**
 * @param {{ objective?: string, summary_lines?: string[] }} p
 */
export function renderCompletedMilestone(p) {
  const o = String(p.objective || '요청하신 작업').trim().slice(0, 100);
  const lines = Array.isArray(p.summary_lines)
    ? p.summary_lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 4)
    : [];
  const body = lines.length ? lines.map((l) => `· ${l.slice(0, 180)}`).join('\n') : '· 산출물을 런타임에 기록했습니다.';
  return `${o} 건 1차 실행을 마쳤습니다.\n${body}\n더 다듬거나 다음 단계가 필요하면 말씀해 주세요.`;
}

/**
 * @param {{ objective?: string, hint?: string }} p
 */
export function renderFailedMilestone(p) {
  const o = String(p.objective || '작업').trim().slice(0, 80);
  const hint = String(p.hint || '자동 대체 경로까지 성공하지 못했습니다.').trim().slice(0, 200);
  return `${o} 건에서 오류가 났습니다. ${hint} 같은 메시지를 다시 보내 주시면 이어서 보겠습니다.`;
}

/**
 * starter 직후 같은 턴에 터미널에 도달했을 때 1통 합성 (내부 id 금지).
 * @param {{
 *   objective?: string,
 *   tool?: string,
 *   action?: string,
 *   terminal: 'completed'|'blocked'|'failed'|'review_required',
 *   summary_lines?: string[],
 *   need_line?: string,
 *   review_lines?: string[],
 * }} p
 */
export function renderEagerCombinedMilestone(p) {
  const o = String(p.objective || '요청하신 작업').trim().slice(0, 100);
  const tool = String(p.tool || '외부 도구');
  const action = String(p.action || '실행');
  const head = `${o} 건 첫 실행을 시작했고, ${tool}의 ${action} 단계에서 바로 결과가 정리되었습니다.`;
  if (p.terminal === 'completed') {
    const lines = Array.isArray(p.summary_lines)
      ? p.summary_lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 3)
      : [];
    const body = lines.length ? lines.map((l) => `· ${l.slice(0, 160)}`).join('\n') : '· 실행 기록을 남겼습니다.';
    return `${head}\n${body}\n더 손볼 점이 있으면 말씀해 주세요.`;
  }
  if (p.terminal === 'blocked') {
    const need = String(p.need_line || '추가 설정이 필요합니다.').slice(0, 200);
    return `${head}\n다만 여기서 잠시 멈춥니다: ${need}`;
  }
  if (p.terminal === 'review_required') {
    const lines = Array.isArray(p.review_lines)
      ? p.review_lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 2)
      : [];
    const body = lines.length ? lines.map((l) => `· ${l.slice(0, 180)}`).join('\n') : '· 확인이 필요한 단계가 있습니다.';
    return `${head}\n${body}\n판단을 주시면 이어서 진행하겠습니다.`;
  }
  const hint = String(p.need_line || '').slice(0, 180);
  return `${head}\n오류로 중단되었습니다. ${hint || '같은 메시지를 다시 보내 주시면 이어서 보겠습니다.'}`;
}
