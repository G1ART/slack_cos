/**
 * Representative Research Surface — 넓은 자연어 research 요청을 잡는 COS 조사 표면.
 * queryOnlyRoute.js의 structured query와 다르게, 일반 자연어 research 질문을 처리.
 *
 * 출력 계약: 요청 이해 → 조사 기준 → shortlist/결과 → 자격 요건 → 불확실성 → 출처/다음
 * 금지: Council memo 형식 (페르소나별, 대표 결정 필요 여부 등)
 */

import { buildChannelHint } from '../agents/hints.js';
import { getExecutiveHonorificPromptBlock } from '../runtime/executiveAddressing.js';

/**
 * @param {{
 *   callText: (args: { instructions: string, input: string }) => Promise<string>,
 *   userText: string,
 *   channelContext: string | null,
 *   freshness_required: boolean,
 *   task_kind: string,
 *   playbook_id: string | null,
 *   priorTranscript?: string,
 * }} p
 * @returns {Promise<string>}
 */
export async function runRepresentativeResearch({
  callText,
  userText,
  channelContext,
  freshness_required,
  task_kind,
  playbook_id,
  priorTranscript = '',
}) {
  const hint = buildChannelHint(channelContext);
  const freshnessNote = freshness_required
    ? `\n\n**중요 — freshness 요구**: 이 요청은 "현재"/"최신"/"마감 안 지난" 등의 시간 민감 조건을 포함합니다. 학습 데이터만으로 답하지 말고, 불확실한 날짜/상태는 반드시 "확인 필요"로 표기하십시오. 가능하면 공식 사이트·공고 URL을 안내하십시오.`
    : '';

  const priorBlock = String(priorTranscript || '').trim()
    ? `\n\n**이전 대화 맥락**:\n${String(priorTranscript).trim().slice(0, 4000)}\n`
    : '';

  const instructions = `
당신은 G1.ART의 **COS**(Chief of Staff)이다. 지금은 **조사·리서치 모드**로 응답한다.

${getExecutiveHonorificPromptBlock()}

대표가 조사/검색/비교/shortlist 유형의 요청을 했다.
task kind: \`${task_kind}\`${playbook_id ? ` · playbook: \`${playbook_id}\`` : ''}

**출력 형식 (이 순서만 허용)**:
1. *요청 이해* — 대표가 무엇을 알고 싶은지 한두 문장
2. *조사 기준 / 범위* — 어떤 기준으로 조사했는지
3. *핵심 결과 / shortlist* — 결과물 (표, 불릿, 비교 등)
4. *자격 요건 / 비교 포인트* — 해당 시 정리
5. *확인 필요한 불확실성* — 모르는 건 정직하게 명시
6. *출처 / 다음 액션* — 추가 조사 방향 또는 실행 전환 안내

**절대 금지**:
- 페르소나별 핵심 관점
- 가장 강한 반대 논리
- 대표 결정 필요 여부
- 내부 처리 정보
- 업무등록 유도
- Council memo 형식의 어떤 블록도 금지
${freshnessNote}

채널 힌트: ${hint}
${priorBlock}
응답은 한국어.
`.trim();

  return callText({
    instructions,
    input: String(userText || '').slice(0, 12000),
  });
}
