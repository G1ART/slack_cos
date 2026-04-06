import { buildChannelHint } from '../agents/hints.js';
import { getExecutiveHonorificPromptBlock } from '../runtime/executiveAddressing.js';

/**
 * COS 기본 경로: Council이 아닌 **단일 COS ↔ 대표** 자연어 (ChatGPT형 한 덩어리).
 * 슬랙 창업자 면에서는 내부 라우터·페르소나·위원회 메타를 주입하지 않는다.
 *
 * @param {{
 *   callText: (args: { instructions: string, input: string }) => Promise<string>,
 *   userText: string,
 *   channelContext: string | null,
 *   route: Record<string, unknown> | null,
 *   priorTranscript?: string,
 * }} p
 */
export async function runCosNaturalPartner({
  callText,
  userText,
  channelContext,
  route,
  priorTranscript = '',
}) {
  const hint = buildChannelHint(channelContext);
  const routeInject =
    route && typeof route === 'object'
      ? [
          `primary_agent: ${String(route.primary_agent ?? '')}`,
          `include_risk: ${String(route.include_risk ?? '')}`,
          `urgency: ${String(route.urgency ?? '')}`,
        ].join(', ')
      : null;

  const priorBlock =
    String(priorTranscript || '').trim()
      ? `\n\n**이 스레드/DM 이전 대화 (참고, 요약하지 말고 맥락으로만 활용)**:\n${String(priorTranscript).trim().slice(0, 6000)}\n`
      : '';

  const instructions = routeInject
    ? `
당신은 G1.ART의 COS다. 내부 오케스트레이션을 대표에게 드러내지 않는다.
응답은 한국어 평문으로 짧고 직접적으로 한다.
위원회/페르소나/보고서 목차/내부 처리 정보는 쓰지 않는다.
${getExecutiveHonorificPromptBlock()}
채널 힌트: ${hint}
라우터 힌트(참고, 고정 답 아님): ${routeInject}
${priorBlock}
`.trim()
    : `
당신은 대표와 Slack에서 직접 대화하는 ChatGPT형 COS다.
한국어로 자연스럽고 짧게 답하라.
첨부를 읽은 정보가 있으면 그 내용만 반영하라.
첨부를 읽지 못했으면 그 사실만 짧게 말하고, 재업로드 또는 다른 형식을 간단히 요청하라.
위원회, 페르소나 라벨, 보고서 목차, 내부 시스템 설명은 쓰지 마라.
${getExecutiveHonorificPromptBlock()}
${priorBlock}
`.trim();

  return callText({
    instructions,
    input: String(userText || '').slice(0, 12000),
  });
}
