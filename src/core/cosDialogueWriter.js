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
  const profile = extractHiddenContract(text);
  const reframed = `이건 단순 기능 요청이 아니라 ${profile.domain_hint}가 섞인 운영 문제입니다.`;
  return {
    packet_type: 'dialogue_contract',
    mode,
    reframed_problem: reframed,
    benchmark_axes: profile.benchmark_axes,
    mvp_scope_in: profile.mvp_scope_in,
    mvp_scope_out: profile.mvp_scope_out,
    risk_points: profile.risk_points,
    key_questions: profile.key_questions,
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
    next_step:
      '위 핵심 질문만 정렬되면 제가 벤치마크 매트릭스와 MVP 설계안을 바로 좁히고, scope lock 후보안을 제시하겠습니다.',
  };
}
