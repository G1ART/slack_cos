/**
 * Topic Anchor Guard — thread/project 내 topic drift (cross-project bleed) 방지.
 *
 * 현재 thread의 anchor cluster를 기반으로 outbound draft를 검증하고,
 * alien domain 침투를 감지하여 차단한다.
 */

const DOMAIN_KEYWORDS = {
  calendar: ['캘린더', 'calendar', '일정', 'schedule', '반복 일정', '대관', '예약'],
  gallery: ['갤러리', 'gallery', '전시', 'exhibition', '아뜰리에', 'atelier', '작품'],
  gtm: ['GTM', 'go-to-market', '마케팅', '시장 진입', '현지화', 'localization', 'NYC', 'LA', 'Seoul'],
  grants: ['보조금', 'grants', '지원금', 'compliance', '규정', 'regulation', '파트너십'],
  abstract: ['abstract', '추상', '전략', 'strategy', '디지털 갤러리', '디지털 아트'],
  ecommerce: ['커머스', 'commerce', '결제', 'payment', '장바구니', 'cart', '주문'],
};

/**
 * Derive the anchor cluster (domain keywords) from the current context.
 */
export function deriveAnchorCluster({ projectSpace, slotLedger, recentTranscript, playbookKind }) {
  const signals = [];

  if (projectSpace?.human_label) signals.push(projectSpace.human_label);
  if (projectSpace?.canonical_summary) signals.push(projectSpace.canonical_summary);
  if (projectSpace?.aliases?.length) signals.push(...projectSpace.aliases);

  if (slotLedger) {
    const slots = slotLedger.slots || {};
    if (slots.project_goal?.value) signals.push(slots.project_goal.value);
    if (slots.active_topic_anchor?.value) signals.push(slots.active_topic_anchor.value);
    if (slots.product_label?.value) signals.push(slots.product_label.value);
  }

  if (recentTranscript) {
    signals.push(String(recentTranscript).slice(-2000));
  }

  if (playbookKind) signals.push(playbookKind);

  const signalText = signals.join(' ').toLowerCase();

  const anchored = new Set();
  const anchorKeywords = [];

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    const hits = keywords.filter((kw) => signalText.includes(kw.toLowerCase()));
    if (hits.length > 0) {
      anchored.add(domain);
      anchorKeywords.push(...hits);
    }
  }

  return { domains: [...anchored], keywords: anchorKeywords };
}

/**
 * Score an outbound draft against the anchor cluster.
 * Returns alien domains detected and a drift score.
 */
export function detectTopicDrift({ draftText, anchorCluster, currentRequestText }) {
  if (!draftText || !anchorCluster?.domains?.length) {
    return { drifted: false, alienDomains: [], score: 0 };
  }

  const draftLower = draftText.toLowerCase();
  const requestLower = (currentRequestText || '').toLowerCase();
  const anchorDomains = new Set(anchorCluster.domains);

  const alienDomains = [];
  let driftScore = 0;

  for (const [domain, keywords] of Object.entries(DOMAIN_KEYWORDS)) {
    if (anchorDomains.has(domain)) continue;

    const hits = keywords.filter((kw) => {
      const kwLow = kw.toLowerCase();
      return draftLower.includes(kwLow) && !requestLower.includes(kwLow);
    });

    if (hits.length >= 2) {
      alienDomains.push({ domain, hits, count: hits.length });
      driftScore += hits.length * 3;
    }
  }

  const DRIFT_THRESHOLD = 6;

  return {
    drifted: driftScore >= DRIFT_THRESHOLD,
    alienDomains,
    score: driftScore,
    anchorDomains: anchorCluster.domains,
  };
}

/**
 * Build a topic anchor reminder for LLM regeneration.
 */
export function buildAnchorReminder(anchorCluster, driftResult) {
  const lines = [
    '[TOPIC ANCHOR CONSTRAINT]',
    `이 대화의 주제 도메인: ${anchorCluster.domains.join(', ')}`,
    `핵심 키워드: ${anchorCluster.keywords.slice(0, 10).join(', ')}`,
  ];

  if (driftResult.alienDomains.length) {
    lines.push(`감지된 외부 도메인 침투: ${driftResult.alienDomains.map((a) => a.domain).join(', ')}`);
    lines.push('위 외부 도메인의 내용을 포함하지 마세요. 현재 주제에만 집중하세요.');
  }

  return lines.join('\n');
}

/**
 * Log a drift event for diagnostics.
 */
export function logDriftEvent(driftResult, context = {}) {
  try {
    console.info(JSON.stringify({
      event: 'topic_drift_detected',
      ts: new Date().toISOString(),
      drifted: driftResult.drifted,
      score: driftResult.score,
      alienDomains: driftResult.alienDomains.map((a) => a.domain),
      anchorDomains: driftResult.anchorDomains,
      ...context,
    }));
  } catch { /* */ }
}
