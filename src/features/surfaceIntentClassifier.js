/**
 * Surface intent — 규칙 우선, 애매하면 null (dialog/Council로 패스).
 * 구조화 명령·조회·플래너 락 이후에만 호출됨.
 * @see docs/cursor-handoffs/COS_FastTrack_v1_Surface_And_Routing.md
 */

/**
 * @param {string} trimmed
 * @returns {{ intent: string, body?: string } | null}
 */
export function classifySurfaceIntent(trimmed) {
  const t = String(trimmed || '').trim();
  if (t.length < 2) return null;

  const decisionCmp = t.match(/^결정비교\s*[:：]\s*(.+)$/u);
  if (decisionCmp?.[1]?.trim()) {
    return { intent: 'decision_compare', body: decisionCmp[1].trim() };
  }

  const startProjGlue = t.match(/^프로젝트시작\s*[:：]\s*(.+)$/u);
  if (startProjGlue?.[1]?.trim()) {
    return { intent: 'start_project', body: startProjGlue[1].trim() };
  }
  const startProj = t.match(/^프로젝트\s*시작\s*[:：]\s*(.+)$/u);
  if (startProj?.[1]?.trim()) {
    return { intent: 'start_project', body: startProj[1].trim() };
  }
  const startTool = t.match(/^툴\s*시작\s*[:：]\s*(.+)$/u);
  if (startTool?.[1]?.trim()) {
    return { intent: 'start_project', body: startTool[1].trim() };
  }
  const toolMake = t.match(/^툴\s*제작\s*[:：]\s*(.+)$/su);
  if (toolMake?.[1]?.trim()) {
    return { intent: 'start_project', body: toolMake[1].trim() };
  }
  const toolMake2 = t.match(/^도구\s*제작\s*[:：]\s*(.+)$/su);
  if (toolMake2?.[1]?.trim()) {
    return { intent: 'start_project', body: toolMake2[1].trim() };
  }
  const toolMakeEn = t.match(/^build\s+tool\s*[:：]\s*(.+)$/isu);
  if (toolMakeEn?.[1]?.trim()) {
    return { intent: 'start_project', body: toolMakeEn[1].trim() };
  }

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
