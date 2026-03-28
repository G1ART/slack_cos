/**
 * Surface intent — 규칙 우선, 애매하면 null (dialog/Council로 패스).
 * 구조화 명령·조회·플래너 락 이후에만 호출됨.
 * @see docs/cursor-handoffs/COS_FastTrack_v1_Surface_And_Routing.md
 */

/** @param {string} raw */
function normalizeSurfaceIntentText(raw) {
  return String(raw || '')
    .normalize('NFKC')
    .replace(/^\uFEFF/, '')
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n')
    .trim();
}

/** 줄 앞 잡음 — 멘션 제거 후에도 남는 G1COS 접두·인용·리스트 등 */
function stripSurfaceLineNoise(line) {
  let s = String(line || '').replace(/[\u200B-\u200D\uFEFF]/g, '');
  s = s.normalize('NFKC').trim();
  s = s.replace(/^G1\s*COS(?=[\s\u00A0\u3000]*툴)/iu, '');
  s = s.replace(/^G1\s*COS\s+/iu, '');
  s = s.replace(/^G1\s*[.\-_]\s*COS\s+/iu, '');
  // Slack 내비 `COS 툴제작:` / `비서 툴제작:` — 접두 제거 후 동일 규칙 매칭
  s = s.replace(/^(COS|비서)\s+/iu, '');
  for (let g = 0; g < 12; g += 1) {
    const prev = s;
    s = s.replace(/^>\s*/, '');
    s = s.replace(/^[-–—•∙·]\s*/, '');
    s = s.replace(/^\d{1,3}\.\s+/, '');
    s = s.replace(/^[*＊_＿]{1,4}(?=\S)/u, '');
    s = s.replace(/^[*＊_＿]+\s+/u, '');
    s = s.trim();
    if (s === prev) break;
  }
  return s;
}

function mergeStartProjectBody(restOnLine, tailLines) {
  const a = String(restOnLine || '').trim();
  const b = String(tailLines || '').trim();
  if (a && b) return `${a}\n${b}`;
  return a || b || '';
}

/**
 * 프로젝트/툴 시작 — 문자열 전체 `^…` 매칭 + 줄 스캔(인사 줄·G1COS 접두·`툴제작:` 단독 줄).
 * @param {string} norm NFKC·ZW 제거·줄바꿈 정규화 후 문자열
 */
export function tryClassifyStartProject(norm) {
  const singleLinePatterns = [
    /^프로젝트시작\s*[:：]\s*([\s\S]+)$/u,
    /^프로젝트\s*시작\s*[:：]\s*([\s\S]+)$/u,
    /^툴\s*시작\s*[:：]\s*([\s\S]+)$/u,
    /^툴\s*제작\s*[:：]\s*([\s\S]+)$/su,
    /^도구\s*제작\s*[:：]\s*([\s\S]+)$/su,
    /^build\s+tool\s*[:：]\s*([\s\S]+)$/isu,
  ];

  for (const re of singleLinePatterns) {
    const m = norm.match(re);
    if (m?.[1]?.trim()) return { intent: 'start_project', body: m[1].trim() };
  }

  const lines = norm.split(/\r?\n/);
  const perLineRes = [
    /^프로젝트시작\s*[:：]\s*(.*)$/u,
    /^프로젝트\s*시작\s*[:：]\s*(.*)$/u,
    /^툴\s*시작\s*[:：]\s*(.*)$/u,
    /^툴\s*제작\s*[:：]\s*(.*)$/su,
    /^도구\s*제작\s*[:：]\s*(.*)$/su,
    /^build\s+tool\s*[:：]\s*(.*)$/isu,
  ];

  for (let i = 0; i < lines.length; i += 1) {
    const line = stripSurfaceLineNoise(lines[i]);
    if (!line) continue;
    const tail = lines.slice(i + 1).join('\n').trim();
    for (const re of perLineRes) {
      const m = line.match(re);
      if (!m) continue;
      const body = mergeStartProjectBody(m[1], tail);
      if (body) return { intent: 'start_project', body };
    }
  }

  const signalHit = tryClassifyStartProjectByBuildSignals(norm);
  if (signalHit) return signalHit;
  return null;
}

/** 짧은 ‘뭐예요’류만 툴제작 포함해도 킥오프로 보지 않음 */
function looksLikeToolMakingFaq(t) {
  const s = String(t || '').trim();
  if (s.length >= 36) return false;
  return /[?？]|뭐(예요|야|임|에요)|무엇|어떻게|알려/u.test(s);
}

/**
 * 접두 매칭이 실패해도 **만들기/구현 킥오프**는 domain 라우팅보다 우선한다.
 * (`routeTask` 의 ops_grants 등에 잡히기 전에 surface에서 끝낸다.)
 */
function tryClassifyStartProjectByBuildSignals(norm) {
  const t = String(norm || '').trim();
  if (t.length < 6) return null;
  // `협의모드: …` 단독 질문은 Council — 단 본문에 `툴제작:` 가 있으면 킥오프 (`협의모드 툴제작:` 등).
  if (/^협의모드\s*:/u.test(t) && !/툴\s*제작\s*[:：]/u.test(t)) return null;

  const has = (re) => re.test(t);

  if (/툴\s*제작/u.test(t) && looksLikeToolMakingFaq(t)) return null;

  const glueTool = t.match(/툴\s*제작\s*[:：]\s*([\s\S]+)/u);
  if (glueTool?.[1]?.trim()) return { intent: 'start_project', body: glueTool[1].trim() };

  const glueDt = t.match(/도구\s*제작\s*[:：]\s*([\s\S]+)/u);
  if (glueDt?.[1]?.trim()) return { intent: 'start_project', body: glueDt[1].trim() };

  const explicitColonTool =
    has(/툴\s*제작\s*[:：]/u) ||
    has(/도구\s*제작\s*[:：]/u) ||
    has(/프로젝트\s*시작\s*[:：]/u) ||
    has(/툴\s*시작\s*[:：]/u) ||
    has(/build\s+tool\s*[:：]/iu);

  const makeVerb = has(/만들자|만들\s*어|만들\s*고|구축하|개발하|개발해|만들게|제작하|하나\s*만들/u);
  const domainTool = has(
    /캘린더|스케줄|달력|일정|예약|앱|플랫폼|툴|도구|시스템|대시보드|페이지|\bMVP\b/i,
  );
  const mvp = /\bMVP\b/i.test(t);

  if (explicitColonTool) return { intent: 'start_project', body: t };

  if ((has(/툴\s*제작/u) || has(/도구\s*제작/u) || has(/내부\s*툴/u) || has(/내부툴/u)) && !looksLikeToolMakingFaq(t)) {
    return { intent: 'start_project', body: t };
  }

  if (makeVerb && domainTool) return { intent: 'start_project', body: t };
  if (mvp && domainTool) return { intent: 'start_project', body: t };
  if (has(/플랫폼/u) && makeVerb) return { intent: 'start_project', body: t };
  if (has(/캘린더\s*만들/u) || (has(/스케줄\s*관리/u) && makeVerb)) return { intent: 'start_project', body: t };

  return null;
}

/**
 * 승인(APR)·Council 출력 억제 등에 사용: 이 입력이면 초기 킥오프로 본다.
 * @param {string} trimmed
 */
export function isStartProjectKickoffInput(trimmed) {
  const t = normalizeSurfaceIntentText(trimmed);
  if (t.length < 6) return false;
  const hit = tryClassifyStartProject(t);
  return Boolean(hit && hit.intent === 'start_project');
}

/**
 * @param {string} trimmed
 * @returns {{ intent: string, body?: string } | null}
 */
export function classifySurfaceIntent(trimmed) {
  const t = normalizeSurfaceIntentText(trimmed);
  if (t.length < 2) return null;

  const decisionCmp = t.match(/^결정비교\s*[:：]\s*(.+)$/u);
  if (decisionCmp?.[1]?.trim()) {
    return { intent: 'decision_compare', body: decisionCmp[1].trim() };
  }

  const startProjectHit = tryClassifyStartProject(t);
  if (startProjectHit) return startProjectHit;

  if (
    /^(지금|현재)\s*상태/u.test(t) ||
    /^상태\s*(를|은)?\s*(좀\s*)?(보여|알려|줘|요|확인)/u.test(t) ||
    /^현황/u.test(t) ||
    /^상태\s*요약/u.test(t)
  ) {
    if (/^상태\s*점검/u.test(t)) return null;
    return { intent: 'ask_status' };
  }

  if (/^이건\s*보류/u.test(t) || /^보류\s*[:：]/u.test(t)) {
    return { intent: 'hold_pause', body: t.replace(/^이건\s*보류\s*[:：]?\s*/u, '').trim() || undefined };
  }
  if (/^중단\s*[:：]/u.test(t) || /^잠깐\s*보류/u.test(t)) {
    return { intent: 'hold_pause', body: t };
  }

  if (/배포\s*(준비|승인)/u.test(t) || /staging.*(배포|준비)/iu.test(t) || /스테이징.*(배포|준비)/u.test(t)) {
    return { intent: 'request_deploy_readiness', body: t };
  }

  if (/^전략\s*검토\s*$/u.test(t) || /^전략리뷰\s*$/u.test(t) || /^전략\s*리뷰\s*$/u.test(t)) {
    return { intent: 'request_strategy_review' };
  }
  const stratKo = t.match(/^전략\s*검토\s*[:：]\s*(.+)$/su);
  if (stratKo?.[1]?.trim()) return { intent: 'request_strategy_review', body: stratKo[1].trim() };
  const stratKo2 = t.match(/^전략리뷰\s*[:：]\s*(.+)$/su);
  if (stratKo2?.[1]?.trim()) return { intent: 'request_strategy_review', body: stratKo2[1].trim() };
  const stratKo3 = t.match(/^전략\s*리뷰\s*[:：]\s*(.+)$/su);
  if (stratKo3?.[1]?.trim()) return { intent: 'request_strategy_review', body: stratKo3[1].trim() };
  if (/^strategy\s*review\s*$/iu.test(t)) return { intent: 'request_strategy_review' };
  const stratEn = t.match(/^strategy\s*review\s*[:：]\s*(.+)$/isu);
  if (stratEn?.[1]?.trim()) return { intent: 'request_strategy_review', body: stratEn[1].trim() };

  if (/^리스크\s*검토\s*$/u.test(t) || /^위험\s*검토\s*$/u.test(t)) {
    return { intent: 'request_risk_review' };
  }
  const riskKo = t.match(/^리스크\s*검토\s*[:：]\s*(.+)$/su);
  if (riskKo?.[1]?.trim()) return { intent: 'request_risk_review', body: riskKo[1].trim() };
  const riskKo2 = t.match(/^위험\s*검토\s*[:：]\s*(.+)$/su);
  if (riskKo2?.[1]?.trim()) return { intent: 'request_risk_review', body: riskKo2[1].trim() };
  if (/^risk\s*review\s*$/iu.test(t)) return { intent: 'request_risk_review' };
  const riskEn = t.match(/^risk\s*review\s*[:：]\s*(.+)$/isu);
  if (riskEn?.[1]?.trim()) return { intent: 'request_risk_review', body: riskEn[1].trim() };

  const productFbKo = t.match(/^제품\s*피드백\s*[:：]\s*(.+)$/su);
  if (productFbKo?.[1]?.trim()) return { intent: 'product_feedback', body: productFbKo[1].trim() };
  const feedbackKo = t.match(/^피드백\s*[:：]\s*(.+)$/su);
  if (feedbackKo?.[1]?.trim()) return { intent: 'product_feedback', body: feedbackKo[1].trim() };
  const feedbackEn = t.match(/^feedback\s*[:：]\s*(.+)$/isu);
  if (feedbackEn?.[1]?.trim()) return { intent: 'product_feedback', body: feedbackEn[1].trim() };

  return null;
}
