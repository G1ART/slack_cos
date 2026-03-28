/**
 * North Star 최단거리 — Slack → JSON 인테이크 큐.
 * 구현·플랫폼 아이디어(`실행큐:`)와 고객 피드백(`고객피드백:`)을 저장해
 * 대표 결재·Cursor/에이전트 후속 작업의 단일 진입으로 쓴다.
 * 자연어: `실행큐에 올려줘` + 다음 줄, `실행큐에 올려줘: 본문` 등 (`tryParseNaturalWorkspaceQueueIntake`).
 * @see docs/cursor-handoffs/WRK-260326-01_workspace_queue_intake.md
 */

import { resolveCosWorkspaceQueuePath } from '../storage/paths.js';
import { appendJsonRecord, readJsonArray, writeJsonArray } from '../storage/jsonStore.js';

/** @typedef {'spec_intake' | 'customer_feedback'} WorkspaceQueueKind */

function makeQueueId(kind) {
  const p = kind === 'customer_feedback' ? 'CFB' : 'CWS';
  return `${p}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

/** @returns {boolean} */
function isSpecIntakeFirstLine(line) {
  const s = String(line || '').trim();
  if (!s) return false;
  return (
    /^실행\s*큐에\s*올려(줘)?$/u.test(s) ||
    /^실행\s*큐에\s*저장(해줘)?$/u.test(s) ||
    /^실행\s*큐에\s*추가(해줘)?$/u.test(s) ||
    /^구현\s*큐에\s*넣어(줘)?$/u.test(s) ||
    /^워크\s*스페이스\s*큐에\s*올려(줘)?$/u.test(s) ||
    /^이걸\s*실행\s*큐에(\s*넣어(줘)?)?$/u.test(s) ||
    /^이\s*내용을\s*실행\s*큐에(\s*넣어(줘)?)?$/u.test(s)
  );
}

/** @returns {boolean} */
function isFeedbackFirstLine(line) {
  const s = String(line || '').trim();
  if (!s) return false;
  return (
    /^고객\s*피드백(으로)?\s*저장(해줘)?$/u.test(s) ||
    /^피드백\s*큐에\s*(넣어|올려)(줘)?$/u.test(s) ||
    /^고객\s*목소리\s*(저장|기록)(해줘)?$/u.test(s) ||
    /^이걸\s*고객\s*피드백(으로)?\s*(저장(해줘)?)?$/u.test(s) ||
    /^제품\s*피드백\s*(저장|기록)?(해줘)?$/u.test(s) ||
    /^사용자\s*피드백\s*(저장|기록)?(해줘)?$/u.test(s) ||
    /^고객\s*의견\s*(저장|기록)?(해줘)?$/u.test(s)
  );
}

/**
 * 평문·멀티라인 인테이크 (구조화 `실행큐:` 없이).
 * @param {string} text `normalizeSlackUserPayload` 등으로 정리된 전체
 * @returns {{ kind: WorkspaceQueueKind, body: string, natural: true } | null}
 */
export function tryParseNaturalWorkspaceQueueIntake(text) {
  const full = String(text || '').trim();
  if (!full) return null;
  // 구조화 접두와 혼동 방지
  if (/^실행큐\s*:/u.test(full) || /^고객\s*피드백\s*:/u.test(full)) return null;

  const specOneLine = full.match(/^실행\s*큐에\s*올려(줘)?\s*:\s*(.+)$/su);
  if (specOneLine) {
    const body = specOneLine[2].trim();
    if (body) return { kind: 'spec_intake', body, natural: true };
  }
  const fbOneLine = full.match(/^고객\s*피드백(으로)?\s*저장(해줘)?\s*:\s*(.+)$/su);
  if (fbOneLine) {
    const body = fbOneLine[3].trim();
    if (body) return { kind: 'customer_feedback', body, natural: true };
  }
  const fbOneLine2 = full.match(/^피드백\s*큐에\s*(?:넣어|올려)(줘)?\s*:\s*(.+)$/su);
  if (fbOneLine2) {
    const body = fbOneLine2[2].trim();
    if (body) return { kind: 'customer_feedback', body, natural: true };
  }

  const lines = full.split(/\r?\n/);
  const first = lines[0].trim();
  const rest = lines.slice(1).join('\n').trim();

  if (isFeedbackFirstLine(first)) {
    return { kind: 'customer_feedback', body: rest, natural: true };
  }
  if (isSpecIntakeFirstLine(first)) {
    return { kind: 'spec_intake', body: rest, natural: true };
  }
  return null;
}

export function formatNaturalWorkspaceQueueHint(kind) {
  const spec =
    '실행 큐에 올릴 **본문을 다음 줄**에 적어 주세요.\n' +
    '또는 한 줄로: `실행큐에 올려줘: (아이디어 요약)`';
  const fb =
    '고객 피드백 **본문을 다음 줄**에 적어 주세요.\n' +
    '또는 한 줄로: `고객피드백으로 저장: (내용)`';
  return kind === 'customer_feedback' ? fb : spec;
}

function inferTitle(body) {
  const line = String(body || '')
    .split(/\r?\n/)
    .map((s) => s.trim())
    .find(Boolean);
  if (!line) return '(본문 없음)';
  return line.length > 160 ? `${line.slice(0, 157)}…` : line;
}

/**
 * @param {object} p
 * @param {WorkspaceQueueKind} p.kind
 * @param {string} p.body
 * @param {object} p.metadata
 * @param {object|null} p.channelContext
 * @param {string} [p.filePath]
 */
export async function appendWorkspaceQueueItem(
  { kind, body, metadata, channelContext },
  filePath = resolveCosWorkspaceQueuePath()
) {
  const record = {
    id: makeQueueId(kind),
    kind,
    status: 'pending_review',
    title: inferTitle(body),
    body: String(body || '').trim(),
    created_at: new Date().toISOString(),
    source: metadata || {},
    channel_context: channelContext || null,
  };
  await appendJsonRecord(filePath, record);
  try {
    console.info(
      JSON.stringify({
        event: 'cos_workspace_queue_intake',
        ts: record.created_at,
        id: record.id,
        kind: record.kind,
        title: record.title,
      })
    );
  } catch {
    // ignore
  }
  return record;
}

/**
 * @param {WorkspaceQueueKind|null} kindFilter
 * @param {number} count
 * @param {string} [filePath]
 */
export async function listWorkspaceQueueRecent(kindFilter, count, filePath = resolveCosWorkspaceQueuePath()) {
  const items = await readJsonArray(filePath);
  const filtered = kindFilter ? items.filter((i) => i && i.kind === kindFilter) : items;
  const n = Math.max(1, Math.min(Number(count) || 5, 30));
  return filtered.slice(-n).reverse();
}

/**
 * @param {object} record
 */
export function formatWorkspaceQueueSaved(record, { natural = false } = {}) {
  const isFb = record.kind === 'customer_feedback';
  const label = isFb ? '고객 피드백' : '실행 큐 (구현·아이디어)';
  const via = natural ? ' (자연어 인테이크)' : '';
  const promote =
    !isFb && record.kind === 'spec_intake'
      ? [
          '',
          '*PLN·WRK 자동 생성 (한 줄)*',
          `\`실행큐계획화 ${record.id}\` 또는 \`실행큐계획화 최근\``,
          '_승인 정책상 `review_pending`이면 `계획승인` 후 `커서발행`으로 Cursor/에이전트에 넘기면 됩니다._',
        ].join('\n')
      : '';
  return [
    `*${label} 저장*${via} — \`${record.id}\``,
    `상태: \`${record.status}\` — COS·에이전트가 이어가거나, 필요 시 \`업무등록:\` · \`계획등록:\` · \`커서발행\`으로 연결하면 됩니다.`,
    promote,
    '',
    '*요약*',
    record.title,
    '',
    `_파일: data/cos-workspace-queue.json (또는 COS_WORKSPACE_QUEUE_FILE)_`,
  ].join('\n');
}

/**
 * @param {string} id
 * @param {Record<string, unknown>} patch
 * @param {string} [filePath]
 * @returns {Promise<object | null>}
 */
export async function patchWorkspaceQueueItem(id, patch, filePath = resolveCosWorkspaceQueuePath()) {
  const qid = String(id || '').trim();
  if (!qid) return null;
  const items = await readJsonArray(filePath);
  const idx = items.findIndex((x) => x && x.id === qid);
  if (idx < 0) return null;
  const next = {
    ...items[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  items[idx] = next;
  await writeJsonArray(filePath, items);
  return next;
}

/**
 * @param {object[]} items
 * @param {string} heading
 */
export function formatWorkspaceQueueList(items, heading) {
  if (!items.length) {
    return `${heading}에 해당하는 항목이 없습니다.`;
  }
  const lines = items.map((r) => {
    const k = r.kind === 'customer_feedback' ? '피드백' : '실행';
    return `- \`${r.id}\` · ${k} · ${String(r.title || '').slice(0, 72)}`;
  });
  return [`*${heading}* (최근 ${items.length}건)`, ...lines].join('\n');
}
