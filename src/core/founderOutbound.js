/**
 * COS Constitutional Reset — Single outbound gate for all founder-facing Slack posts.
 * This is the ONLY function that may post founder-facing text to Slack.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §7
 */

// GREP_COS_CONSTITUTION_OUTBOUND
// FOUNDERRAWOUTBOUND_FORBIDDEN — grep marker for migration enforcement

import { FOUNDER_SURFACE_VALUES, SAFE_FALLBACK_TEXT } from './founderContracts.js';
import { sanitizeFounderOutput, founderHardBlockRemaining, FOUNDER_HARD_BLOCK_FALLBACK } from '../features/founderSurfaceGuard.js';

const INTERNAL_MARKER_SUBSTRINGS = [
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  'strategy_finance:',
  'risk_review:',
  '참여 페르소나:',
  '협의 모드:',
  'institutional memory',
];
const GENERIC_CLARIFICATION_RE =
  /(조금\s*더\s*구체적으로|최적의\s*경로로\s*안내|원하시면\s*도와드리겠습니다)/u;

function containsInternalMarkers(text) {
  const t = String(text || '');
  return INTERNAL_MARKER_SUBSTRINGS.some((m) => t.includes(m));
}

function emitTrace(fields) {
  try {
    console.info(JSON.stringify({
      stage: 'founder_output_trace',
      ts: new Date().toISOString(),
      ...fields,
    }));
  } catch { /* never crash on diagnostics */ }
}

/**
 * Validate and send a founder-facing response to Slack.
 *
 * @param {{
 *   say?: Function,
 *   client?: { chat: { postMessage: Function } },
 *   channel?: string,
 *   thread_ts?: string,
 *   rendered_text: string,
 *   rendered_blocks?: object[],
 *   surface_type: string,
 *   responder_kind?: string,
 *   intent?: string,
 *   trace?: Record<string, unknown>,
 * }} opts
 */
export async function sendFounderResponse(opts) {
  const {
    say,
    client,
    channel,
    thread_ts,
    rendered_text,
    rendered_blocks,
    surface_type,
    responder_kind = 'founder_kernel',
    intent,
    trace = {},
  } = opts;

  let text = String(rendered_text || '');
  let hardFailReason = null;

  // 1. Contract validation: surface_type must be registered
  if (!FOUNDER_SURFACE_VALUES.has(surface_type)) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'unregistered_surface_type',
      ...trace,
    });
    text = SAFE_FALLBACK_TEXT;
    hardFailReason = 'invariant_breach';
  }

  // 2a. Sanitize: strip legacy Council sections/markers (same guard as finalizeSlackResponse)
  text = sanitizeFounderOutput(text, { responder: responder_kind });

  // 2b. Hard block: if markers survived sanitization, replace entirely
  if (containsInternalMarkers(text) || founderHardBlockRemaining(text)) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'internal_markers_detected_after_sanitize',
      preview: text.slice(0, 200),
      ...trace,
    });
    text = FOUNDER_HARD_BLOCK_FALLBACK;
    hardFailReason = hardFailReason || 'invariant_breach';
  }
  const kickoffLikeSurface = new Set(['executive_kickoff_surface', 'discovery_surface', 'dialogue_surface']);
  if (kickoffLikeSurface.has(surface_type) && GENERIC_CLARIFICATION_RE.test(text)) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'generic_clarification_blocked',
      preview: text.slice(0, 200),
      ...trace,
    });
    text = '[COS] founder 계약 위반(제네릭 완충 문구)으로 차단했습니다. 같은 요청을 다시 보내 주세요.';
    hardFailReason = hardFailReason || 'invariant_breach';
  }

  // 3. Founder emergency safety lock:
  // Block Kit payload can carry unsanitized literals in nested fields.
  // Until a block-level sanitizer is fully verified, founder-facing posts are text-only.
  const hadBlocks = Array.isArray(rendered_blocks) && rendered_blocks.length > 0;
  if (hadBlocks) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'founder_blocks_path_disabled_text_only',
      blocks_count: rendered_blocks.length,
      ...trace,
    });
  }

  // 4. Send via Slack
  try {
    if (say && thread_ts) {
      await say({ text, thread_ts });
    } else if (say) {
      await say(text);
    } else if (client && channel) {
      await client.chat.postMessage({
        channel,
        text,
        ...(thread_ts ? { thread_ts } : {}),
      });
    }
  } catch (err) {
    throw err;
  }

  // 5. Trace log
  emitTrace({
    intent,
    surface_type,
    responder_kind,
    passed_pipeline: true,
    passed_outbound_gate: true,
    passed_renderer: true,
    passed_outbound_validation: hardFailReason == null,
    hard_fail_reason: hardFailReason,
    contains_internal_markers: false,
    rendered_preview: text.slice(0, 200),
    ...trace,
  });

  return text;
}

/**
 * Validate text without sending — for migration compatibility.
 */
export function validateFounderText(text) {
  if (containsInternalMarkers(text)) {
    return { valid: false, text: SAFE_FALLBACK_TEXT };
  }
  return { valid: true, text };
}
