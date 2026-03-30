/**
 * Deliverable Bundle Router — founder가 명확한 작업 시작/구체화를 요청하면
 * meta-talk 대신 실제 deliverable을 생산하도록 라우팅.
 *
 * Bundle types:
 *  - strategy_refinement_bundle
 *  - product_lock_bundle
 *  - operating_rules_bundle
 *  - document_review_bundle
 */

const DELIVERABLE_TRIGGERS = [
  { pattern: /작업\s*시작해|시작해줘|진행해|go\s*ahead|execute/i, bundle: 'product_lock_bundle' },
  { pattern: /1\s*\+\s*2\s*\+\s*3|1,?\s*2,?\s*3\s*시작/i, bundle: 'product_lock_bundle' },
  { pattern: /(?:이\s*)?문서\s*(?:기준으로|토대로|바탕으로)\s*(?:구체화|정리|반영)/i, bundle: 'document_review_bundle' },
  { pattern: /지금까지\s*대화를?\s*(?:추출|정리|락인|요약)/i, bundle: 'product_lock_bundle' },
  { pattern: /MVP.*(?:정리|확정|락인|lock)/i, bundle: 'product_lock_bundle' },
  { pattern: /(?:방향성|전략).*(?:락인|확정|lock)/i, bundle: 'strategy_refinement_bundle' },
  { pattern: /벤치마크.*(?:초안|draft|작성)/i, bundle: 'operating_rules_bundle' },
  { pattern: /운영\s*규칙.*(?:초안|draft)/i, bundle: 'operating_rules_bundle' },
  { pattern: /GTM.*(?:구체화|정리|수정|refine)/i, bundle: 'strategy_refinement_bundle' },
  { pattern: /전략.*(?:구체화|수정|보완|refine)/i, bundle: 'strategy_refinement_bundle' },
];

/**
 * Detect if the founder's text triggers deliverable production mode.
 * @returns {{ triggered: boolean, bundleType?: string, pattern?: string }}
 */
export function detectDeliverableIntent(text) {
  if (!text) return { triggered: false };
  for (const { pattern, bundle } of DELIVERABLE_TRIGGERS) {
    if (pattern.test(text)) {
      return { triggered: true, bundleType: bundle, pattern: pattern.source };
    }
  }
  return { triggered: false };
}

/**
 * Build a deliverable bundle prompt for the LLM.
 * Uses resolved slots from the founder slot ledger to avoid re-asking.
 */
export function buildDeliverableBundlePrompt({ bundleType, resolvedSlots, documentContext, recentTranscript }) {
  const resolved = resolvedSlots || {};
  const docCtx = documentContext ? `\n\n[첨부 문서 내용]\n${String(documentContext).slice(0, 4000)}` : '';

  const prompts = {
    strategy_refinement_bundle: buildStrategyRefinementPrompt(resolved, docCtx, recentTranscript),
    product_lock_bundle: buildProductLockPrompt(resolved, docCtx, recentTranscript),
    operating_rules_bundle: buildOperatingRulesPrompt(resolved, docCtx, recentTranscript),
    document_review_bundle: buildDocumentReviewPrompt(resolved, docCtx, recentTranscript),
  };

  return prompts[bundleType] || prompts.product_lock_bundle;
}

function buildStrategyRefinementPrompt(slots, docCtx, transcript) {
  return [
    '[DELIVERABLE: Strategy Refinement Bundle]',
    '아래 정보를 기반으로 전략 구체화 산출물을 생성하세요.',
    '',
    `프로젝트 목표: ${slots.project_goal || '(미정)'}`,
    `제품 레이블: ${slots.product_label || '(미정)'}`,
    `핵심 사용자 문제: ${slots.primary_user_problem || '(미정)'}`,
    `도시 범위: ${slots.city_scope || '(미정)'}`,
    `벤치마크 패밀리: ${slots.benchmark_family || '(미정)'}`,
    '',
    '산출물 형식:',
    '1. 문제 정의 종합',
    '2. 벤치마크 기반 전략 방향',
    '3. 도시별 전술 권장사항 (해당 시)',
    '4. 미결 가정사항 (최소한으로)',
    docCtx,
    transcript ? `\n[최근 대화 맥락]\n${String(transcript).slice(-2000)}` : '',
    '',
    'RULES:',
    '- 이미 확정된 슬롯을 다시 질문하지 마세요',
    '- meta-talk/kickoff 재시작 금지',
    '- 구체적 산출물 생성에 집중',
    '- 정보 부족 시 best-effort 가정으로 진행, 1회 bounded clarification만 허용',
  ].filter(Boolean).join('\n');
}

function buildProductLockPrompt(slots, docCtx, transcript) {
  return [
    '[DELIVERABLE: Product Lock Bundle]',
    '아래 정보를 기반으로 제품 락인 산출물을 생성하세요.',
    '',
    `프로젝트 목표: ${slots.project_goal || '(미정)'}`,
    `제품 레이블: ${slots.product_label || '(미정)'}`,
    `핵심 사용 사례: ${slots.primary_use_case || '(미정)'}`,
    `사용자 세그먼트: ${slots.user_segments || '(미정)'}`,
    `요청 산출물: ${slots.requested_deliverables || '(미정)'}`,
    `확정 요구사항: ${slots.locked_requirements_summary || '(미정)'}`,
    '',
    '산출물 형식:',
    '1. 추출된 요구사항 정리',
    '2. MVP 정의',
    '3. 구현 방향',
    '4. 최소 기능 스택',
    docCtx,
    transcript ? `\n[최근 대화 맥락]\n${String(transcript).slice(-2000)}` : '',
    '',
    'RULES:',
    '- 이미 확정된 슬롯을 다시 질문하지 마세요',
    '- kickoff 재시작 금지',
    '- 구체적 산출물 생성에 집중',
  ].filter(Boolean).join('\n');
}

function buildOperatingRulesPrompt(slots, docCtx, transcript) {
  return [
    '[DELIVERABLE: Operating Rules Bundle]',
    '',
    `벤치마크 패밀리: ${slots.benchmark_family || '(미정)'}`,
    `핵심 사용 사례: ${slots.primary_use_case || '(미정)'}`,
    '',
    '산출물 형식:',
    '1. 벤치마크 기반 운영 규칙 초안',
    '2. 수정 가능한 가정사항',
    '3. founder 결정이 아직 필요한 항목',
    docCtx,
    transcript ? `\n[최근 대화 맥락]\n${String(transcript).slice(-2000)}` : '',
  ].filter(Boolean).join('\n');
}

function buildDocumentReviewPrompt(slots, docCtx, transcript) {
  return [
    '[DELIVERABLE: Document Review Bundle]',
    '',
    `프로젝트 목표: ${slots.project_goal || '(미정)'}`,
    `확정 방향: ${slots.locked_direction_summary || '(미정)'}`,
    '',
    '산출물 형식:',
    '1. 첨부/공유 문서가 변경한 사항',
    '2. 변경되지 않은 기존 전략/방향',
    '3. 전략/제품 방향 업데이트 권장사항',
    '4. 추가 조치 필요 사항',
    docCtx || '\n(문서 컨텍스트 없음)',
    transcript ? `\n[최근 대화 맥락]\n${String(transcript).slice(-2000)}` : '',
    '',
    'RULES:',
    '- 문서 내용이 없으면 "파일 인제스트 실패" 사실을 명시하고 기존 맥락으로 best-effort',
    '- 기존 결정을 리셋하지 마세요',
  ].filter(Boolean).join('\n');
}

/**
 * Format a bundle type for Slack surface label.
 */
export function bundleTypeLabel(bundleType) {
  const labels = {
    strategy_refinement_bundle: '전략 구체화',
    product_lock_bundle: '제품 락인',
    operating_rules_bundle: '운영 규칙 초안',
    document_review_bundle: '문서 리뷰',
  };
  return labels[bundleType] || bundleType;
}
