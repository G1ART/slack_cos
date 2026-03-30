/**
 * M4 thin — lineage drill-down for slash & pre-AI (read-only, no LLM).
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md (M4 transport shell)
 */

import fs from 'fs/promises';
import {
  resolveDecisionPacketsJsonlPath,
  resolveStatusPacketsJsonlPath,
  resolveAgentWorkQueuePath,
  resolveInboundTurnTracePath,
  resolveCosWorkspaceQueuePath,
} from '../storage/paths.js';
import { listWorkspaceQueueRecent, formatWorkspaceQueueList } from './cosWorkspaceQueue.js';
import { formatStatusPacketAuditForSlack } from './statusPackets.js';
import { readJsonArray } from '../storage/jsonStore.js';
import { formatDecisionPacketSlack } from './decisionPackets.js';
import {
  formatAgentWorkQueueSlackLine,
  listAgentWorkQueueHead,
} from './agentWorkQueue.js';

const PACKET_HEAD =
  /^(?:패킷|결정\s*패킷|packet)\s+(PKT-[\w-]+)/iu;
/** `상태 STP-…` — M2b 상태 패킷 감사 JSONL */
const STATUS_HEAD =
  /^(?:상태|상태\s*패킷|상태패킷|status)\s+(STP-[\w-]+)/iu;
const WQ_HEAD =
  /^(?:워크\s*큐|워크큐|작업\s*큐|wq|work-queue|work_queue)\s+(AWQ-[\w-]+)/iu;
/** `/g1cos 워크큐 목록` — 최근 `AWQ-*` (시간 역순) */
const WQ_LIST_HEAD =
  /^(?:워크\s*큐|워크큐|작업\s*큐|wq|work-queue|work_queue)\s*(?:목록|리스트|list|recent|최근)\s*$/iu;
/** `pending_executive` · `queued` (승인·COS 게이트 후보) */
const WQ_PENDING_HEAD =
  /^(?:워크\s*큐|워크큐|작업\s*큐|wq|work-queue|work_queue)\s*(?:대기|승인\s*대기|pending|executive)\s*$/iu;
/** `/g1cos 실행 큐 목록` — `cos-workspace-queue.json` spec 최근 */
const WS_SPEC_LIST_HEAD =
  /^(?:실행\s*큐|인테이크)\s*(?:목록|리스트|list|recent|최근)\s*$/iu;
/** 고객 피드백 큐 최근 (`customer_feedback`) */
const WS_FB_LIST_HEAD =
  /^(?:피드백\s*큐|고객\s*피드백|고객피드백)\s*(?:목록|리스트|list|recent|최근)\s*$/iu;

const TURN_ID_CORE = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const TURN_HEAD = new RegExp(`^(?:턴|추적|turn|trace)\\s+(${TURN_ID_CORE})`, 'iu');

/**
 * @param {string} trimmed normalizeSlackUserPayload 결과
 * @returns {{ kind: 'packet' | 'status_packet' | 'work_queue' | 'turn_trace' | 'cos_workspace', id: string } | null}
 */
export function parseG1CosLineageToken(trimmed) {
  const t = String(trimmed || '').trim();
  let m = t.match(TURN_HEAD);
  if (m) return { kind: 'turn_trace', id: m[1].toLowerCase() };
  m = t.match(PACKET_HEAD);
  if (m) return { kind: 'packet', id: m[1] };
  m = t.match(STATUS_HEAD);
  if (m) return { kind: 'status_packet', id: m[1] };
  m = t.match(WQ_HEAD);
  if (m) return { kind: 'work_queue', id: m[1] };
  m = t.match(/^(?:실행\s*큐|인테이크)\s+(CWS-[\w-]+)/iu);
  if (m) return { kind: 'cos_workspace', id: m[1] };
  m = t.match(/^(?:피드백\s*큐|고객\s*피드백|feedback(?:\s*queue)?)\s+(CFB-[\w-]+)/iu);
  if (m) return { kind: 'cos_workspace', id: m[1] };
  return null;
}

/**
 * @param {string} stpId `STP-…`
 * @param {string} [jsonlPath]
 */
export async function lookupStatusPacketAuditRow(stpId, jsonlPath = resolveStatusPacketsJsonlPath()) {
  const id = String(stpId || '').trim();
  if (!id || !/^STP-/i.test(id)) return null;
  let raw;
  try {
    raw = await fs.readFile(jsonlPath, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o && o.type === 'status_packet' && o.status_packet_id === id) return o;
    } catch {
      /* ignore bad line */
    }
  }
  return null;
}

export async function lookupDecisionPacketAuditRow(packetId, jsonlPath = resolveDecisionPacketsJsonlPath()) {
  const id = String(packetId || '').trim();
  if (!id || !/^PKT-/i.test(id)) return null;
  let raw;
  try {
    raw = await fs.readFile(jsonlPath, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o && o.type === 'decision_packet' && o.packet_id === id) return o;
    } catch {
      /* ignore bad line */
    }
  }
  return null;
}

/**
 * @param {string} turnId UUID (lower/upper 혼용 가능)
 * @param {string} [tracePath]
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function lookupTurnTraceRecord(turnId, tracePath = resolveInboundTurnTracePath()) {
  const id = String(turnId || '').trim().toLowerCase();
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) {
    return null;
  }
  let raw;
  try {
    raw = await fs.readFile(tracePath, 'utf8');
  } catch {
    return null;
  }
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  for (let i = lines.length - 1; i >= 0; i--) {
    try {
      const o = JSON.parse(lines[i]);
      if (o && typeof o.turn_id === 'string' && o.turn_id.toLowerCase() === id) return o;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export async function lookupWorkQueueItemById(workQueueId, filePath = resolveAgentWorkQueuePath()) {
  const id = String(workQueueId || '').trim();
  if (!id || !/^AWQ-/i.test(id)) return null;
  const items = await readJsonArray(filePath);
  for (let i = items.length - 1; i >= 0; i--) {
    const row = items[i];
    if (row && row.id === id) return row;
  }
  return null;
}

/**
 * @param {string} queueId `CWS-*` | `CFB-*`
 * @param {string} [filePath]
 */
export async function lookupWorkspaceQueueItemById(queueId, filePath = resolveCosWorkspaceQueuePath()) {
  const id = String(queueId || '').trim();
  if (!id || !/^(CWS-|CFB-)/i.test(id)) return null;
  const items = await readJsonArray(filePath);
  for (let i = items.length - 1; i >= 0; i--) {
    const row = items[i];
    if (row && row.id === id) return row;
  }
  return null;
}

/**
 * @param {Record<string, unknown>} row
 */
function formatCosWorkspaceQueueDrillDown(row) {
  const rec = /** @type {any} */ (row);
  const isFb = rec.kind === 'customer_feedback';
  const title = isFb ? '고객 피드백 큐' : '실행 큐 (spec)';
  const body = rec.body != null ? String(rec.body) : '';
  const bodyShow = body.length > 1400 ? `${body.slice(0, 1397)}…` : body;
  /** @type {(string | null)[]} */
  const lines = [
    `*[G1COS · ${title} 조회]*`,
    `\`id\`: \`${rec.id}\``,
    `*kind:* \`${rec.kind}\``,
    `*상태:* \`${rec.status ?? '—'}\``,
    rec.title ? `*제목:* ${String(rec.title)}` : null,
    bodyShow ? `*본문:*\n${bodyShow}` : null,
    rec.created_at ? `*created_at:* ${rec.created_at}` : null,
    rec.linked_awq_id ? `*연결 AWQ 초안:* \`${rec.linked_awq_id}\` — \`워크큐 ${rec.linked_awq_id}\`` : null,
  ];
  /** @type {string[]} */
  const next = [];
  if (!isFb && String(rec.status || '') === 'pending_review') {
    next.push(
      '*다음 액션:*',
      `· 이 항목을 실행으로 전환하려면 COS에 요청하세요`,
    );
  }
  if (isFb && String(rec.status || '') === 'pending_review') {
    next.push(
      '*다음 액션:*',
      rec.linked_awq_id
        ? `· 이미 **AWQ 초안** \`${rec.linked_awq_id}\` — \`워크큐 ${rec.linked_awq_id}\` · \`워크큐실행허가\`(pending_executive 시)`
        : '· 작업으로 전환하거나, 제품화가 필요하면 COS에 실행을 요청하세요',
      '· 동일 스레드 `피드백: …` 로 보강 가능',
    );
  }
  const base = lines.filter(Boolean).join('\n');
  const pathHint =
    '_파일: `COS_WORKSPACE_QUEUE_FILE` 또는 기본 `data/cos-workspace-queue.json`_';
  return next.length ? [base, '', ...next, '', pathHint].join('\n') : [base, '', pathHint].join('\n');
}

function auditRowToPacket(row) {
  if (!row || !row.packet_id) return null;
  const { type: _t, recorded_at: _r, ...packet } = row;
  return packet;
}

function formatTurnTraceDrillDown(row) {
  const inp = String(row.input_text_normalized || '').trim();
  const inpShow = inp.length > 480 ? `${inp.slice(0, 477)}…` : inp;
  const lines = [
    '*[G1COS · 턴 trace 조회]*',
    `\`turn_id\`: \`${row.turn_id}\``,
    `*thread_key:* \`${row.thread_key ?? '—'}\``,
    `*시각:* ${row.timestamp ?? '—'}`,
    `*정규화 입력:* ${inpShow || '—'}`,
    `*responder:* \`${row.final_responder ?? '—'}\` · *status:* \`${row.status ?? '—'}\``,
    row.response_type ? `*response_type:* \`${row.response_type}\`` : null,
    row.command_name ? `*command_name:* \`${row.command_name}\`` : null,
    row.surface_intent ? `*surface_intent:* \`${row.surface_intent}\`` : null,
    row.packet_id ? `\`packet_id\`: \`${row.packet_id}\`` : null,
    row.status_packet_id
      ? `\`status_packet_id\`: \`${row.status_packet_id}\` _(lineage: \`상태 ${row.status_packet_id}\`)_`
      : null,
    row.work_queue_id ? `\`work_queue_id\`: \`${row.work_queue_id}\`` : null,
    row.plan_id ? `\`plan_id\`: \`${row.plan_id}\`` : null,
    row.work_id ? `\`work_id\`: \`${row.work_id}\`` : null,
    row.run_id ? `\`run_id\`: \`${row.run_id}\`` : null,
    typeof row.duration_ms === 'number' ? `*duration_ms:* ${row.duration_ms}` : null,
    row.error ? `*error:* ${String(row.error).slice(0, 200)}` : null,
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * @param {Record<string, unknown>} row
 * @returns {string | null}
 */
function resolveWorkQueueLinkedWrk(row) {
  const direct = row.linked_work_id != null ? String(row.linked_work_id).trim() : '';
  if (direct) return direct;
  const ids = row.linked_work_ids;
  if (Array.isArray(ids) && ids.length) {
    const first = String(ids[0] || '').trim();
    return first || null;
  }
  return null;
}

/**
 * 긴 CI/슬랙 증거 줄이 Slack 본문을 압도하지 않게 자른다 (끝에서 최근 것 우선).
 * @param {unknown[]} [refs]
 * @param {{ maxEach?: number, maxShow?: number }} [opts]
 */
function formatProofRefsForSlack(refs, opts = {}) {
  const maxEach = opts.maxEach ?? 200;
  const maxShow = opts.maxShow ?? 10;
  if (!Array.isArray(refs) || !refs.length) return null;
  const tail = refs.slice(-maxShow);
  const more = refs.length > maxShow ? ` _(+${refs.length - maxShow} 이전)_` : '';
  const parts = tail.map((x) => {
    const s = String(x);
    return s.length > maxEach ? `${s.slice(0, maxEach - 1)}…` : s;
  });
  return `*proof_refs (${refs.length}):* ${parts.join(' | ')}${more}`;
}

/**
 * 결정 큐(M3) → 구조화 실행(`runInboundStructuredCommands`) 얇은 브리지 — DAG·자동 원격 실행 없음.
 * @param {Record<string, unknown>} row
 * @returns {string[]}
 */
function formatWorkQueueNextActionLines(row) {
  const wrk = resolveWorkQueueLinkedWrk(row);
  const st = row.status != null ? String(row.status) : '';

  if (st === 'pending_executive') {
    const gate = row.id
      ? `· 먼저: \`워크큐실행허가 ${row.id}\` (Slack 구조화 — \`pending_executive\` → \`queued\`)`
      : '· 먼저: `워크큐실행허가 <AWQ-…>`';
    const tail = wrk
      ? `· 이후: \`커서발행 ${wrk}\` · \`이슈발행 ${wrk}\` · \`수파베이스발행 ${wrk}\` — 업무에 맞게 하나만`
      : '· WRK가 비어 있으면 `업무상세` 등으로 ID를 확정한 뒤 큐를 보강하세요.';
    return ['*다음 액션 (실행 축):*', gate, tail];
  }

  if (st === 'blocked') {
    const gate = row.id ? `· \`워크큐재개 ${row.id}\` → \`queued\` 후 발행` : '· `워크큐재개 <AWQ-…>`';
    const blk =
      row.blocker != null && String(row.blocker).trim()
        ? `· 블로커: ${String(row.blocker).trim().slice(0, 280)}`
        : null;
    return ['*다음 액션:*', gate, blk].filter(Boolean);
  }

  if (st === 'queued' && wrk) {
    return [
      '*다음 액션 (실행 축):*',
      `· \`커서발행 ${wrk}\` (Cursor 핸드오프) · \`이슈발행 ${wrk}\` · \`수파베이스발행 ${wrk}\` — 해당 업무 도구에 맞게 하나만`,
      row.id ? `· 실행 착수 기록: \`워크큐착수 ${row.id}\` (\`in_progress\`)` : null,
      row.id ? `· 보류 시: \`워크큐보류 ${row.id} 사유\`` : null,
    ].filter(Boolean);
  }

  if (st === 'in_progress') {
    const run =
      row.linked_run_id != null && String(row.linked_run_id).trim()
        ? String(row.linked_run_id).trim()
        : null;
    return [
      '*다음 액션:*',
      row.id
        ? `· 중간 증거(상태 유지): \`워크큐증거 ${row.id} …\`${run ? ` · \`러너증거 ${run} …\` (RUN 연결 시)` : ''}`
        : null,
      row.id
        ? `· 완료: \`워크큐완료 ${row.id}\` 또는 \`워크큐완료 ${row.id} run:RUN-… / PR:…\` (한 줄 증거)`
        : '· `워크큐완료 <AWQ-…>`',
      row.id ? `· 보류: \`워크큐보류 ${row.id} 사유\`` : null,
    ].filter(Boolean);
  }

  if (st === 'done') {
    const refBlock = formatProofRefsForSlack(row.proof_refs, { maxEach: 160, maxShow: 8 });
    return refBlock ? ['*상태: 완료*', `· ${refBlock}`] : ['*상태: 완료*'];
  }

  if (st === 'queued' && !wrk) {
    return [
      '*다음 액션:* WRK를 플랜/업무 흐름에서 확정해 `linked_work_id`에 연결한 뒤 발행 명령을 쓰세요.',
    ];
  }

  return [];
}

/**
 * @param {unknown[]} rows
 * @param {'recent' | 'pending_gate'} mode
 */
function formatWorkQueueListSlack(rows, mode) {
  const title =
    mode === 'pending_gate'
      ? '*[G1COS · 워크큐 — 승인·대기 게이트]*'
      : '*[G1COS · 워크큐 — 최근 항목]*';
  const pathHint =
    '_상세: `워크큐 AWQ-…` / `/g1cos 워크큐 AWQ-…`_ · _파일: `AGENT_WORK_QUEUE_FILE` 또는 기본 `data/agent-work-queue.json`_';
  if (!rows.length) {
    return [title, '', '_항목이 없습니다._', '', pathHint].join('\n');
  }
  const lines = [title, ''];
  for (const r of rows) {
    if (r && typeof r === 'object') {
      lines.push(formatAgentWorkQueueSlackLine(/** @type {any} */ (r)));
      const rec = /** @type {any} */ (r);
      const bits = [];
      if (rec.packet_id) bits.push(`PKT \`${rec.packet_id}\``);
      if (rec.selected_option_id) bits.push(`옵션 \`${rec.selected_option_id}\``);
      if (bits.length) lines.push(`  ${bits.join(' · ')}`);
      const wrk = resolveWorkQueueLinkedWrk(rec);
      if (rec.status === 'queued' && wrk) {
        lines.push(`  _→_ \`커서발행 ${wrk}\` · \`이슈발행 ${wrk}\` …`);
      } else if (rec.status === 'pending_executive' && wrk) {
        lines.push(`  _승인 후_ \`커서발행 ${wrk}\` 등`);
      } else if (rec.status === 'blocked' && rec.id) {
        lines.push(`  _→_ \`워크큐재개 ${rec.id}\``);
      } else if (rec.status === 'in_progress' && rec.id) {
        const run =
          rec.linked_run_id != null && String(rec.linked_run_id).trim()
            ? String(rec.linked_run_id).trim()
            : null;
        lines.push(`  _→_ \`워크큐증거 ${rec.id}\` · \`워크큐완료 ${rec.id}\`${run ? ` · \`러너증거 ${run}\`` : ''}`);
      }
    }
  }
  lines.push(
    '',
    '_실행 브리지:_ `queued`·WRK 연결 → 멘션/채널에서 `커서발행`/`이슈발행`/`수파베이스발행`(구조화 명령).',
    '_증거(옵션):_ `워크큐증거`·`러너증거`·배포 런타임 `COS_CI_HOOK_*` → `POST /cos/ci-proof`.',
    pathHint
  );
  return lines.join('\n');
}

function formatWorkQueueDrillDown(row) {
  const lines = [
    '*[G1COS · 워크큐 조회]*',
    `\`work_queue_id\`: \`${row.id}\``,
    `*상태:* \`${row.status}\``,
    row.approval_policy_tier
      ? `*approval_policy_tier:* \`${row.approval_policy_tier}\``
      : null,
    row.packet_id || row.selected_option_id
      ? `\`packet_id\`: \`${row.packet_id}\` · 선택 \`${row.selected_option_id}\``
      : row.kind === 'feedback_follow_up' && row.source_workspace_queue_id
        ? `*kind:* \`feedback_follow_up\` · 출처 \`${row.source_workspace_queue_id}\``
        : `*패킷 선택 없음* (피드백·기타 초안)`,
    row.topic ? `*주제(스냅샷):* ${row.topic}` : null,
    row.thread_key ? `*thread_key:* \`${row.thread_key}\`` : null,
    row.blocker ? `*블로커:* ${row.blocker}` : null,
    Array.isArray(row.linked_plan_ids) && row.linked_plan_ids.length
      ? `*linked_plan_ids:* ${row.linked_plan_ids.map((x) => `\`${x}\``).join(', ')}`
      : null,
    Array.isArray(row.linked_work_ids) && row.linked_work_ids.length
      ? `*linked_work_ids:* ${row.linked_work_ids.map((x) => `\`${x}\``).join(', ')}`
      : null,
    (row.linked_work_id || row.linked_run_id) &&
      `*연결(단일):* WRK \`${row.linked_work_id ?? '—'}\` · RUN \`${row.linked_run_id ?? '—'}\``,
    formatProofRefsForSlack(row.proof_refs),
    `_갱신:_ ${row.updated_at || row.created_at || '—'}`,
  ];
  const base = lines.filter(Boolean).join('\n');
  const next = formatWorkQueueNextActionLines(row);
  return next.length ? [base, '', ...next].join('\n') : base;
}

/**
 * @param {string} trimmed
 * @param {Record<string, unknown>} [_routerCtx]
 * @returns {Promise<{ text: string, response_type: string } | null>}
 */
export async function tryFinalizeG1CosLineageTransport(trimmed, _routerCtx) {
  const line = String(trimmed || '').trim();

  if (WS_SPEC_LIST_HEAD.test(line)) {
    const items = await listWorkspaceQueueRecent('spec_intake', 15);
    return {
      text: formatWorkspaceQueueList(items, '실행 큐 · spec (최근)'),
      response_type: 'lineage_workspace_spec_list',
    };
  }
  if (WS_FB_LIST_HEAD.test(line)) {
    const items = await listWorkspaceQueueRecent('customer_feedback', 15);
    return {
      text: formatWorkspaceQueueList(items, '고객 피드백 큐 (최근)'),
      response_type: 'lineage_workspace_feedback_list',
    };
  }

  if (WQ_LIST_HEAD.test(line)) {
    const rows = await listAgentWorkQueueHead(resolveAgentWorkQueuePath(), {
      limit: 15,
    });
    return {
      text: formatWorkQueueListSlack(rows, 'recent'),
      response_type: 'lineage_work_queue_list',
    };
  }
  if (WQ_PENDING_HEAD.test(line)) {
    const rows = await listAgentWorkQueueHead(resolveAgentWorkQueuePath(), {
      statuses: ['pending_executive', 'queued'],
      limit: 20,
    });
    return {
      text: formatWorkQueueListSlack(rows, 'pending_gate'),
      response_type: 'lineage_work_queue_pending',
    };
  }

  const tok = parseG1CosLineageToken(trimmed);
  if (!tok) return null;

  if (tok.kind === 'turn_trace') {
    const rec = await lookupTurnTraceRecord(tok.id);
    if (!rec) {
      return {
        text: [
          '*[G1COS · 턴 trace 조회]*',
          `\`turn_id\` \`${tok.id}\` 를 **inbound-turn-trace** JSONL 에서 찾지 못했습니다.`,
          '_경로는 `INBOUND_TURN_TRACE_FILE` 또는 기본 `data/inbound-turn-trace.jsonl` 입니다._',
        ].join('\n'),
        response_type: 'lineage_turn_miss',
      };
    }
    return { text: formatTurnTraceDrillDown(rec), response_type: 'lineage_turn' };
  }

  if (tok.kind === 'packet') {
    const row = await lookupDecisionPacketAuditRow(tok.id);
    if (!row) {
      return {
        text: [
          '*[G1COS · 패킷 조회]*',
          `\`packet_id\` \`${tok.id}\` 에 해당하는 **감사 기록**을 찾지 못했습니다.`,
          '_같은 워크스페이스에서 `결정비교:` 가 기록된 적이 있는지, `DECISION_PACKETS_JSONL_FILE` 경로가 맞는지 확인하세요._',
        ].join('\n'),
        response_type: 'lineage_packet_miss',
      };
    }
    const packet = auditRowToPacket(row);
    const body = packet ? formatDecisionPacketSlack(packet) : String(row.packet_id || '');
    const text = ['*[G1COS · 패킷 조회 — 감사 스냅샷]*', '', body].join('\n');
    return { text, response_type: 'lineage_packet' };
  }

  if (tok.kind === 'status_packet') {
    const stRow = await lookupStatusPacketAuditRow(tok.id);
    if (!stRow) {
      return {
        text: [
          '*[G1COS · 상태 패킷 조회]*',
          `\`status_packet_id\` \`${tok.id}\` 에 해당하는 **감사 기록**을 찾지 못했습니다.`,
          '_경로: `STATUS_PACKETS_JSONL_FILE` 또는 기본 `data/status-packets.jsonl`._',
        ].join('\n'),
        response_type: 'lineage_status_packet_miss',
      };
    }
    const body = formatStatusPacketAuditForSlack(stRow);
    const text = ['*[G1COS · 상태 패킷 — 감사 스냅샷]*', '', body || '—'].join('\n');
    return { text, response_type: 'lineage_status_packet' };
  }

  if (tok.kind === 'cos_workspace') {
    const wqRow = await lookupWorkspaceQueueItemById(tok.id);
    if (!wqRow) {
      return {
        text: [
          '*[G1COS · 실행/피드백 큐 조회]*',
          `\`${tok.id}\` 항목을 **cos-workspace-queue** 에서 찾지 못했습니다.`,
          '_경로: `COS_WORKSPACE_QUEUE_FILE` 또는 기본 `data/cos-workspace-queue.json`._',
        ].join('\n'),
        response_type: 'lineage_workspace_intake_miss',
      };
    }
    return {
      text: formatCosWorkspaceQueueDrillDown(wqRow),
      response_type: 'lineage_workspace_intake',
    };
  }

  const row = await lookupWorkQueueItemById(tok.id);
  if (!row) {
    return {
      text: [
        '*[G1COS · 워크큐 조회]*',
        `\`work_queue_id\` \`${tok.id}\` 항목을 **agent-work-queue** 에서 찾지 못했습니다.`,
      ].join('\n'),
      response_type: 'lineage_work_queue_miss',
    };
  }
  return { text: formatWorkQueueDrillDown(row), response_type: 'lineage_work_queue' };
}
