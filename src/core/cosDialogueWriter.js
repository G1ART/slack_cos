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
    next_step:
      '위 핵심 질문만 정렬되면 제가 벤치마크 매트릭스와 MVP 설계안을 바로 좁히고, scope lock 후보안을 제시하겠습니다.',
  };
}
