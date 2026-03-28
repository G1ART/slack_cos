/**
 * Top-level Slack responder lockdown — planner/query vs Council 불변식.
 * @see docs/cursor-handoffs/Router_Lockdown_260318_handoff.md
 */

import { markInboundTurnFinalize } from './inboundTurnTrace.js';
import { getBuildInfo } from '../runtime/buildInfo.js';
import { isActiveProjectIntake, getProjectIntakeSession } from './projectIntakeSession.js';

const COUNCIL_SYNTHESIS_MARKERS = [
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '종합 추천안',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '- 협의 모드:',
];

const WORK_CANDIDATE_FOOTER = '실행 작업 후보로 보입니다';

/**
 * Council synthesizeCouncil 본문 또는 inferWorkCandidate 푸터와 유사하면 true.
 * @param {string} text
 */
/** 조회 계약 헤더 — 저장된 plan/work 본문에 Council 키워드가 섞여도 오탐하지 않음 */
const QUERY_CONTRACT_HEADER_RE =
  /^\[계획상세\]|\[계획진행\]|\[계획발행목록\]|\[업무상세\]|\[업무검토\]/;

export function looksLikeCouncilSynthesisBody(text) {
  const t = String(text || '');
  const head = t.trimStart();
  if (QUERY_CONTRACT_HEADER_RE.test(head)) return false;
  if (t.includes(WORK_CANDIDATE_FOOTER)) return true;
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
 * 비-Council 응답에 Council 시그니처가 섞이면 안전한 짧은 오류로 대체.
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
  } = p;

  let out = String(text ?? '');
  const blocked =
    council_blocked ??
    [
      'planner',
      'query',
      'help',
      'error',
      'single',
      'legacy_single',
      'navigator',
      'dialog',
      'executive_surface',
      'structured',
    ].includes(responder);

  // 조회(formatPlanDetail 등)는 저장 필드에 Council류 문구가 섞여도 **절대** 여기서 덮어쓰지 않음
  if (responder !== 'council' && responder !== 'query' && looksLikeCouncilSynthesisBody(out)) {
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
  });

  try {
    const _bi = getBuildInfo();
    const via = p.via || command_name || response_type;
    console.info(`[G1COS ROUTE END] sha=${_bi.release_sha_short} responder=${responder} via=${via} response_type=${response_type} council_blocked=${blocked}`);
  } catch { /* never crash on diagnostics */ }

  markInboundTurnFinalize({
    responder,
    command_name,
    target_id,
    response_type,
    packet_id: packet_id ?? null,
    status_packet_id: status_packet_id ?? null,
    work_queue_id: work_queue_id ?? null,
  });

  return out;
}
