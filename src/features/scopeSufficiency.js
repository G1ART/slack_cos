/**
 * MVP 실행 전 **범위 충분성** — 턴 수가 아니라 정보 밀도·명시 항목으로만 판단.
 * (COS 킥오프 본문은 merge 대상에서 제외 — 조항만으로 통과 방지)
 */

/**
 * @param {string} transcript `[사용자]` / `[COS]` 블록 전체
 * @returns {string[]}
 */
export function parseTranscriptUserChunksOnly(transcript) {
  const t = String(transcript || '').trim();
  if (!t) return [];
  const chunks = t.split(/\n\n(?=\[)/u);
  const pref = '[사용자]\n';
  /** @type {string[]} */
  const out = [];
  for (const c of chunks) {
    if (c.startsWith(pref)) out.push(c.slice(pref.length).trim());
  }
  return out;
}

/**
 * @typedef {{ sufficient: boolean, reason: string, gaps: string[] }} SufficiencyResult
 */

/**
 * @param {string} transcript
 * @param {string} currentUserMsg 이번 턴 (아직 버퍼에 없을 수 있음)
 * @param {string} goalLine 킥오프에서 뽑은 목표 한 덩어리
 * @param {{
 *   quarantineFuturePhaseIdeas?: boolean,
 *   relaxBenchmarkForStickyIntake?: boolean,
 * }} [opts]
 * @returns {SufficiencyResult}
 */
export function assessScopeSufficiency(transcript, currentUserMsg, goalLine, opts = {}) {
  const users = parseTranscriptUserChunksOnly(transcript);
  const u = String(currentUserMsg || '').trim();
  const goal = String(goalLine || '').trim();
  let mergedUser = [goal, ...users, u].filter(Boolean).join('\n');

  if (opts.quarantineFuturePhaseIdeas) {
    mergedUser = stripFuturePhaseNoiseForSufficiency(mergedUser);
  }

  if (
    /충분(\s*해|\s*하|\s*지|\s*다)|이정도면|이\s*정도면|이대로\s*(가|진행|만들)|범위\s*고정|실행\s*승인|그냥\s*만들|고고/u.test(
      u,
    )
  ) {
    return { sufficient: true, reason: 'user_explicit_sufficiency', gaps: [] };
  }

  const problemClear = goal.length >= 8 || /캘린더|스케줄|툴|앱|플랫폼|관리|예약|대장|시스템/u.test(mergedUser);
  const userContextClear = /멤버|팀|개인|고객|관리자|갤러리|직원|외부|아뜰|공간|대관|파트너/u.test(
    mergedUser,
  );
  const mvpBoundsClear =
    /MVP|\bv1\b|포함|제외|우선|승인|반복|월|주|뷰|일정|모바일|웹|권한|충돌|규칙|룰|예약\s*중심|개인\s*일정/u.test(
      mergedUser,
    );
  const successOrDepth =
    /성공|지표|완료\s*기준|목표|검증|릴리스|첫\s*버전|배포/u.test(mergedUser) ||
    u.replace(/\s+/g, ' ').length >= 80 ||
    mergedUser.replace(/\s+/g, ' ').length >= 200;
  const risksSurfaced =
    /리스크|충돌|엣지|예외|실패|승인|대관|권한|반복|동시\s*예약|블랙\s*아웃/u.test(mergedUser);

  const userMsgBenchmark =
    /벤치마크|시장|유사|레퍼런스|다른\s*서비스|비교|경쟁|표준\s*UX/i.test(mergedUser) ||
    /Calendly|Google\s*Calendar|아사나|노션|Acuity/i.test(mergedUser);

  const discussionDepth = mergedUser.replace(/\s+/g, ' ').trim().length >= 180;
  const multiUserPass = users.length >= 2;
  let benchmarkPass = userMsgBenchmark || multiUserPass || discussionDepth;
  if (opts.relaxBenchmarkForStickyIntake) {
    benchmarkPass = true;
  }

  /** 본 메시지가 짧은 확정일 때(진행해줘만 등)는 깊이·사각대어로 통과시키지 않음 */
  const proceedOnly =
    u.length <= 36 &&
    /^(?:네|예|응|좋아|OK|오케이|그래|확정|알겠|\s)*(?:진행\s*해\s*줘|진행해줘|가\s*자)\s*$/iu.test(
      u.replace(/[\s\n\r.,!~]+/g, ' ').trim(),
    );

  /** @type {string[]} */
  const gaps = [];
  if (!problemClear) gaps.push('한 문장 문제정의(무엇을 푸는 툴인지)');
  if (!userContextClear) gaps.push('핵심 사용자와 사용 맥락(누가·언제·왜)');
  if (!mvpBoundsClear) gaps.push('이번 MVP에 넣을 것·빼는 것(승인·반복·뷰 등 구체 한두 가지)');
  if (!successOrDepth && !risksSurfaced) {
    gaps.push('첫 성공 기준이나, 구조적으로 드러낸 리스크·규칙 중 하나');
  }

  if (!benchmarkPass && !proceedOnly) {
    gaps.push('가벼운 시장·벤치마크 각도(유사 툴·흔한 UX) 한 줄 — 없으면 COS가 가정할게요');
  }

  const deepSingleReply =
    !proceedOnly && (u.length >= 120 || (u.match(/[.!?\n]/g) || []).length >= 4);

  const sufficient =
    !proceedOnly &&
    problemClear &&
    userContextClear &&
    mvpBoundsClear &&
    (risksSurfaced || successOrDepth || deepSingleReply) &&
    benchmarkPass;

  const reason = sufficient ? 'sufficiency_criteria' : 'incomplete';
  return { sufficient, reason, gaps: sufficient ? [] : gaps };
}

/** MVP 판정에서 제외(후속 단계·상상 확장은 현재 충분성을 깎지 않음) */
function stripFuturePhaseNoiseForSufficiency(raw) {
  const t = String(raw || '');
  const lines = t.split(/\r?\n/);
  const kept = lines.filter((line) => {
    const s = line.trim();
    if (!s) return true;
    if (
      /^(?:나중에|추후|이후\s*단계|다음\s*단계|2\s*단계|3\s*단계)/u.test(s) ||
      /(?:외부\s*사용자|블랙\s*아웃|Zelle|Venmo|결제\s*(?:트리거|안내)|링크를\s*받은)/u.test(s)
    ) {
      return false;
    }
    return true;
  });
  return kept.join('\n').replace(/\s+/g, ' ').trim();
}
