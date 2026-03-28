/**
 * M2b — Executive status packet (schema + Slack render + append-only audit).
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md §11.4
 */

import fs from 'fs/promises';
import path from 'path';
import { resolveStatusPacketsJsonlPath } from '../storage/paths.js';

/**
 * @typedef {'exec_status_v1'} ExecutiveStatusSchemaVersion
 */

/**
 * @typedef {{
 *   status_packet_id: string,
 *   schema_version: ExecutiveStatusSchemaVersion,
 *   source_intent: string,
 *   progress_change: string,
 *   current_blockers: string[],
 *   decisions_needed: string[],
 *   cos_next_action: string[],
 *   proof_refs: string[],
 *   note: string | null,
 *   generated_at: string,
 * }} ExecutiveStatusPacket
 */

export function createStatusPacketId() {
  return `STP-${crypto.randomUUID()}`;
}

/**
 * @param {object} [opts]
 * @param {string} [opts.intent]
 * @param {string | null} [opts.note]
 * @param {string[]} [opts.proof_refs]
 * @returns {ExecutiveStatusPacket}
 */
export function buildThinExecutiveStatusPacket(opts = {}) {
  const intent = String(opts.intent || 'ask_status');
  const note = opts.note != null && String(opts.note).trim() ? String(opts.note).trim() : null;
  const proofExtras = Array.isArray(opts.proof_refs)
    ? opts.proof_refs.map((x) => String(x)).filter(Boolean)
    : [];
  return {
    status_packet_id: createStatusPacketId(),
    schema_version: 'exec_status_v1',
    source_intent: intent,
    progress_change:
      'PLN/WRK/run 실시간 롤업은 다음 슬라이스에서 스토어·`inbound-turn-trace`와 묶습니다. (v1 얇은 슬라이스)',
    current_blockers: [
      '내부 덤프 대신 — 막힘이 없으면 `상태점검`(운영) 또는 스토어 연동 후 자동 표시 예정',
    ],
    decisions_needed: [
      '대표 결정 큐는 **결정 패킷**·승인 매트릭스와 연동 예정 — 지금은 플레이스홀더',
    ],
    cos_next_action: ['맥락 수집', '필요 시 `결정비교:`로 패킷 생성'],
    proof_refs: proofExtras.length ? proofExtras : [],
    note,
    generated_at: new Date().toISOString(),
  };
}

/**
 * @param {ExecutiveStatusPacket} packet
 */
export function formatExecutiveStatusPacketSlack(packet) {
  const p = packet;
  const fmtList = (label, items) => {
    const xs = Array.isArray(items) ? items.map((x) => String(x).trim()).filter(Boolean) : [];
    const body = xs.length ? xs.map((x) => `· ${x}`).join('\n') : '· —';
    return [`*${label}*`, body].join('\n');
  };
  const noteBlock =
    p.note && String(p.note).trim() ? `\n_${String(p.note).trim()}_\n` : '\n';
  const proof =
    Array.isArray(p.proof_refs) && p.proof_refs.length
      ? p.proof_refs.map((x) => String(x)).join(' · ')
      : '— 증거 없음 (완료 주장 시 `proof_refs` 필수 — 제품 원칙)';

  return [
    '*[상태 패킷 · exec_status_v1]*',
    `\`status_packet_id\`: \`${p.status_packet_id}\``,
    '',
    fmtList('진행 변화', [p.progress_change]),
    '',
    fmtList('현재 막힘', p.current_blockers),
    '',
    fmtList('대표 결정 필요', p.decisions_needed),
    '',
    fmtList('COS 다음 자동 액션', p.cos_next_action),
    '',
    '*근거·증거 (proof_refs)*',
    proof,
    noteBlock.trimEnd(),
  ].join('\n');
}

/**
 * @param {ExecutiveStatusPacket} packet
 * @param {string} [jsonlPath]
 */
export async function appendStatusPacketAudit(packet, jsonlPath = resolveStatusPacketsJsonlPath()) {
  const fp = jsonlPath;
  const line = `${JSON.stringify({
    type: 'status_packet',
    recorded_at: new Date().toISOString(),
    ...packet,
  })}\n`;
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, line, 'utf8');
}

/**
 * JSONL 감사 한 줄 → 슬랙 렌더용 패킷 (필드 누락 시 기본값).
 *
 * @param {Record<string, unknown>} row
 * @returns {ExecutiveStatusPacket | null}
 */
export function parseStatusPacketAuditRow(row) {
  if (!row || row.type !== 'status_packet') return null;
  const id = row.status_packet_id != null ? String(row.status_packet_id).trim() : '';
  if (!id || !/^STP-/i.test(id)) return null;
  return {
    status_packet_id: id,
    schema_version: 'exec_status_v1',
    source_intent: String(row.source_intent || ''),
    progress_change: String(row.progress_change || ''),
    current_blockers: Array.isArray(row.current_blockers)
      ? row.current_blockers.map((x) => String(x))
      : [],
    decisions_needed: Array.isArray(row.decisions_needed)
      ? row.decisions_needed.map((x) => String(x))
      : [],
    cos_next_action: Array.isArray(row.cos_next_action)
      ? row.cos_next_action.map((x) => String(x))
      : [],
    proof_refs: Array.isArray(row.proof_refs) ? row.proof_refs.map((x) => String(x)) : [],
    note: row.note != null && String(row.note).trim() ? String(row.note).trim() : null,
    generated_at: String(row.generated_at || row.recorded_at || new Date().toISOString()),
  };
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
export function formatStatusPacketAuditForSlack(row) {
  const p = parseStatusPacketAuditRow(row);
  return p ? formatExecutiveStatusPacketSlack(p) : null;
}
