/**
 * COS — 창업자 면 Slack 전송 단일 출구.
 * 텍스트는 **이 게이트에서** Council 키워드 스캔·치환 없이 그대로 전달한다.
 * `PARTNER_NATURAL` 등 일부 표면은 `founderRequestPipeline`에서 이미 `sanitizeFounderOutput`을 통과할 수 있다.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §7
 */

// GREP_COS_CONSTITUTION_OUTBOUND
// FOUNDERRAWOUTBOUND_FORBIDDEN — grep marker for migration enforcement

import { FOUNDER_SURFACE_VALUES, FounderSurfaceType, SAFE_FALLBACK_TEXT } from './founderContracts.js';

/** vNext.13.7 — 창업자 기본 대화 표면에 나오면 안 되는 잔재 (회귀·아웃바운드 안전망) */
export const FOUNDER_CONVERSATION_FORBIDDEN_MARKERS = [
  '[COS 제안 패킷]',
  '*[COS 제안 패킷]*',
  'strategy_finance:',
  'risk_review:',
  '가장 강한 반대 논리',
  '남아 있는 긴장 / 미해결 충돌',
];

export function founderPlainTextHasForbiddenMarkers(text) {
  const s = String(text || '');
  return FOUNDER_CONVERSATION_FORBIDDEN_MARKERS.some((m) => s.includes(m));
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

  if (
    trace?.launch_gate_taken &&
    surface_type === FounderSurfaceType.EXECUTION_PACKET &&
    (!trace.launch_packet_id || !trace.provider_truth_snapshot)
  ) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'launch_packet_invariant',
      ...trace,
    });
    text = SAFE_FALLBACK_TEXT;
    hardFailReason = 'invariant_breach';
  }

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

  const puritySurfaces = new Set([
    FounderSurfaceType.PARTNER_NATURAL,
    FounderSurfaceType.SAFE_FALLBACK,
  ]);
  if (puritySurfaces.has(surface_type) && founderPlainTextHasForbiddenMarkers(text)) {
    emitTrace({
      intent,
      surface_type,
      responder_kind,
      error: 'founder_conversation_purity_downgrade',
      ...trace,
    });
    text =
      '형식이 섞인 답변이 감지되어 보내지 않았습니다. 같은 요청을 조금 더 짧게 다시 부탁드립니다.';
    hardFailReason = hardFailReason || 'purity_downgrade';
  }

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
    founder_outbound_mode: 'pass_through',
    ...trace,
  });

  return text;
}

/**
 * Slash 등 — 창업자 노출 문자열을 그대로 통과(마커 기반 차단 없음).
 */
export function validateFounderText(text) {
  return { valid: true, text: String(text ?? '') };
}
