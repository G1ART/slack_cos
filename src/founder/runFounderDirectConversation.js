/**
 * Founder 대화: thread raw memory + execution ledger + Responses API tool loop (thin coordinator).
 */

import { runHarnessOrchestration } from './harnessBridge.js';
import { invokeExternalTool } from './toolPlane/dispatchExternalToolCall.js';
import { readExecutionSummary } from './executionLedger.js';
import { formatAdapterReadinessCompactLines } from './toolPlane/toolLaneReadiness.js';
import { buildSystemInstructions } from './founderSystemInstructions.js';
import { buildFounderConversationInput } from './founderConversationInput.js';
import { runFounderToolLoop } from './founderToolLoop.js';

export { runHarnessOrchestration, invokeExternalTool };

export { validateToolCallArgs } from './toolPlane/cosFounderToolValidation.js';
export {
  collectOpenAiStrictSchemaViolations,
  getOpenAiStrictViolationsForCosTools,
  getDelegateHarnessTeamParametersSnapshot,
  getDelegateBootSchemaSnapshot,
} from './toolPlane/cosFounderToolSchemaAudit.js';
export { handleReadExecutionContext } from './founderCosToolHandlers.js';
export { buildSystemInstructions } from './founderSystemInstructions.js';
export { buildFounderConversationInput } from './founderConversationInput.js';

/**
 * 레거시 상수 — 과거에는 슬랙에 접수 한 줄만 보냄. 현재는 모델 `text`가 슬랙 본문으로 나감.
 * @deprecated 회귀·문서 호환용; 신규 코드는 `runFounderDirectConversation` 의 `text` 사용.
 */
export const FOUNDER_SAME_TURN_ACK_TEXT = '요청을 접수했습니다.';

/**
 * @param {{
 *   openai: import('openai').default,
 *   model: string,
 *   constitutionMarkdown: string,
 *   constitutionSha256: string,
 *   userText: string,
 *   attachmentResults: { filename: string, ok: boolean, summary?: string, reason?: string }[],
 *   metadata: Record<string, unknown>,
 *   recentTurns: { role: string, text: string, attachments?: object[], ts?: string }[],
 *   threadKey: string,
 *   userText?: string,
 * }} ctx
 */
export async function runFounderDirectConversation(ctx) {
  const tk = String(ctx.threadKey || '');
  const executionSummaryLines = tk ? await readExecutionSummary(tk, 5) : [];
  const adapterReadinessLines = await formatAdapterReadinessCompactLines(process.env, 6, tk);

  const instructions = buildSystemInstructions(ctx.constitutionMarkdown);
  const initialInput = buildFounderConversationInput({
    recentTurns: ctx.recentTurns || [],
    userText: ctx.userText,
    attachmentResults: ctx.attachmentResults || [],
    metadata: ctx.metadata || {},
    executionSummaryLines,
    adapterReadinessLines,
  });

  const { text } = await runFounderToolLoop(ctx.openai, ctx.model, instructions, initialInput, tk, {
    founderRequestSummary: String(ctx.userText || '').slice(0, 500),
  });

  console.info(
    JSON.stringify({
      stage: 'cos_turn',
      constitution_sha256: ctx.constitutionSha256,
      output_chars: text.length,
      response_preview: text.slice(0, 160),
    }),
  );

  return { text, starter_ack: text };
}
