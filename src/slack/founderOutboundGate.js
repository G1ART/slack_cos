/**
 * vNext.10b — 멘션/DM 등 founder-facing 전송 직전 방어 sanitize (finalize 이후 이중 검열).
 * `getInboundTurnTraceStore().finalize.final_responder === 'query'` 이면 조회 계약대로 원문 유지.
 */

import { getInboundTurnTraceStore } from '../features/inboundTurnTrace.js';
import {
  sanitizeFounderOutput,
  containsOldCouncilMarkers,
  containsPersonaLiterals,
  containsApprovalQueueRaw,
  FOUNDER_HARD_BLOCK_FALLBACK,
} from '../features/founderSurfaceGuard.js';
import { logRouterEvent } from '../features/topLevelRouter.js';
import { replyInThread } from './reply.js';

function resolvePostPayload(answer) {
  if (typeof answer === 'string') return { text: answer, blocks: undefined };
  return { text: answer?.text || '', blocks: answer?.blocks };
}

function sanitizeNonQueryFounder(before, debugMode) {
  let out = sanitizeFounderOutput(before, { debugMode, responder: 'executive_surface' });
  const leaked =
    containsOldCouncilMarkers(out) || containsPersonaLiterals(out) || containsApprovalQueueRaw(out);
  if (leaked) {
    logRouterEvent('founder_outbound_gate_hard_fallback', {
      preview: out.slice(0, 200),
      context: 'no_als_or_second_pass',
    });
    return FOUNDER_HARD_BLOCK_FALLBACK;
  }
  return out;
}

/**
 * finalize 를 거치지 않은 것으로 보이면 로그·엄격 모드에서 throw.
 * @param {string} rawText
 * @returns {string}
 */
export function gateFounderFacingTextForSlackPost(rawText) {
  const store = getInboundTurnTraceStore();
  const debugMode = process.env.COS_DEBUG_MODE === '1';
  const before = String(rawText ?? '');

  if (!store) {
    return sanitizeNonQueryFounder(before, debugMode);
  }

  const fin = store.finalize;
  const responder = fin?.final_responder ?? '';

  if (!responder && process.env.COS_ENFORCE_FOUNDER_GATE === '1') {
    const err = new Error(
      'founder_outbound_gate: handleUserText 경로가 finalizeSlackResponse 를 거치지 않았습니다 (finalize 비어 있음).'
    );
    logRouterEvent('founder_outbound_gate_violation', {
      reason: 'missing_finalize',
      preview: before.slice(0, 160),
    });
    throw err;
  }

  if (responder === 'query') {
    return before;
  }

  const out = sanitizeFounderOutput(before, { debugMode, responder: 'executive_surface' });
  const leaked =
    containsOldCouncilMarkers(out) || containsPersonaLiterals(out) || containsApprovalQueueRaw(out);
  if (leaked) {
    logRouterEvent('founder_outbound_gate_hard_fallback', {
      preview: out.slice(0, 200),
      had_finalize_responder: responder || null,
    });
    return FOUNDER_HARD_BLOCK_FALLBACK;
  }

  if (
    process.env.COS_ENFORCE_FOUNDER_GATE === '1' &&
    (containsOldCouncilMarkers(before) || containsPersonaLiterals(before) || containsApprovalQueueRaw(before)) &&
    before === out
  ) {
    const err = new Error('founder_outbound_gate: sanitize 가 Council 잔존을 제거하지 못했습니다.');
    logRouterEvent('founder_outbound_gate_violation', { reason: 'sanitize_incomplete', preview: before.slice(0, 200) });
    throw err;
  }

  return out;
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
    Array.isArray(blocks) && blocks.length ? { text: safeText, blocks } : safeText
  );
}
