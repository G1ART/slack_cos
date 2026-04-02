/**
 * 멘션/DM 등 founder-facing 전송 직전 게이트.
 * COS 정책: 본문에 대한 Council 키워드 스캔·sanitize 없이 그대로 통과한다.
 * `COS_ENFORCE_FOUNDER_GATE=1` 일 때는 finalize 메타 존재만 검사(레거시 계약).
 */

import { getInboundTurnTraceStore } from '../features/inboundTurnTrace.js';
import { logRouterEvent } from '../features/topLevelRouter.js';
import { replyInThread } from './reply.js';

function resolvePostPayload(answer) {
  if (typeof answer === 'string') return { text: answer, blocks: undefined };
  return { text: answer?.text || '', blocks: answer?.blocks };
}

/**
 * finalize 를 거치지 않은 것으로 보이면 로그·엄격 모드에서 throw.
 * @param {string} rawText
 * @returns {string}
 */
export function gateFounderFacingTextForSlackPost(rawText) {
  const store = getInboundTurnTraceStore();
  const before = String(rawText ?? '');

  if (!store && process.env.COS_ENFORCE_FOUNDER_GATE === '1') {
    const err = new Error(
      'founder_outbound_gate: handleUserText 경로가 finalizeSlackResponse 를 거치지 않았습니다 (finalize 비어 있음).',
    );
    logRouterEvent('founder_outbound_gate_violation', {
      reason: 'missing_finalize',
      preview: before.slice(0, 160),
    });
    throw err;
  }

  const fin = store?.finalize;
  const responder = fin?.final_responder ?? '';

  if (!responder && process.env.COS_ENFORCE_FOUNDER_GATE === '1') {
    const err = new Error(
      'founder_outbound_gate: handleUserText 경로가 finalizeSlackResponse 를 거치지 않았습니다 (finalize 비어 있음).',
    );
    logRouterEvent('founder_outbound_gate_violation', {
      reason: 'missing_finalize',
      preview: before.slice(0, 160),
    });
    throw err;
  }

  return before;
}

/**
 * app_mention / 동일 패턴 — replyInThread 전 단일 게이트.
 * @param {import('@slack/bolt').SayFn} say
 * @param {string} threadTs
 * @param {string | { text?: string, blocks?: object[] }} answer
 */
export async function postFounderGatedThreadReply(say, threadTs, answer) {
  const { text: rawText, blocks } = resolvePostPayload(answer);
  const safeText = gateFounderFacingTextForSlackPost(rawText);
  await replyInThread(
    say,
    threadTs,
    Array.isArray(blocks) && blocks.length ? { text: safeText, blocks } : safeText,
  );
}
