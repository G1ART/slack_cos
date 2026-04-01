import { extractHiddenContract } from './hiddenContractExtractor.js';

/**
 * @param {string} text
 * @param {'kickoff'|'followup'|'approval_prelock'} mode
 * @returns {{
 *   packet_type: string,
 *   mode: string,
 *   reframed_problem: string,
 *   benchmark_axes: string[],
 *   mvp_scope_in: string[],
 *   mvp_scope_out: string[],
 *   risk_points: string[],
 *   key_questions: string[],
 *   pushback_point: string,
 *   tradeoff_summary: string,
 *   alternatives: string[],
 *   scope_cut: string,
 *   next_step: string,
 * }}
 */
export function writeFounderDialogueContract(text, mode = 'kickoff') {
  const input = String(text || '').trim();
  const profile = extractHiddenContract(text);
  const domainTemplate = resolveDomainTemplate(profile.domain);
  const decisions = extractFounderDecisions(input);
  const reframedBase = `이건 단순 기능 요청이 아니라 ${profile.domain_hint}가 섞인 운영 문제입니다.`;
  const reframed =
    mode === 'followup' && decisions.summary.length
      ? `${reframedBase} 방금 합의된 조건(${decisions.summary.join(' / ')})을 반영해 다음 설계를 좁힙니다.`
      : reframedBase;

  const mvpIn = [...profile.mvp_scope_in];
  const mvpOut = [...profile.mvp_scope_out];
  if (decisions.allowExternalRequest) {
    mvpIn.unshift('외부 사용자 예약 요청 허용');
  }
  if (decisions.singleUiWithLockedBlocks) {
    mvpIn.unshift('단일 운영 UI + 권한 없는 상세 잠금 블록');
  }
  if (decisions.excludeIntegration) {
    mvpOut.unshift('1차 외부 캘린더 연동 제외');
  }

  const keyQuestions = buildNextQuestions(profile.key_questions, decisions);
  return {
    packet_type: 'dialogue_contract',
    mode,
    reframed_problem: reframed,
    benchmark_axes: profile.benchmark_axes,
    mvp_scope_in: mvpIn,
    mvp_scope_out: mvpOut,
    risk_points: profile.risk_points,
    key_questions: keyQuestions,
    pushback_point: domainTemplate.pushback_point,
    tradeoff_summary: domainTemplate.tradeoff_summary,
    alternatives: domainTemplate.alternatives,
    scope_cut: domainTemplate.scope_cut,
    next_step:
      mode === 'followup'
        ? '지금 반영된 합의를 기준으로 scope lock 후보안을 제시하겠습니다. 남은 쟁점 2~3개만 확정하면 run 생성으로 바로 넘깁니다.'
        : '위 핵심 질문만 정렬되면 제가 벤치마크 매트릭스와 MVP 설계안을 바로 좁히고, scope lock 후보안을 제시하겠습니다.',
  };
}

function extractFounderDecisions(text) {
  const t = String(text || '');
  const allowExternalRequest =
    /(외부\s*사용자|외부)\s*(예약\s*요청|요청)\s*(까지\s*)?(허용|가능)/u.test(t);
  const singleUiWithLockedBlocks =
    /(단일|단일화).*(잠금|블럭|블록).*(열람\s*금지|비공개|권한\s*외)/u.test(t) ||
    /(권한\s*외).*(상세).*(열람\s*금지|비공개)/u.test(t);
  const excludeIntegration =
    /(연동).*(제외|미포함|하지\s*않|빼)/u.test(t);

  const summary = [];
  if (allowExternalRequest) summary.push('외부 예약 요청 허용');
  if (singleUiWithLockedBlocks) summary.push('단일 UI + 상세 잠금');
  if (excludeIntegration) summary.push('연동 기능 제외');

  return {
    allowExternalRequest,
    singleUiWithLockedBlocks,
    excludeIntegration,
    summary,
  };
}

function buildNextQuestions(defaultQuestions, decisions) {
  const questions = [];
  if (!decisions.allowExternalRequest) {
    questions.push('외부 사용자는 조회만 허용할지, 예약 요청까지 허용할지');
  }
  if (!decisions.singleUiWithLockedBlocks) {
    questions.push('운영 UI를 단일로 통합할지, 유형별로 분리할지');
  }
  if (!decisions.excludeIntegration) {
    questions.push('1차 연동 대상으로 Google Calendar를 즉시 포함할지');
  }
  questions.push('승인/거절 SLA를 몇 시간 기준으로 둘지');
  questions.push('권한 없는 사용자에게 노출할 최소 필드를 무엇으로 제한할지');

  const dedup = [];
  for (const q of [...questions, ...defaultQuestions]) {
    if (!dedup.includes(q)) dedup.push(q);
    if (dedup.length >= 5) break;
  }
  return dedup;
}

function resolveDomainTemplate(domain) {
  if (domain === 'crm') {
    return {
      pushback_point:
        '4주·소규모 예산에서는 채널을 동시에 넓히면 학습 신호가 분산됩니다. 전환이 보이는 퍼널 1개를 먼저 고정해야 합니다.',
      tradeoff_summary:
        '광범위 마케팅을 쓰면 리드 볼륨은 늘지만 전환 품질이 떨어지고, 직접 세일즈에 집중하면 볼륨은 작아도 온보딩 신뢰도가 올라갑니다.',
      alternatives: [
        '대안 A: 아웃바운드 중심(리스트·접촉·데모·온보딩)으로 2주 학습 후 예산 재배분',
        '대안 B: 로컬/한국 타깃을 분리하고 지역별 메시지 실험을 병렬로 운영',
      ],
      scope_cut:
        '이번 턴에서는 브랜딩 대형 캠페인·복잡한 자동화·다중 툴 동시 도입을 제외하고, 4주 내 미팅→온보딩 전환 퍼널만 잠급니다.',
    };
  }

  if (domain === 'calendar') {
    return {
      pushback_point:
        '요구사항을 동시에 모두 만족시키면 운영 복잡도와 품질 리스크가 급증합니다. 우선순위 1개를 먼저 고정해야 합니다.',
      tradeoff_summary:
        '범위를 넓히면 학습/운영 비용이 증가하고, 범위를 줄이면 출시 속도와 검증 밀도를 확보할 수 있습니다.',
      alternatives: [
        '대안 A: 내부 멤버 중심 MVP를 먼저 잠그고 외부 게스트 권한은 2차로 분리',
        '대안 B: 외부 링크 열람만 허용하고 수정 권한은 승인 워크플로우 뒤로 배치',
      ],
      scope_cut:
        '이번 턴에서는 결제/정산·고급 BI·다중 외부 연동을 제외하고 캘린더 핵심 흐름(등록/권한/충돌방지)만 잠급니다.',
    };
  }

  return {
    pushback_point:
      '요구사항을 동시에 넓히면 실행 신호가 흐려집니다. 1차 릴리스 목표를 하나로 잠가야 검증이 가능합니다.',
    tradeoff_summary:
      '범위를 넓히면 초기 학습 속도가 느려지고, 범위를 줄이면 실행-검증 루프를 빠르게 돌릴 수 있습니다.',
    alternatives: [
      '대안 A: 핵심 워크플로우 1개를 먼저 잠그고 운영 로그만 남기는 최소형',
      '대안 B: 사용자 범위를 축소해 품질 검증 후 점진 확장',
    ],
    scope_cut:
      '이번 턴에서는 대형 확장 항목을 제외하고, 핵심 워크플로우/권한/운영 로그의 최소 실행 루프만 잠급니다.',
  };
}
