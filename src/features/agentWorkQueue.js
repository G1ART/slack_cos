/**
 * M3 seed — decision_pick → 최소 큐 단위 (거대 DAG/오케스트레이션 없음).
 * @see docs/cursor-handoffs/COS_NorthStar_Implementation_Pathway_Harness_2026-03.md §13
 */

import { resolveAgentWorkQueuePath } from '../storage/paths.js';
import { appendJsonRecord, readJsonArray, writeJsonArray } from '../storage/jsonStore.js';

/** @typedef {'queued'|'pending_executive'|'in_progress'|'blocked'|'done'|'cancelled'} AgentWorkQueueStatus */

const ALLOWED_STATUS = new Set([
  'queued',
  'pending_executive',
  'in_progress',
  'blocked',
  'done',
  'cancelled',
]);

function makeId() {
  return `AWQ-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function normIdList(v) {
  if (!Array.isArray(v)) return [];
  return v.map((x) => String(x || '').trim()).filter(Boolean);
}

/**
 * 대표가 결정 패킷에서 옵션을 고른 뒤 실행·연결을 이어갈 최소 단위.
 *
 * @param {object} p
 * @param {string} p.packet_id
 * @param {string} p.option_id
 * @param {string} [p.topic]
 * @param {string|null} [p.thread_key]
 * @param {string|null} [p.interpretation_note]
 * @param {Record<string, unknown>} [p.slack_source]
 * @param {string[]} [p.linked_plan_ids]
 * @param {string[]} [p.linked_work_ids]
 * @param {string[]} [p.linked_run_ids]
 * @param {'auto_allowed'|'cos_approval_only'|'executive_approval_required'} [p.approval_policy_tier]
 */
/**
 * @param {string} id `AWQ-…`
 * @param {string} [filePath]
 */
export async function getAgentWorkQueueItem(id, filePath = resolveAgentWorkQueuePath()) {
  const qid = String(id || '').trim();
  if (!qid || !/^AWQ-/i.test(qid)) return null;
  const items = await readJsonArray(filePath);
  const row = items.find((r) => r && r.id === qid);
  return row ?? null;
}

export async function enqueueFromDecisionPick(p, filePath = resolveAgentWorkQueuePath()) {
  const now = new Date().toISOString();
  const plans = normIdList(p.linked_plan_ids);
  const works = normIdList(p.linked_work_ids);
  const runs = normIdList(p.linked_run_ids);
  const tierRaw = p.approval_policy_tier != null ? String(p.approval_policy_tier).trim() : '';
  const needsExecutive = tierRaw === 'executive_approval_required';
  /** @type {AgentWorkQueueStatus} */
  const initialStatus = needsExecutive ? 'pending_executive' : 'queued';
  /** @type {{
   *   id: string,
   *   kind: 'decision_follow_up',
   *   status: AgentWorkQueueStatus,
   *   approval_policy_tier: string | null,
   *   packet_id: string,
   *   selected_option_id: string,
   *   topic: string | null,
   *   thread_key: string | null,
   *   interpretation_note: string | null,
   *   linked_plan_ids: string[],
   *   linked_work_ids: string[],
   *   linked_run_ids: string[],
   *   linked_work_id: string | null,
   *   linked_run_id: string | null,
   *   proof_refs: string[],
   *   blocker: string | null,
   *   created_at: string,
   *   updated_at: string,
   *   slack_source: Record<string, unknown>,
   * }} */
  const record = {
    id: makeId(),
    kind: 'decision_follow_up',
    status: initialStatus,
    approval_policy_tier: tierRaw || null,
    packet_id: String(p.packet_id || '').trim(),
    selected_option_id: String(p.option_id || '').trim(),
    topic: p.topic != null && String(p.topic).trim() ? String(p.topic).trim() : null,
    thread_key: p.thread_key != null ? String(p.thread_key) : null,
    interpretation_note: p.interpretation_note != null ? String(p.interpretation_note) : null,
    linked_plan_ids: plans,
    linked_work_ids: works,
    linked_run_ids: runs,
    linked_work_id: works[0] ?? null,
    linked_run_id: runs[0] ?? null,
    proof_refs: [],
    blocker: null,
    created_at: now,
    updated_at: now,
    slack_source: p.slack_source && typeof p.slack_source === 'object' ? p.slack_source : {},
  };

  await appendJsonRecord(filePath, record);
  try {
    console.info(
      JSON.stringify({
        event: 'agent_work_queue_enqueue',
        ts: record.created_at,
        id: record.id,
        kind: record.kind,
        packet_id: record.packet_id,
        option_id: record.selected_option_id,
        approval_policy_tier: record.approval_policy_tier,
        status: record.status,
      })
    );
  } catch {
    // ignore
  }
  return record;
}

/**
 * 고객 피드백(CFB) 적재 후 COS 초안 워크큐 (패킷 선택 없음).
 *
 * @param {object} p
 * @param {string} p.source_cfb_id `CFB-…`
 * @param {string} p.body
 * @param {string|null} [p.title]
 * @param {string|null} [p.thread_key]
 * @param {'auto_allowed'|'cos_approval_only'|'executive_approval_required'} [p.approval_policy_tier]
 * @param {Record<string, unknown>} [p.slack_source]
 * @param {string} [filePath]
 */
export async function enqueueFromCustomerFeedback(p, filePath = resolveAgentWorkQueuePath()) {
  const now = new Date().toISOString();
  const tierRaw = p.approval_policy_tier != null ? String(p.approval_policy_tier).trim() : '';
  const needsExecutive = tierRaw === 'executive_approval_required';
  /** @type {AgentWorkQueueStatus} */
  const initialStatus = needsExecutive ? 'pending_executive' : 'queued';
  const cfbId = String(p.source_cfb_id || '').trim();
  const body = String(p.body || '').trim();
  const title =
    p.title != null && String(p.title).trim()
      ? String(p.title).trim()
      : body.split(/\r?\n/).map((s) => s.trim()).find(Boolean) || '(피드백)';
  /** @type {Record<string, unknown>} */
  const record = {
    id: makeId(),
    kind: 'feedback_follow_up',
    status: initialStatus,
    approval_policy_tier: tierRaw || null,
    packet_id: null,
    selected_option_id: null,
    topic: title,
    thread_key: p.thread_key != null ? String(p.thread_key) : null,
    interpretation_note: cfbId ? `고객 피드백 큐 ${cfbId} 에서 자동 생성된 실행 초안` : null,
    linked_plan_ids: [],
    linked_work_ids: [],
    linked_run_ids: [],
    linked_work_id: null,
    linked_run_id: null,
    proof_refs: cfbId ? [`customer_feedback:${cfbId}`] : [],
    source_workspace_queue_id: cfbId || null,
    blocker: null,
    created_at: now,
    updated_at: now,
    slack_source: p.slack_source && typeof p.slack_source === 'object' ? p.slack_source : {},
  };

  await appendJsonRecord(filePath, record);
  try {
    console.info(
      JSON.stringify({
        event: 'agent_work_queue_feedback_enqueue',
        ts: record.created_at,
        id: record.id,
        kind: record.kind,
        source_workspace_queue_id: record.source_workspace_queue_id,
        approval_policy_tier: record.approval_policy_tier,
        status: record.status,
      })
    );
  } catch {
    // ignore
  }
  return record;
}

/**
 * @param {string} filePath
 * @param {number} count
 */
export async function listAgentWorkQueueRecent(filePath, count = 10) {
  const items = await readJsonArray(filePath);
  const n = Math.max(1, Math.min(Number(count) || 5, 50));
  return items.slice(-n).reverse();
}

/**
 * 워크큐 JSON에서 최신순(갱신/생성 시각) 상위 N개 — M4 `/g1cos 워크큐 목록`·`대기` 등.
 *
 * @param {string} filePath
 * @param {{ statuses?: string[] | null, limit?: number }} [options]
 * @returns {Promise<unknown[]>}
 */
export async function listAgentWorkQueueHead(filePath, options = {}) {
  const items = await readJsonArray(filePath);
  let rows = items.filter(
    (r) => r && typeof r.id === 'string' && /^AWQ-/i.test(r.id)
  );
  const statuses = options.statuses;
  if (Array.isArray(statuses) && statuses.length) {
    const set = new Set(statuses);
    rows = rows.filter((r) => set.has(r.status));
  }
  rows.sort((a, b) => {
    const tb = String(b.updated_at || b.created_at || '');
    const ta = String(a.updated_at || a.created_at || '');
    return tb.localeCompare(ta);
  });
  const lim = Math.max(1, Math.min(Number(options.limit) || 15, 50));
  return rows.slice(0, lim);
}

const LINK_RUN_ACTIVE = new Set(['queued', 'pending_executive', 'in_progress', 'blocked']);

/**
 * `커서발행` 등으로 생긴 run을 동일 WRK를 가진 활성 워크큐 행에 연결.
 * `linked_run_id` 가 이미 있고 다른 값이면 `proof_refs`에 `dispatch_run:<run>` 만 추가.
 *
 * @param {string} workId `WRK-…`
 * @param {string} runId `RUN-…`
 * @param {string} [filePath]
 */
export async function linkAgentWorkQueueRunForWork(workId, runId, filePath = resolveAgentWorkQueuePath()) {
  const wid = String(workId || '').trim();
  const rid = String(runId || '').trim();
  if (!wid || !rid) return null;

  const items = await readJsonArray(filePath);
  const rows = items.filter((r) => {
    if (!r || typeof r.id !== 'string' || !/^AWQ-/i.test(r.id)) return false;
    if (!LINK_RUN_ACTIVE.has(r.status)) return false;
    const lw = r.linked_work_id != null ? String(r.linked_work_id).trim() : '';
    const inList =
      Array.isArray(r.linked_work_ids) &&
      r.linked_work_ids.some((x) => String(x || '').trim() === wid);
    return lw === wid || inList;
  });
  if (!rows.length) return null;

  rows.sort((a, b) => {
    const tb = String(b.updated_at || b.created_at || '');
    const ta = String(a.updated_at || a.created_at || '');
    return tb.localeCompare(ta);
  });

  const prefer =
    rows.find((r) => !r.linked_run_id || !String(r.linked_run_id).trim()) || rows[0];
  const existing =
    prefer.linked_run_id != null ? String(prefer.linked_run_id).trim() : '';

  if (existing && existing !== rid) {
    return patchAgentWorkQueueItem(
      prefer.id,
      { proof_refs_append: [`dispatch_run:${rid}`] },
      filePath
    );
  }

  if (existing === rid) return prefer;

  return patchAgentWorkQueueItem(prefer.id, { linked_run_id: rid }, filePath);
}

/**
 * @param {string} awqId
 * @param {string} proofLine
 * @param {string} [filePath]
 */
export async function appendAgentWorkQueueProofById(awqId, proofLine, filePath = resolveAgentWorkQueuePath()) {
  const id = String(awqId || '').trim();
  const proof = String(proofLine || '').trim().slice(0, 4000);
  if (!id || !/^AWQ-/i.test(id) || !proof) return null;
  const prev = await getAgentWorkQueueItem(id, filePath);
  if (!prev) return null;
  return patchAgentWorkQueueItem(id, { proof_refs_append: [proof] }, filePath);
}

/**
 * `linked_run_id` 가 일치하는 최근 활성 행에 증거 한 줄 append.
 *
 * @param {string} runId
 * @param {string} proofLine
 * @param {string} [filePath]
 */
export async function appendAgentWorkQueueProofByLinkedRun(
  runId,
  proofLine,
  filePath = resolveAgentWorkQueuePath()
) {
  const rid = String(runId || '').trim();
  const proof = String(proofLine || '').trim().slice(0, 4000);
  if (!rid || !proof) return null;
  const items = await readJsonArray(filePath);
  const matches = items.filter(
    (r) =>
      r &&
      /^AWQ-/i.test(r.id) &&
      r.linked_run_id &&
      String(r.linked_run_id).trim() === rid &&
      r.status !== 'cancelled'
  );
  if (!matches.length) return null;
  matches.sort((a, b) => {
    const tb = String(b.updated_at || b.created_at || '');
    const ta = String(a.updated_at || a.created_at || '');
    return tb.localeCompare(ta);
  });
  return patchAgentWorkQueueItem(matches[0].id, { proof_refs_append: [proof] }, filePath);
}

/**
 * `linked_work_id` / `linked_work_ids` 가 WRK와 맞는 활성 행에 증거 append.
 * `linked_run_id` 가 아직 비어 있거나 dispatch 경로가 어긋난 경우 **폐루프**용 폴백.
 *
 * @param {string} workId `WRK-…`
 * @param {string} proofLine
 * @param {{ preferRunId?: string | null }} [opts]
 * @param {string} [filePath]
 */
export async function appendAgentWorkQueueProofByLinkedWork(
  workId,
  proofLine,
  opts = {},
  filePath = resolveAgentWorkQueuePath(),
) {
  const wid = String(workId || '').trim();
  const proof = String(proofLine || '').trim().slice(0, 4000);
  const preferRid = opts.preferRunId != null ? String(opts.preferRunId).trim() : '';
  if (!wid || !proof) return null;

  const items = await readJsonArray(filePath);
  const rows = items.filter((r) => {
    if (!r || typeof r.id !== 'string' || !/^AWQ-/i.test(r.id)) return false;
    if (!LINK_RUN_ACTIVE.has(r.status)) return false;
    const lw = r.linked_work_id != null ? String(r.linked_work_id).trim() : '';
    const inList =
      Array.isArray(r.linked_work_ids) &&
      r.linked_work_ids.some((x) => String(x || '').trim() === wid);
    return lw === wid || inList;
  });
  if (!rows.length) return null;

  rows.sort((a, b) => {
    const runMatch = (x) =>
      preferRid &&
      x.linked_run_id != null &&
      String(x.linked_run_id).trim() === preferRid;
    const ma = runMatch(a) ? 1 : 0;
    const mb = runMatch(b) ? 1 : 0;
    if (mb !== ma) return mb - ma;
    const tb = String(b.updated_at || b.created_at || '');
    const ta = String(a.updated_at || a.created_at || '');
    return tb.localeCompare(ta);
  });

  return patchAgentWorkQueueItem(rows[0].id, { proof_refs_append: [proof] }, filePath);
}

/**
 * @param {string} id `AWQ-…`
 * @param {object} patch
 * @param {AgentWorkQueueStatus} [patch.status]
 * @param {string|null} [patch.linked_work_id]
 * @param {string|null} [patch.linked_run_id]
 * @param {string|null} [patch.blocker]
 * @param {string[]} [patch.proof_refs_append]
 */
export async function patchAgentWorkQueueItem(id, patch, filePath = resolveAgentWorkQueuePath()) {
  const qid = String(id || '').trim();
  if (!qid) return null;
  const items = await readJsonArray(filePath);
  const i = items.findIndex((r) => r && r.id === qid);
  if (i === -1) return null;
  const row = { ...items[i] };
  if (patch.status != null) {
    const s = String(patch.status);
    if (!ALLOWED_STATUS.has(s)) return null;
    row.status = /** @type {AgentWorkQueueStatus} */ (s);
  }
  if (patch.linked_work_id !== undefined) {
    row.linked_work_id = patch.linked_work_id ? String(patch.linked_work_id).trim() : null;
  }
  if (patch.linked_run_id !== undefined) {
    row.linked_run_id = patch.linked_run_id ? String(patch.linked_run_id).trim() : null;
  }
  if (patch.blocker !== undefined) {
    row.blocker = patch.blocker != null ? String(patch.blocker).trim() : null;
  }
  if (Array.isArray(patch.proof_refs_append) && patch.proof_refs_append.length) {
    const prev = Array.isArray(row.proof_refs) ? row.proof_refs : [];
    row.proof_refs = [...prev, ...patch.proof_refs_append.map((x) => String(x))];
  }
  row.updated_at = new Date().toISOString();
  items[i] = row;
  await writeJsonArray(filePath, items);
  try {
    console.info(
      JSON.stringify({
        event: 'agent_work_queue_patch',
        ts: row.updated_at,
        id: row.id,
        status: row.status,
      })
    );
  } catch {
    // ignore
  }
  return row;
}

/**
 * @param {object} record
 */
export function formatAgentWorkQueueSlackLine(record) {
  const wrk = record.linked_work_id ? ` · WRK \`${record.linked_work_id}\`` : '';
  const gate =
    record.status === 'pending_executive'
      ? ' — *대표/위임 승인 게이트(매트릭스 v1)*'
      : '';
  return `\`work_queue_id\`: \`${record.id}\` — 상태 \`${record.status}\`${wrk}${gate}`;
}
