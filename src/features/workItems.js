import { getStoreCore } from '../storage/core/index.js';
import { formatGithubArtifactSummaryLines } from '../adapters/githubAdapter.js';
import { formatCursorHandoffSummaryLines } from './cursorHandoff.js';
import {
  deriveDisplayLifecycle,
  formatCursorOneliner,
  formatGithubOneliner,
  formatReviewOneliner,
  normalizeWorkLifecycleStatus,
} from './workLifecycle.js';

export const WORK_STATUS = [
  'proposed', // draft 동급 초안(명시적)
  'draft',
  'pending_approval',
  'approved',
  'assigned',
  'dispatched',
  'in_progress',
  'blocked',
  'review', // legacy — 새 코드는 review_requested 사용
  'review_requested',
  'needs_revision',
  'done',
  'rejected',
  'canceled',
];

export const PROJECT_KEYS = ['abstract', 'slack_cos', 'shared_tools', 'g1_ops'];
export const TOOL_KEYS = ['cursor', 'supabase', 'github', 'docs', 'manual'];
export const WORK_TYPES = ['bug', 'feature', 'refactor', 'ops', 'content', 'data', 'research'];

let recentWorkAliasIds = [];

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function getYYMMDD(value = new Date()) {
  const d = new Date(value);
  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseSeqFromWorkId(workId) {
  const match = safeTrim(workId).match(/^WRK-\d{6}-(\d{2,})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

async function buildNextWorkId(items, now = new Date()) {
  const yymmdd = getYYMMDD(now);
  let maxSeq = 0;
  for (const item of items) {
    const id = safeTrim(item?.id);
    if (!id.startsWith(`WRK-${yymmdd}-`)) continue;
    const seq = parseSeqFromWorkId(id);
    if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
  }
  return `WRK-${yymmdd}-${pad2(maxSeq + 1)}`;
}

function inferWorkType(text) {
  const t = text.toLowerCase();
  if (/(버그|오류|깨짐|fix|bug)/.test(t)) return 'bug';
  if (/(리팩터|refactor|구조개선)/.test(t)) return 'refactor';
  if (/(문서|정리|가이드|docs)/.test(t)) return 'content';
  if (/(데이터|지표|분석|etl|db)/.test(t)) return 'data';
  if (/(조사|리서치|검토)/.test(t)) return 'research';
  if (/(운영|프로세스|정책|제출)/.test(t)) return 'ops';
  return 'feature';
}

function inferPriority(text) {
  const t = text.toLowerCase();
  if (/(긴급|오늘|즉시|critical|치명)/.test(t)) return 'high';
  if (/(이번주|빠르게|우선)/.test(t)) return 'medium';
  return 'normal';
}

function inferTool(text) {
  const t = text.toLowerCase();
  if (/(db|sql|supabase|마이그레이션|정책)/.test(t)) return 'supabase';
  if (/(pr|issue|리포지토리|github|깃허브)/.test(t)) return 'github';
  if (/(문서|docs|md|핸드오프|가이드)/.test(t)) return 'docs';
  if (/(코드|cursor|리팩터|구현|버그|테스트)/.test(t)) return 'cursor';
  return 'manual';
}

function inferApprovalRequired(text) {
  const t = text.toLowerCase();
  return /(대외|외부|브랜드|돈|예산|계약|법무|보안|배포|마이그레이션)/.test(t);
}

function inferWorkCandidate(text) {
  const t = String(text || '');
  return /(고쳐|수정|추가|만들어|배포|연결|마이그레이션|리팩터링|정리해|문서화해)/.test(t);
}

function inferTitle(text) {
  const clean = safeTrim(text).replace(/^업무등록:?\s*/, '');
  return clean.slice(0, 80) || '새 작업';
}

function parseBracketOrNumeric(token) {
  const t = safeTrim(token);
  const b = t.match(/^\[(\d+)\]$/);
  if (b) return b[1];
  return t;
}

function toOpenStatus(item) {
  return item.status !== 'done' && item.status !== 'canceled';
}

export function parseWorkRegisterText(raw) {
  const text = safeTrim(raw);
  const clean = text.replace(/^업무등록:?\s*/, '');
  return {
    title: inferTitle(text),
    brief: clean,
    work_type: inferWorkType(clean),
    priority: inferPriority(clean),
    assigned_tool: inferTool(clean),
    approval_required: inferApprovalRequired(clean),
    acceptance_criteria: [],
    dependencies: [],
    notes: '',
  };
}

export async function createWorkItem({
  project_key = 'shared_tools',
  tool_key = 'manual',
  work_type = 'feature',
  owner_type = 'persona',
  assigned_persona = 'general_cos',
  assigned_tool = 'manual',
  repo_key = null,
  branch_name = null,
  issue_title = null,
  pr_title = null,
  github_kind = null,
  db_scope = null,
  migration_name = null,
  function_name = null,
  table_targets = [],
  policy_targets = [],
  storage_targets = [],
  supabase_kind = null,
  title,
  brief,
  acceptance_criteria = [],
  dependencies = [],
  approval_required = false,
  source = {},
  source_channel = null,
  source_message_ts = null,
  notes = '',
  /** Phase 3a: planner에서 생성된 업무 */
  source_plan_id = null,
  /** 실행 큐(spec)에서 PLN으로 승격된 경우 */
  source_workspace_queue_id = null,
  /** draft 등 명시 시 기본 승인/초안 규칙을 덮어씀 */
  status_override = null,
  approval_status_override = null,
}) {
  const items = await getStoreCore().list('work_items');
  const id = await buildNextWorkId(items);
  const now = new Date().toISOString();
  let status = approval_required ? 'pending_approval' : 'draft';
  let approval_status = approval_required ? 'pending' : 'not_required';
  if (status_override != null && WORK_STATUS.includes(status_override)) {
    status = status_override;
  }
  if (approval_status_override != null) {
    approval_status = approval_status_override;
  }

  const record = {
    id,
    project_key: PROJECT_KEYS.includes(project_key) ? project_key : 'shared_tools',
    tool_key: TOOL_KEYS.includes(tool_key) ? tool_key : 'manual',
    work_type: WORK_TYPES.includes(work_type) ? work_type : 'feature',
    status,
    priority: safeTrim(source?.priority) || 'normal',
    owner_type,
    assigned_persona,
    assigned_tool: TOOL_KEYS.includes(assigned_tool) ? assigned_tool : 'manual',
    repo_key,
    branch_name,
    issue_title,
    pr_title,
    github_kind,
    db_scope,
    migration_name,
    function_name,
    table_targets: Array.isArray(table_targets) ? table_targets : [],
    policy_targets: Array.isArray(policy_targets) ? policy_targets : [],
    storage_targets: Array.isArray(storage_targets) ? storage_targets : [],
    supabase_kind,
    title: safeTrim(title) || '새 작업',
    brief: safeTrim(brief),
    acceptance_criteria: Array.isArray(acceptance_criteria) ? acceptance_criteria : [],
    dependencies: Array.isArray(dependencies) ? dependencies : [],
    approval_required: Boolean(approval_required),
    approval_status,
    source,
    source_channel,
    source_message_ts,
    created_at: now,
    updated_at: now,
    notes: safeTrim(notes),
    source_approval_id: null,
    source_plan_id: source_plan_id ? safeTrim(source_plan_id) : null,
    source_workspace_queue_id: source_workspace_queue_id
      ? safeTrim(String(source_workspace_queue_id))
      : null,
  };

  items.push(record);
  await getStoreCore().replaceAll('work_items', items);
  return record;
}

export async function listWorkItems({ count = 20, projectKey = null, openOnly = true } = {}) {
  const items = await getStoreCore().list('work_items');
  let filtered = [...items];
  if (projectKey) filtered = filtered.filter((i) => i.project_key === projectKey);
  if (openOnly) filtered = filtered.filter(toOpenStatus);
  filtered.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return filtered.slice(0, count);
}

export async function getWorkItem(workIdOrAlias) {
  const items = await getStoreCore().list('work_items');
  let token = parseBracketOrNumeric(workIdOrAlias);
  let resolvedId = token;

  if (/^\d+$/.test(token) && recentWorkAliasIds.length) {
    const idx = Number(token) - 1;
    if (idx >= 0 && idx < recentWorkAliasIds.length) resolvedId = recentWorkAliasIds[idx];
  }
  return items.find((i) => i.id === resolvedId) || null;
}

export async function updateWorkStatus(workIdOrAlias, nextStatus, opts = {}) {
  let resolvedNext = nextStatus === 'review' ? 'review_requested' : nextStatus;
  if (!WORK_STATUS.includes(resolvedNext)) return { ok: false, reason: 'invalid_status' };
  const items = await getStoreCore().list('work_items');
  let token = parseBracketOrNumeric(workIdOrAlias);
  let resolvedId = token;
  if (/^\d+$/.test(token) && recentWorkAliasIds.length) {
    const idx = Number(token) - 1;
    if (idx >= 0 && idx < recentWorkAliasIds.length) resolvedId = recentWorkAliasIds[idx];
  }
  const index = items.findIndex((i) => i.id === resolvedId);
  if (index < 0) return { ok: false, reason: 'not_found' };

  const current = items[index];
  if (resolvedNext === 'done' && current.status === 'done') {
    return { ok: true, record: current, idempotent: true };
  }

  const now = new Date().toISOString();

  if (resolvedNext === 'needs_revision' && current.status === 'needs_revision') {
    const noteLine = safeTrim(opts.note || '');
    const reasonFromNote = noteLine.replace(/^업무수정요청:\s*/i, '').trim();
    if (reasonFromNote && current.notes && current.notes.includes(`업무수정요청: ${reasonFromNote}`)) {
      return { ok: true, record: current, idempotent: true };
    }
    const next = { ...current, updated_at: now };
    if (noteLine) next.notes = safeTrim([current.notes, noteLine].filter(Boolean).join('\n'));
    items[index] = next;
    await getStoreCore().replaceAll('work_items', items);
    return { ok: true, record: next };
  }

  const next = { ...current, status: resolvedNext, updated_at: now };

  if (opts.note) next.notes = safeTrim([current.notes, opts.note].filter(Boolean).join('\n'));
  if (opts.source_approval_id) next.source_approval_id = opts.source_approval_id;

  if (current.approval_required) {
    if (
      resolvedNext === 'approved' ||
      resolvedNext === 'assigned' ||
      resolvedNext === 'in_progress' ||
      resolvedNext === 'dispatched'
    ) {
      next.approval_status = 'approved';
    } else if (resolvedNext === 'pending_approval') {
      next.approval_status = 'pending';
    } else if (resolvedNext === 'canceled') {
      next.approval_status = 'canceled';
    } else if (resolvedNext === 'rejected') {
      next.approval_status = 'rejected';
    }
  }

  items[index] = next;
  await getStoreCore().replaceAll('work_items', items);
  return { ok: true, record: next };
}

export async function assignWorkItem(workIdOrAlias, assigneeToken, opts = {}) {
  const items = await getStoreCore().list('work_items');
  let token = parseBracketOrNumeric(workIdOrAlias);
  let resolvedId = token;
  if (/^\d+$/.test(token) && recentWorkAliasIds.length) {
    const idx = Number(token) - 1;
    if (idx >= 0 && idx < recentWorkAliasIds.length) resolvedId = recentWorkAliasIds[idx];
  }
  const index = items.findIndex((i) => i.id === resolvedId);
  if (index < 0) return { ok: false, reason: 'not_found' };

  const current = items[index];
  const normalized = safeTrim(assigneeToken).toLowerCase();
  const isTool = TOOL_KEYS.includes(normalized);
  const now = new Date().toISOString();

  const next = {
    ...current,
    owner_type: isTool ? 'tool' : 'persona',
    assigned_persona: isTool ? current.assigned_persona : normalized,
    assigned_tool: isTool ? normalized : current.assigned_tool,
    status: current.status === 'approved' || current.status === 'draft' ? 'assigned' : current.status,
    updated_at: now,
  };
  if (opts.note) next.notes = safeTrim([current.notes, opts.note].filter(Boolean).join('\n'));

  items[index] = next;
  await getStoreCore().replaceAll('work_items', items);
  return { ok: true, record: next };
}

export function summarizeWorkItems(records, { projectKey = null } = {}) {
  if (!records.length) return '현재 업무 항목이 없습니다.';
  const countByStatus = new Map();
  for (const r of records) {
    countByStatus.set(r.status, (countByStatus.get(r.status) || 0) + 1);
  }
  const statusSummary = [...countByStatus.entries()]
    .map(([k, v]) => `${k}:${v}`)
    .join(', ');
  return [
    `업무 요약${projectKey ? ` (${projectKey})` : ''}`,
    `- 총 ${records.length}건`,
    `- 상태 분포: ${statusSummary}`,
  ].join('\n');
}

export function generateDispatchPayload(item) {
  const base = {
    work_id: item.id,
    project_key: item.project_key,
    work_type: item.work_type,
    title: item.title,
    brief: item.brief,
    acceptance_criteria: item.acceptance_criteria,
    dependencies: item.dependencies,
    priority: item.priority,
    notes: item.notes,
  };
  const tool = item.assigned_tool || item.tool_key || 'manual';

  if (tool === 'cursor') {
    return [
      '[Cursor Dispatch]',
      `Work ID: ${item.id}`,
      `Project: ${item.project_key}`,
      `Type/Priority: ${item.work_type} / ${item.priority}`,
      `Title: ${item.title}`,
      `Brief: ${item.brief}`,
      `Acceptance Criteria: ${(item.acceptance_criteria || []).join(' | ') || '없음'}`,
      `Dependencies: ${(item.dependencies || []).join(', ') || '없음'}`,
      `Notes: ${item.notes || '없음'}`,
    ].join('\n');
  }

  if (tool === 'supabase') {
    return JSON.stringify(
      {
        kind: 'supabase_work_brief',
        ...base,
        db_focus: 'schema/policy/migration',
        safety_check: 'rollback plan required',
      },
      null,
      2
    );
  }

  if (tool === 'github') {
    return JSON.stringify(
      {
        kind: 'github_issue_pr_payload',
        ...base,
        suggested_issue_title: `[${item.project_key}] ${item.title}`,
        pr_checklist: ['scope agreed', 'tests updated', 'risk note added'],
      },
      null,
      2
    );
  }

  if (tool === 'docs') {
    return JSON.stringify(
      {
        kind: 'docs_update_request',
        ...base,
        doc_type: 'handoff/runbook/spec',
        audience: 'internal',
      },
      null,
      2
    );
  }

  return [
    '[Manual Dispatch Memo]',
    `work_id=${item.id}`,
    `project=${item.project_key}`,
    `title=${item.title}`,
    `brief=${item.brief}`,
    `next=${(item.acceptance_criteria || []).join('; ') || 'acceptance 정의 필요'}`,
  ].join('\n');
}

export function formatWorkItemList(records) {
  if (!records.length) return '현재 업무 항목이 없습니다.';
  recentWorkAliasIds = records.map((r) => r.id);
  return [
    '업무 대기 목록',
    ...records.map(
      (r, i) =>
        `[${i + 1}] ${r.id}\n- 프로젝트: ${r.project_key}\n- 상태: ${r.status} / 승인: ${r.approval_status}\n- 담당: ${r.owner_type}:${r.owner_type === 'tool' ? r.assigned_tool : r.assigned_persona}\n- 제목: ${r.title}`
    ),
  ].join('\n\n');
}

function extractRevisionNotes(notes) {
  const raw = String(notes || '');
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^업무수정요청:/i.test(l))
    .slice(-5);
}

export function formatWorkItemDetail(item, { plan = null, latestRun = null, latestCursorRun = null } = {}) {
  if (!item) return '업무를 찾지 못했습니다.';
  const ghArtifacts = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
  const ghIssue =
    ghArtifacts.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue') ||
    (item.github_artifact?.artifact_type === 'issue' ? item.github_artifact : null);
  const ghBlock = formatGithubArtifactSummaryLines(ghIssue, {
    header: '── GitHub issue (요약) ──',
  });
  const cursorArts = Array.isArray(item.cursor_artifacts) ? item.cursor_artifacts : [];
  const cursorHandoff =
    cursorArts.find((a) => a?.provider === 'cursor' && a?.artifact_type === 'handoff') ||
    (item.cursor_handoff_artifact?.artifact_type === 'handoff' ? item.cursor_handoff_artifact : null);
  const cursorBlock = formatCursorHandoffSummaryLines(cursorHandoff, {
    header: '── Cursor handoff (요약) ──',
  });
  const disp = deriveDisplayLifecycle(item, plan);
  const runCount = cursorArts.filter((a) => a?.provider === 'cursor').length;
  const cursorResultLine =
    latestCursorRun?.result_summary?.trim() ||
    cursorHandoff?.result_notes?.trim() ||
    (runCount ? `(cursor artifacts ${runCount}건, 상세는 커서상세)` : '');
  const genericLatest =
    latestRun?.result_summary?.trim() && latestRun.run_id !== latestCursorRun?.run_id
      ? `${latestRun.run_id}: ${latestRun.result_summary.trim().slice(0, 200)}`
      : '';
  const artifactSummary =
    cursorResultLine?.slice(0, 200) ||
    latestRun?.result_summary?.slice(0, 200) ||
    (runCount ? `cursor artifacts: ${runCount}` : '—');

  const nextActions = [];
  if (disp === 'approval_pending') nextActions.push('계획승인 (plan) 후 발행 명령');
  if (['assigned', 'approved', 'dispatched', 'in_progress'].includes(disp)) {
    if (item.assigned_tool === 'cursor') nextActions.push('커서발행 / 커서결과기록');
    if (item.assigned_tool === 'github') nextActions.push('이슈발행');
    nextActions.push('업무검토 / 업무완료');
  }
  if (disp === 'review_requested' || disp === 'review') nextActions.push('업무검토 / 업무완료 / 업무수정요청');
  if (disp === 'needs_revision') nextActions.push('커서발행 또는 커서결과기록(재기록) / 업무검토');
  if (disp === 'done') nextActions.push('(종료) 동일 업무완료 재호출은 no-op');
  if (disp === 'blocked') nextActions.push('업무재개 | 막힘등록 사유 확인');
  if (disp === 'rejected') nextActions.push('업무취소 | 신규 범위는 계획등록');

  const revLines = extractRevisionNotes(item.notes);

  return [
    `업무 상세 (${item.id})`,
    `- work_id: ${item.id}`,
    `- parent_plan_id: ${item.source_plan_id || '—'}`,
    `- source_workspace_queue_id: ${item.source_workspace_queue_id || '—'}`,
    `- lifecycle (display): ${disp} | work.status(raw): ${normalizeWorkLifecycleStatus(item.status)}`,
    '',
    '── 상태 한줄 요약 ──',
    formatGithubOneliner(ghIssue),
    formatCursorOneliner(cursorHandoff, latestCursorRun),
    formatReviewOneliner(disp),
    '',
    '── 최신 실행·결과 ──',
    `- latest_run: ${latestRun?.run_id || '—'} | tool: ${latestRun?.tool_key || '—'} | run_status: ${latestRun?.status || '—'}`,
    `- latest_cursor_run: ${latestCursorRun?.run_id || '—'} | ${latestCursorRun?.status || '—'}`,
    `- latest_result (요약): ${artifactSummary}`,
    genericLatest ? `- other_run_result: ${genericLatest}` : null,
    revLines.length
      ? ['', '── 수정요청 이력 (notes) ──', ...revLines.map((l) => `  ${l}`)].join('\n')
      : null,
    '',
    `- last_updated: ${item.updated_at}`,
    `- next_allowed_actions: ${nextActions.length ? nextActions.join(' | ') : '—'}`,
    '',
    ...(ghBlock.length ? [...ghBlock, ''] : []),
    ...(cursorBlock.length ? [...cursorBlock, ''] : []),
    `- project_key: ${item.project_key}`,
    `- tool_key: ${item.tool_key}`,
    `- work_type: ${item.work_type}`,
    `- status: ${item.status}`,
    `- priority: ${item.priority}`,
    `- owner_type: ${item.owner_type}`,
    `- assigned_persona: ${item.assigned_persona}`,
    `- assigned_tool: ${item.assigned_tool}`,
    `- repo_key: ${item.repo_key || '없음'}`,
    `- github_kind: ${item.github_kind || '없음'}`,
    `- branch_name: ${item.branch_name || '없음'}`,
    `- issue_title: ${item.issue_title || '없음'}`,
    `- pr_title: ${item.pr_title || '없음'}`,
    `- github_issue_url: ${ghIssue?.issue_url || '없음'}`,
    `- github_issue_number: ${ghIssue?.issue_number ?? '없음'}`,
    `- github_issue_state: ${ghIssue?.state || '없음'}`,
    `- github_issue_updated_at: ${ghIssue?.updated_at || '없음'}`,
    `- title: ${item.title}`,
    `- db_scope: ${item.db_scope || '없음'}`,
    `- supabase_kind: ${item.supabase_kind || '없음'}`,
    `- migration_name: ${item.migration_name || '없음'}`,
    `- function_name: ${item.function_name || '없음'}`,
    `- table_targets: ${(item.table_targets || []).join(', ') || '없음'}`,
    `- policy_targets: ${(item.policy_targets || []).join(', ') || '없음'}`,
    `- storage_targets: ${(item.storage_targets || []).join(', ') || '없음'}`,
    `- brief: ${item.brief}`,
    `- acceptance_criteria: ${(item.acceptance_criteria || []).join(' | ') || '없음'}`,
    `- dependencies: ${(item.dependencies || []).join(', ') || '없음'}`,
    `- approval_required: ${item.approval_required}`,
    `- approval_status: ${item.approval_status}`,
    `- source_approval_id: ${item.source_approval_id || '없음'}`,
    `- source_channel: ${item.source_channel || '없음'}`,
    `- source_message_ts: ${item.source_message_ts || '없음'}`,
    `- source_plan_id: ${item.source_plan_id || '없음'}`,
    `- source_workspace_queue_id: ${item.source_workspace_queue_id || '없음'}`,
    `- created_at: ${item.created_at}`,
    `- updated_at: ${item.updated_at}`,
    `- notes: ${item.notes || '없음'}`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * 조회형 `업무상세` 전용 — 구조화 블록 + 짧은 Next (Council 금지 구역)
 */
export function formatWorkItemDetailQuery(item, { plan = null, latestRun = null, latestCursorRun = null } = {}) {
  if (!item) {
    return '[업무상세] work를 찾지 못했습니다.\n- 형식: 업무상세 <WRK-...|번호>';
  }
  const ghArtifacts = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
  const ghIssue =
    ghArtifacts.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue') ||
    (item.github_artifact?.artifact_type === 'issue' ? item.github_artifact : null);
  const cursorArts = Array.isArray(item.cursor_artifacts) ? item.cursor_artifacts : [];
  const cursorHandoff =
    cursorArts.find((a) => a?.provider === 'cursor' && a?.artifact_type === 'handoff') ||
    (item.cursor_handoff_artifact?.artifact_type === 'handoff' ? item.cursor_handoff_artifact : null);
  const disp = deriveDisplayLifecycle(item, plan);
  const runCount = cursorArts.filter((a) => a?.provider === 'cursor').length;
  const cursorResultLine =
    latestCursorRun?.result_summary?.trim() ||
    cursorHandoff?.result_notes?.trim() ||
    (runCount ? `(cursor artifacts ${runCount}건, 상세: 커서상세)` : '');
  const genericLatest =
    latestRun?.result_summary?.trim() && latestRun.run_id !== latestCursorRun?.run_id
      ? `${latestRun.run_id}: ${latestRun.result_summary.trim().slice(0, 200)}`
      : '';
  const artifactSummary =
    cursorResultLine?.slice(0, 240) ||
    latestRun?.result_summary?.slice(0, 240) ||
    (runCount ? `cursor artifacts: ${runCount}` : '—');

  const nextActions = [];
  if (disp === 'approval_pending') nextActions.push('계획승인(PLN) 후 발행 명령');
  if (['assigned', 'approved', 'dispatched', 'in_progress'].includes(disp)) {
    if (item.assigned_tool === 'cursor') nextActions.push('커서발행 | 커서결과기록');
    if (item.assigned_tool === 'github') nextActions.push('이슈발행');
    nextActions.push('업무검토 | 업무완료');
  }
  if (disp === 'review_requested' || disp === 'review') nextActions.push('업무검토 | 업무완료 | 업무수정요청');
  if (disp === 'needs_revision') nextActions.push('커서발행 | 커서결과기록 | 업무검토');
  if (disp === 'done') nextActions.push('(종료)');
  if (disp === 'blocked') nextActions.push('업무재개 | 막힘등록');
  if (disp === 'rejected') nextActions.push('업무취소 | 계획등록(신규)');

  const revLines = extractRevisionNotes(item.notes);

  return [
    `[업무상세] ${item.id}`,
    `- parent_plan_id: ${item.source_plan_id || '—'}`,
    `- source_workspace_queue_id: ${item.source_workspace_queue_id || '—'}`,
    `- lifecycle (display): ${disp} | work.status(raw): ${normalizeWorkLifecycleStatus(item.status)}`,
    '',
    '── approval ──',
    `- approval_required: ${item.approval_required} | approval_status: ${item.approval_status}`,
    '',
    '── GitHub summary ──',
    formatGithubOneliner(ghIssue),
    ghIssue?.issue_url ? `- issue_url: ${ghIssue.issue_url}` : null,
    ghIssue?.state ? `- issue_state: ${ghIssue.state}` : null,
    '',
    '── Cursor summary ──',
    formatCursorOneliner(cursorHandoff, latestCursorRun),
    cursorHandoff?.handoff_path || cursorHandoff?.dispatch_target
      ? `- handoff_path: ${cursorHandoff.handoff_path || cursorHandoff.dispatch_target}`
      : null,
    '',
    '── Review summary ──',
    formatReviewOneliner(disp),
    '',
    '── latest result / run ──',
    `- latest_run: ${latestRun?.run_id || '—'} | tool: ${latestRun?.tool_key || '—'} | run_status: ${latestRun?.status || '—'}`,
    `- latest_cursor_run: ${latestCursorRun?.run_id || '—'} | status: ${latestCursorRun?.status || '—'}`,
    `- result_summary: ${artifactSummary}`,
    genericLatest ? `- other_run_result: ${genericLatest}` : null,
    revLines.length
      ? ['', '── revision notes (업무수정요청) ──', ...revLines.map((l) => `  ${l}`)].join('\n')
      : null,
    '',
    '── next_allowed_actions ──',
    `- ${nextActions.length ? nextActions.join(' | ') : '—'}`,
    '',
    'Next:',
    `- 업무검토 ${item.id}`,
    `- 커서상세 ${item.id}`,
    item.assigned_tool === 'github' ? `- 깃허브상세 ${item.id}` : null,
    `- 업무완료 ${item.id}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatWorkUpdate(result, label) {
  if (!result.ok) {
    if (result.reason === 'not_found') return '해당 업무 ID를 찾지 못했습니다.';
    if (result.reason === 'invalid_status') return '유효하지 않은 상태 전환입니다.';
    return `${label} 처리에 실패했습니다.`;
  }
  if (result.idempotent) {
    const r = result.record;
    const head =
      label === '업무수정요청'
        ? `[${label}] 동일 사유로 이미 반영됨 (no-op).`
        : `[${label}] 이미 해당 상태입니다 (no-op).`;
    return [head, `- 업무 ID: ${r.id}`, `- 상태: ${r.status}`].join('\n');
  }
  const r = result.record;
  return [
    `${label} 처리 완료`,
    `- 업무 ID: ${r.id}`,
    `- 상태: ${r.status}`,
    `- 승인 상태: ${r.approval_status}`,
    `- 담당: ${r.owner_type}:${r.owner_type === 'tool' ? r.assigned_tool : r.assigned_persona}`,
  ].join('\n');
}

export { inferWorkCandidate };

function resolveWorkIdFromToken(workIdOrAlias) {
  if (!workIdOrAlias) return null;
  const token = parseBracketOrNumeric(workIdOrAlias);
  if (/^\d+$/.test(token) && recentWorkAliasIds.length) {
    const idx = Number(token) - 1;
    if (idx >= 0 && idx < recentWorkAliasIds.length) return recentWorkAliasIds[idx];
  }
  return token;
}

export async function updateWorkItemGithubFields(workIdOrAlias, patch = {}) {
  const workId = resolveWorkIdFromToken(workIdOrAlias);
  if (!workId) return { ok: false, reason: 'invalid_work_id' };
  const items = await getStoreCore().list('work_items');
  const index = items.findIndex((i) => i.id === workId);
  if (index < 0) return { ok: false, reason: 'not_found' };

  const next = { ...items[index], ...patch, updated_at: new Date().toISOString() };
  items[index] = next;
  await getStoreCore().replaceAll('work_items', items);
  return { ok: true, record: next };
}

export async function updateWorkItemCursorFields(workIdOrAlias, patch = {}) {
  const workId = resolveWorkIdFromToken(workIdOrAlias);
  if (!workId) return { ok: false, reason: 'invalid_work_id' };
  const items = await getStoreCore().list('work_items');
  const index = items.findIndex((i) => i.id === workId);
  if (index < 0) return { ok: false, reason: 'not_found' };
  const next = { ...items[index], ...patch, updated_at: new Date().toISOString() };
  items[index] = next;
  await getStoreCore().replaceAll('work_items', items);
  return { ok: true, record: next };
}

export async function updateWorkItemSupabaseFields(workIdOrAlias, patch = {}) {
  const workId = resolveWorkIdFromToken(workIdOrAlias);
  if (!workId) return { ok: false, reason: 'invalid_work_id' };
  const items = await getStoreCore().list('work_items');
  const index = items.findIndex((i) => i.id === workId);
  if (index < 0) return { ok: false, reason: 'not_found' };
  const next = { ...items[index], ...patch, updated_at: new Date().toISOString() };
  items[index] = next;
  await getStoreCore().replaceAll('work_items', items);
  return { ok: true, record: next };
}
