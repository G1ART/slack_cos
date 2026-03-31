/**
 * COS Constitutional Reset — Single outbound gate for all founder-facing Slack posts.
 * This is the ONLY function that may post founder-facing text to Slack.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §7
 */

// GREP_COS_CONSTITUTION_OUTBOUND
// FOUNDERRAWOUTBOUND_FORBIDDEN — grep marker for migration enforcement

import { FOUNDER_SURFACE_VALUES, SAFE_FALLBACK_TEXT } from './founderContracts.js';

const INTERNAL_MARKER_SUBSTRINGS = [
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '핵심 리스크',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  'strategy_finance:',
  'risk_review:',
  '참여 페르소나:',
];

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
    responder_kind = 'pipeline',
    intent,
    trace = {},
  } = opts;

  let text = String(rendered_text || '');

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
  }

  // 2. Hard block: internal markers must not reach founder
  if (containsInternalMarkers(text)) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'internal_markers_detected',
      preview: text.slice(0, 200),
      ...trace,
    });
    text = SAFE_FALLBACK_TEXT;
  }

  // 3. Build Slack payload
  const blocks = Array.isArray(rendered_blocks) && rendered_blocks.length
    ? rendered_blocks
    : undefined;
  const payload = blocks ? { text, blocks } : text;

  // 4. Send via Slack
  try {
    if (say && thread_ts) {
      await say({ text, ...(blocks ? { blocks } : {}), thread_ts });
    } else if (say) {
      await say(payload);
    } else if (client && channel) {
      await client.chat.postMessage({
        channel,
        text,
        ...(blocks ? { blocks } : {}),
        ...(thread_ts ? { thread_ts } : {}),
      });
    }
  } catch (err) {
    if (blocks && /invalid_blocks|block_kit|action_id.*already exists/i.test(err?.message || '')) {
      // Blocks validation error — retry text-only
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
    } else {
      throw err;
    }
  }

  // 5. Trace log
  emitTrace({
    intent,
    surface_type,
    responder_kind,
    passed_pipeline: true,
    passed_outbound_gate: true,
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
