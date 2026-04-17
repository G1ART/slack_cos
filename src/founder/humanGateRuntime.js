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
  markGateResumed as storeMarkGateResumed,
  PROJECT_SPACE_GATE_KINDS,
} from './projectSpaceBindingStore.js';

export const RESUME_TARGET_KINDS = Object.freeze(['packet', 'run', 'thread']);

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
 *   resume_target_kind?: 'packet'|'run'|'thread'|null,
 *   resume_target_ref?: string|null,
 * }} input
 */
export async function openResumableGate(input) {
  if (!PROJECT_SPACE_GATE_KINDS.includes(trim(input && input.gate_kind))) {
    throw new Error(
      `openResumableGate: gate_kind must be one of ${PROJECT_SPACE_GATE_KINDS.join('|')}`,
    );
  }
  // W11-C invariant: resume_target_kind 와 resume_target_ref 는 동시에 존재하거나 동시에 null.
  const rtk = trim(input.resume_target_kind);
  const rtr = trim(input.resume_target_ref);
  if ((rtk && !rtr) || (!rtk && rtr)) {
    throw new Error(
      'openResumableGate: resume_target_kind and resume_target_ref must be provided together',
    );
  }
  if (rtk && !RESUME_TARGET_KINDS.includes(rtk)) {
    throw new Error(
      `openResumableGate: resume_target_kind must be one of ${RESUME_TARGET_KINDS.join('|')}`,
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
    resume_target_kind: rtk || null,
    resume_target_ref: rtr || null,
  });
}

/**
 * W11-C — gate row 에서 continuation_key 를 결정적으로 파생한다.
 * shape: 'packet:<id>|run:<id>|thread:<key>' (없으면 '-' 로 치환).
 * 값(secret)을 포함하지 않고 식별자만.
 * @param {Record<string, unknown> | null | undefined} gateRow
 * @returns {string}
 */
export function deriveContinuationKey(gateRow) {
  if (!gateRow || typeof gateRow !== 'object') return 'packet:-|run:-|thread:-';
  const packet = asString(gateRow.continuation_packet_id) || '-';
  const run = asString(gateRow.continuation_run_id) || '-';
  const thread = asString(gateRow.continuation_thread_key) || '-';
  return `packet:${packet}|run:${run}|thread:${thread}`;
}

/**
 * gate close + continuation meta 를 함께 반환. **자동 재개 금지** — 호출자(lane/supervisor)가
 * continuation_run_id 등을 보고 "어떤 run/packet 을 깨울지" 판단한다.
 *
 * @param {{ id: string, closed_by_run_id?: string|null, gate_status?: 'resolved'|'abandoned', resumed_by?: string|null }} input
 */
export async function closeGateAndResume(input) {
  const id = trim(input && input.id);
  if (!id) throw new Error('closeGateAndResume: id required');
  const row = await storeCloseHumanGate({
    id,
    gate_status: input.gate_status || 'resolved',
    closed_by_run_id: input.closed_by_run_id ?? null,
    resumed_by: input.resumed_by ?? null,
  });
  return {
    gate: row,
    continuation: {
      packet_id: row.continuation_packet_id || null,
      run_id: row.continuation_run_id || null,
      thread_key: row.continuation_thread_key || null,
      required_human_action: row.required_human_action || null,
      resume_target_kind: row.resume_target_kind || null,
      resume_target_ref: row.resume_target_ref || null,
      continuation_key: deriveContinuationKey(row),
    },
  };
}

export async function markGateResumed(input) {
  const id = trim(input && input.id);
  if (!id) throw new Error('markGateResumed: id required');
  return storeMarkGateResumed({ id, resumed_by: input.resumed_by ?? null });
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
    const packet = g.continuation_packet_id
      ? ` cont_packet:${asString(g.continuation_packet_id).slice(0, 12)}`
      : '';
    const reopened =
      Number.isFinite(g.reopened_count) && g.reopened_count > 0
        ? ` reopened=${g.reopened_count}`
        : '';
    const resumeKind = g.resume_target_kind ? ` resume→${asString(g.resume_target_kind)}` : '';
    out.push(`gate[${idShort}] ${kind}: ${action || '(조치 미기재)'}${packet}${reopened}${resumeKind}`);
  }
  return out.slice(0, 6);
}

export { listOpenHumanGates };
