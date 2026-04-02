/**
 * Top-level Slack responder lockdown — planner/query vs Council 불변식.
 * @see docs/cursor-handoffs/Router_Lockdown_260318_handoff.md
 *
 * vNext.10 — founder_output_trace, council 예외 제거( query 만 휴리스틱 스킵 ).
 */

import { markInboundTurnFinalize, getInboundTurnTraceStore } from './inboundTurnTrace.js';
import { getBuildInfo } from '../runtime/buildInfo.js';
import {
  sanitizeFounderOutput,
  isCanonicalSurface,
  containsOldCouncilMarkers,
  containsPersonaLiterals,
  containsApprovalQueueRaw,
} from './founderSurfaceGuard.js';

const COUNCIL_SYNTHESIS_MARKERS = [
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '종합 추천안',
  '대표 결정 필요 여부',
  '한 줄 요약',
];

/** 단독으로도 다각 메모 누수로 본다 (hits>=2보다 먼저 검사) */
const COUNCIL_SYNTHESIS_STRONG_LINE = [
  '내부 처리 정보',
  '참여 페르소나:',
  '협의 모드: council',
  'matrix trigger:',
  'institutional memory',
];

const WORK_CANDIDATE_FOOTER = '실행 작업 후보로 보입니다';

/** 조회 계약 헤더 — 저장된 plan/work 본문에 Council 키워드가 섞여도 오탐하지 않음 */
const QUERY_CONTRACT_HEADER_RE =
  /^\[계획상세\]|\[계획진행\]|\[계획발행목록\]|\[업무상세\]|\[업무검토\]/;
const SYSTEM_RESPONDERS = new Set([
  'council',
  'query',
  'planner',
  'help',
  'error',
  'single',
  'legacy_single',
  'navigator',
  'structured',
  'executive_surface',
  'execution_spine',
  'execution_running_surface',
  'execution_reporting_surface',
  'escalation_surface',
  'runtime_meta_surface',
  'meta_debug_surface',
]);

export function looksLikeCouncilSynthesisBody(text) {
  const t = String(text || '');
  const head = t.trimStart();
  if (QUERY_CONTRACT_HEADER_RE.test(head)) return false;
  if (t.includes(WORK_CANDIDATE_FOOTER)) return true;
  for (const s of COUNCIL_SYNTHESIS_STRONG_LINE) {
    if (t.includes(s)) return true;
  }
  let hits = 0;
  for (const m of COUNCIL_SYNTHESIS_MARKERS) {
    if (t.includes(m)) hits += 1;
  }
  return hits >= 2;
}

/**
 * @param {string} event
 * @param {Record<string, unknown>} [fields]
 */
export function logRouterEvent(event, fields = {}) {
  try {
    console.info(
      JSON.stringify({
        stage: event,
        ts: new Date().toISOString(),
        ...fields,
      })
    );
  } catch {
    console.info('[router]', event, fields);
  }
}

/**
 * 테스트·검증용 — founder_output_trace 페이로드 빌더.
 */
export function buildFounderOutputTraceRecord({
  inbound_turn_id,
  responder,
  response_type,
  source_formatter,
  slack_route_label,
  raw_before_sanitize,
  sanitized,
  raw_for_detection,
  passed_finalize,
  passed_sanitize,
  passed_outbound_validation,
  validation_error_code,
  /** false 이면 Council/페르소나 휴리스틱 스캔 생략(창업자 면 pass-through 정책) */
  leak_scan = true,
}) {
  const route_label = slack_route_label ?? null;
  const rawDet = raw_for_detection ?? '';
  return {
    stage: 'founder_output_trace',
    inbound_turn_id: inbound_turn_id ?? null,
    responder,
    response_type,
    source_formatter: source_formatter ?? 'unspecified',
    slack_route_label: route_label,
    route_label,
    passed_finalize: passed_finalize !== false,
    passed_sanitize: passed_sanitize !== false,
    passed_outbound_validation: passed_outbound_validation !== false,
    validation_error_code: validation_error_code ?? null,
    raw_preview: String(raw_before_sanitize ?? '').slice(0, 160),
    sanitized_preview: String(sanitized ?? '').slice(0, 160),
    contains_old_council_markers: leak_scan ? containsOldCouncilMarkers(rawDet) : false,
    contains_persona_literals: leak_scan ? containsPersonaLiterals(rawDet) : false,
    contains_approval_queue: leak_scan ? containsApprovalQueueRaw(rawDet) : false,
  };
}

/**
 * @param {{
 *   responder: string,
 *   text: string,
 *   raw_text?: string,
 *   normalized_text?: string,
 *   command_name?: string | null,
 *   target_id?: string | null,
 *   planner_match?: boolean,
 *   query_match?: boolean,
 *   response_type?: string,
 *   source_used?: string | null,
 *   council_blocked?: boolean | null,
 *   footer_blocked?: boolean,
 *   packet_id?: string | null,
 *   status_packet_id?: string | null,
 *   work_queue_id?: string | null,
 *   via?: string | null,
 *   source_formatter?: string,
 *   slack_route_label?: string | null,
 *   founder_route?: boolean,
 * }} p
 */
export function finalizeSlackResponse(p) {
  const {
    responder,
    text,
    raw_text = '',
    normalized_text = '',
    command_name = null,
    target_id = null,
    planner_match = false,
    query_match = false,
    response_type = 'ok',
    source_used = null,
    council_blocked = null,
    footer_blocked = false,
    packet_id = null,
    status_packet_id = null,
    work_queue_id = null,
    founder_route = false,
  } = p;

  const sourceFormatter = p.source_formatter ?? 'unspecified';
  const traceStore = getInboundTurnTraceStore();
  const slackRouteLabel = p.slack_route_label ?? traceStore?.slack_route_label ?? null;
  const founderSlackSurface =
    slackRouteLabel === 'dm_ai_router' || slackRouteLabel === 'mention_ai_router';

  let out = String(text ?? '');
  const rawForTraceDetection = out;
  let skipSanitize = false;
  let passedOutboundValidation = true;
  /** @type {string | null} */
  let validationErrorCode = null;

  /** 창업자 면(DM/멘션): 본문 Council 휴리스틱·sanitize·형식 하드킬 없음(pass-through). */
  const founderPassThrough = founder_route === true || founderSlackSurface;

  if (founder_route === true && responder === 'council') {
    out =
      '창업자 founder 경로에서는 council이 비활성화되어 있습니다. 평문으로 다시 보내 주세요.';
    validationErrorCode = 'founder_council_hard_block';
    passedOutboundValidation = false;
  }

  const blocked =
    council_blocked ??
    (SYSTEM_RESPONDERS.has(responder) ||
      responder === 'dialog' ||
      responder === 'partner_surface' ||
      responder === 'research_surface');

  // 조회(query)만 예외 — council 포함 전 responder 동일 차단 (vNext.10b). 창업자 면은 스캔 안 함.
  const councilShapeLeak =
    !founderPassThrough &&
    responder !== 'query' &&
    (looksLikeCouncilSynthesisBody(out) ||
      containsOldCouncilMarkers(out) ||
      containsPersonaLiterals(out) ||
      containsApprovalQueueRaw(out));
  if (councilShapeLeak) {
    logRouterEvent('final_response_council_leak_detected', {
      responder,
      command_name,
      target_id,
      preview: out.slice(0, 240),
    });
    out =
      responder === 'planner'
        ? '[계획등록] 응답 검증 오류 — Council 혼입이 감지되어 차단했습니다. 관리자에게 알려주세요.'
        : '[COS] 응답 검증 오류 — Council 혼입이 감지되어 차단했습니다. 관리자에게 알려주세요.';
  }

  logRouterEvent('final_response_return', {
    raw_text: String(raw_text).slice(0, 400),
    normalized_text: String(normalized_text).slice(0, 400),
    command_name,
    target_id,
    planner_match,
    query_match,
    responder,
    source_used,
    council_blocked: blocked,
    response_type,
    footer_blocked,
    packet_id: packet_id ?? null,
    status_packet_id: status_packet_id ?? null,
    work_queue_id: work_queue_id ?? null,
    source_formatter: sourceFormatter,
    slack_route_label: slackRouteLabel,
  });

  try {
    const _bi = getBuildInfo();
    const via = p.via || command_name || response_type;
    console.info(`[G1COS ROUTE END] sha=${_bi.release_sha_short} responder=${responder} via=${via} response_type=${response_type} council_blocked=${blocked}`);
  } catch {
    /* never crash on diagnostics */
  }

  markInboundTurnFinalize({
    responder,
    command_name,
    target_id,
    response_type,
    packet_id: packet_id ?? null,
    status_packet_id: status_packet_id ?? null,
    work_queue_id: work_queue_id ?? null,
    passed_finalize: true,
    passed_renderer: isCanonicalSurface(responder) || SYSTEM_RESPONDERS.has(responder),
    passed_sanitize: !skipSanitize,
    passed_outbound_validation: passedOutboundValidation,
    validation_error_code: validationErrorCode,
  });

  if (!isCanonicalSurface(responder) && !SYSTEM_RESPONDERS.has(responder)) {
    logRouterEvent('non_canonical_surface_blocked', {
      original_responder: responder,
      action: 'force_safe_fallback',
    });
    out = '[COS] 응답을 처리하는 중 내부 경로 오류가 발생했습니다. 다시 시도해 주세요.';
  }

  const rawBeforeSanitize = out;
  const debugMode = process.env.COS_DEBUG_MODE === '1';
  if (!skipSanitize && !founderPassThrough) {
    out = sanitizeFounderOutput(out, { debugMode, responder });
  }

  try {
    const tracePayload = buildFounderOutputTraceRecord({
      inbound_turn_id: traceStore?.turn_id ?? null,
      responder,
      response_type,
      source_formatter: sourceFormatter,
      slack_route_label: slackRouteLabel,
      raw_before_sanitize: rawBeforeSanitize,
      sanitized: out,
      raw_for_detection: rawForTraceDetection,
      passed_finalize: true,
      passed_sanitize: true,
      passed_outbound_validation: passedOutboundValidation,
      validation_error_code: validationErrorCode,
      leak_scan: !founderPassThrough,
    });
    console.info(JSON.stringify(tracePayload));
  } catch {
    /* never crash */
  }

  return out;
}
