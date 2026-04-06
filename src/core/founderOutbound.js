/**
 * COS — 창업자 면 Slack 전송 단일 출구.
 * vNext.13.10 — `partner_natural_surface` / `safe_fallback_surface` 에 대해 **`thinFounderSlackSurface`** 만.
 * vNext.13.14 — founder_route 송신: 메타 계약·Council류 마커 차단·`founder_output_trace` 선기록(실패 시 Slack 미송신).
 * @see docs/architecture/COS_CONSTITUTION_v1.md §7
 */

// GREP_COS_CONSTITUTION_OUTBOUND
// FOUNDERRAWOUTBOUND_FORBIDDEN — grep marker for migration enforcement

import crypto from 'node:crypto';
import { FOUNDER_SURFACE_VALUES, FounderSurfaceType, SAFE_FALLBACK_TEXT } from './founderContracts.js';
import { thinFounderSlackSurface } from '../features/founderSurfaceGuard.js';
import { getBuildInfo } from '../runtime/buildInfo.js';
import { assertFounderEgressOnly } from '../founder/founderEgressLock.js';

/** vNext.13.8 — 최후 안전망만 */
export const FOUNDER_CONVERSATION_FORBIDDEN_MARKERS = ['[COS 제안 패킷]', '*[COS 제안 패킷]*'];

/** vNext.13.14 — Council/페르소나 잔재 차단(부분 문자열) */
export const FOUNDER_EGRESS_BLOCK_MARKERS = [
  '한 줄 요약',
  '종합 추천안',
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장 / 미해결 충돌',
  '핵심 리스크',
  '다음 행동',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '협의 모드',
  '참여 페르소나',
  'strategy_finance',
  'risk_review',
  'ops_grants',
  'product_ux',
];

export function founderPlainTextHasForbiddenMarkers(text) {
  const s = String(text || '');
  return FOUNDER_CONVERSATION_FORBIDDEN_MARKERS.some((m) => s.includes(m));
}

export function founderTextContainsCouncilEgressMarkers(text) {
  const s = String(text || '');
  return FOUNDER_EGRESS_BLOCK_MARKERS.some((m) => s.includes(m));
}

function shortTextHash(text) {
  return crypto.createHash('sha256').update(String(text || ''), 'utf8').digest('hex').slice(0, 16);
}

function emitTraceLoose(fields) {
  try {
    console.info(
      JSON.stringify({
        stage: 'founder_output_trace',
        ts: new Date().toISOString(),
        ...fields,
      }),
    );
  } catch {
    /* never crash on diagnostics */
  }
}

/**
 * founder_route strict: 로깅 실패 시 예외 전파 → Slack 송신 중단.
 * @param {Record<string, unknown>} fields
 */
export function emitFounderOutputTraceStrict(fields) {
  const line = JSON.stringify({
    stage: 'founder_output_trace',
    ts: new Date().toISOString(),
    ...fields,
  });
  console.info(line);
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
 *   metadata?: Record<string, unknown>,
 * }} opts
 */
export async function sendFounderResponse(opts) {
  assertFounderEgressOnly(opts.metadata, 'sendFounderResponse');

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
  } = opts;
  const md = opts.metadata && typeof opts.metadata === 'object' ? opts.metadata : {};
  const founderStrict = md.founder_route === true;

  if (founderStrict) {
    if (!String(md.founder_surface_source || '').trim()) {
      const err = new Error('founder_egress_contract_missing_founder_surface_source');
      err.code = 'founder_egress_contract_missing_founder_surface_source';
      throw err;
    }
    if (!String(md.pipeline_version || '').trim()) {
      const err = new Error('founder_egress_contract_missing_pipeline_version');
      err.code = 'founder_egress_contract_missing_pipeline_version';
      throw err;
    }
    if (!String(md.egress_caller || '').trim()) {
      const err = new Error('founder_egress_contract_missing_egress_caller');
      err.code = 'founder_egress_contract_missing_egress_caller';
      throw err;
    }
  }

  let trace = opts.trace && typeof opts.trace === 'object' ? { ...opts.trace } : {};

  let text = String(rendered_text || '');
  let hardFailReason = null;

  if (!FOUNDER_SURFACE_VALUES.has(surface_type)) {
    emitTraceLoose({
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
    emitTraceLoose({
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
    emitTraceLoose({
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
    emitTraceLoose({
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

  if (puritySurfaces.has(surface_type) && hardFailReason == null) {
    if (founderStrict && founderTextContainsCouncilEgressMarkers(text)) {
      emitTraceLoose({
        intent,
        surface_type,
        responder_kind,
        error: 'founder_council_egress_blocked',
        contains_block_markers: true,
        rendered_preview: text.slice(0, 200),
        egress_phase: 'before_thin_surface',
        ...trace,
      });
      const err = new Error('founder_council_egress_blocked');
      err.code = 'founder_council_egress_blocked';
      throw err;
    }
    const beforePurity = text;
    text = thinFounderSlackSurface(beforePurity);
    if (text !== beforePurity) {
      trace = { ...trace, founder_outbound_purity_adjusted: true };
    }
  }

  if (founderStrict && founderTextContainsCouncilEgressMarkers(text)) {
    emitTraceLoose({
      intent,
      surface_type,
      responder_kind,
      error: 'founder_council_egress_blocked',
      contains_block_markers: true,
      rendered_preview: text.slice(0, 200),
      egress_phase: 'after_processing',
      ...trace,
    });
    const err = new Error('founder_council_egress_blocked');
    err.code = 'founder_council_egress_blocked';
    throw err;
  }

  const containsBlockMarkers = founderTextContainsCouncilEgressMarkers(text);

  const bi = getBuildInfo();
  const boot_id = `boot_${bi.started_at}_${bi.pid}`;
  const instance_id = `${bi.hostname}:${bi.pid}`;

  if (founderStrict) {
    const egressPayload = {
      intent,
      surface_type,
      responder_kind,
      passed_pipeline: true,
      passed_outbound_gate: true,
      passed_renderer: true,
      passed_outbound_validation: hardFailReason == null,
      hard_fail_reason: hardFailReason,
      contains_internal_markers: false,
      text_hash: shortTextHash(text),
      rendered_preview: text.slice(0, 200),
      contains_block_markers: containsBlockMarkers,
      egress_caller: String(md.egress_caller || ''),
      runtime_sha: bi.release_sha_short,
      boot_id,
      instance_id,
      founder_outbound_mode: 'pass_through',
      ...trace,
    };
    emitFounderOutputTraceStrict(egressPayload);
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

  if (!founderStrict) {
    emitTraceLoose({
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
  }

  return text;
}

/**
 * Slash 등 — 창업자 노출 문자열을 그대로 통과(마커 기반 차단 없음).
 */
export function validateFounderText(text) {
  return { valid: true, text: String(text ?? '') };
}
