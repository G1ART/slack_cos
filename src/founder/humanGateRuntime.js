/**
 * W8-B — Human-gate runtime (resumable).
 *
 * openResumableGate/closeGateAndResume 는 W5-B openHumanGate/closeHumanGate 를 재사용하면서
 * continuation_* 필드를 함께 저장·소비한다.
 *
 * 중요: **자동 재개 금지** (헌법 §2: 코드는 경계 결정만). 이 모듈은
 *   - gate row 에 continuation_packet_id/run_id/thread_key 를 기록하고
 *   - detectGateCompletion 으로 "close 가능 여부" 만 판단한다.
 *   - 실제 재개는 운영자 턴 또는 supervisor tick 에서 수행한다.
 */

import {
  openHumanGate as storeOpenHumanGate,
  closeHumanGate as storeCloseHumanGate,
  listOpenHumanGates,
  PROJECT_SPACE_GATE_KINDS,
} from './projectSpaceBindingStore.js';

function asString(v) {
  return v == null ? '' : String(v);
}

function trim(v) {
  return asString(v).trim();
}

/**
 * @param {{
 *   project_space_key: string,
 *   gate_kind: string,
 *   gate_reason?: string|null,
 *   gate_action?: string|null,
 *   opened_by_run_id?: string|null,
 *   workspace_key?: string|null,
 *   product_key?: string|null,
 *   parcel_deployment_key?: string|null,
 *   continuation_packet_id?: string|null,
 *   continuation_run_id?: string|null,
 *   continuation_thread_key?: string|null,
 *   required_human_action?: string|null,
 * }} input
 */
export async function openResumableGate(input) {
  if (!PROJECT_SPACE_GATE_KINDS.includes(trim(input && input.gate_kind))) {
    throw new Error(
      `openResumableGate: gate_kind must be one of ${PROJECT_SPACE_GATE_KINDS.join('|')}`,
    );
  }
  return storeOpenHumanGate({
    project_space_key: trim(input.project_space_key),
    gate_kind: trim(input.gate_kind),
    gate_reason: input.gate_reason ?? null,
    gate_action: input.gate_action ?? null,
    opened_by_run_id: input.opened_by_run_id ?? null,
    workspace_key: input.workspace_key ?? null,
    product_key: input.product_key ?? null,
    parcel_deployment_key: input.parcel_deployment_key ?? null,
    continuation_packet_id: input.continuation_packet_id ?? null,
    continuation_run_id: input.continuation_run_id ?? null,
    continuation_thread_key: input.continuation_thread_key ?? null,
    required_human_action: input.required_human_action ?? null,
  });
}

/**
 * gate close + continuation meta 를 함께 반환. **자동 재개 금지** — 호출자(lane/supervisor)가
 * continuation_run_id 등을 보고 "어떤 run/packet 을 깨울지" 판단한다.
 *
 * @param {{ id: string, closed_by_run_id?: string|null, gate_status?: 'resolved'|'abandoned' }} input
 */
export async function closeGateAndResume(input) {
  const id = trim(input && input.id);
  if (!id) throw new Error('closeGateAndResume: id required');
  const row = await storeCloseHumanGate({
    id,
    gate_status: input.gate_status || 'resolved',
    closed_by_run_id: input.closed_by_run_id ?? null,
  });
  return {
    gate: row,
    continuation: {
      packet_id: row.continuation_packet_id || null,
      run_id: row.continuation_run_id || null,
      thread_key: row.continuation_thread_key || null,
      required_human_action: row.required_human_action || null,
    },
  };
}

/**
 * gate row 와 evidence (자유 shape) 를 받아 "닫을 수 있는가" 만 판정한다.
 * 규칙: gate_status === 'open' AND evidence.resolved === true OR evidence.abandoned === true.
 * 자동 판정은 없음 — 운영자/supervisor 가 불린 플래그를 넘기는 것이 전제.
 *
 * @param {Record<string,unknown>} gateRow
 * @param {{ resolved?: boolean, abandoned?: boolean } | null | undefined} evidence
 * @returns {{ can_close: boolean, next_status: 'resolved'|'abandoned'|null, reason: string|null }}
 */
export function detectGateCompletion(gateRow, evidence) {
  if (!gateRow || typeof gateRow !== 'object') {
    return { can_close: false, next_status: null, reason: 'gate row missing' };
  }
  if (String(gateRow.gate_status || '') !== 'open') {
    return { can_close: false, next_status: null, reason: 'gate is not open' };
  }
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  if (ev.abandoned === true) return { can_close: true, next_status: 'abandoned', reason: null };
  if (ev.resolved === true) return { can_close: true, next_status: 'resolved', reason: null };
  return { can_close: false, next_status: null, reason: 'no evidence provided' };
}

/**
 * compact lines 로 open gate 요약. founder 본문에 직접 넣지 않고 read_execution_context 에서만 사용.
 * 토큰/원시값 노출 금지 — gate_kind·gate_id prefix·required_human_action(자연어) 만.
 *
 * @param {Array<Record<string, unknown>>} openGates
 * @returns {string[]}
 */
export function formatUnresolvedHumanGatesCompactLines(openGates) {
  const rows = Array.isArray(openGates) ? openGates : [];
  const out = [];
  for (const g of rows.slice(0, 6)) {
    const idShort = asString(g.id).slice(0, 8);
    const kind = asString(g.gate_kind);
    const action = asString(g.required_human_action || g.gate_action || '').slice(0, 80);
    const packet = g.continuation_packet_id ? ` cont_packet:${asString(g.continuation_packet_id).slice(0, 12)}` : '';
    out.push(`gate[${idShort}] ${kind}: ${action || '(조치 미기재)'}${packet}`);
  }
  return out.slice(0, 6);
}

export { listOpenHumanGates };
