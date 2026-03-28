import { getStoreCore } from '../storage/core/index.js';
import { formatGithubArtifactSummaryLines } from '../adapters/githubAdapter.js';
import { formatCursorHandoffSummaryLines } from './cursorHandoff.js';

export const RUN_STATUS = [
  'drafted',
  'dispatched',
  'running',
  'review',
  'done',
  'failed',
  'blocked',
  'canceled',
];

let recentRunAliasIds = [];

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

function parseSeqFromRunId(runId) {
  const match = safeTrim(runId).match(/^RUN-\d{6}-(\d{2,})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function parseToken(token) {
  const t = safeTrim(token);
  const b = t.match(/^\[(\d+)\]$/);
  if (b) return b[1];
  return t;
}

async function buildNextRunId(items, now = new Date()) {
  const yymmdd = getYYMMDD(now);
  let maxSeq = 0;
  for (const item of items) {
    const id = safeTrim(item?.run_id);
    if (!id.startsWith(`RUN-${yymmdd}-`)) continue;
    const seq = parseSeqFromRunId(id);
    if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
  }
  return `RUN-${yymmdd}-${pad2(maxSeq + 1)}`;
}

function resolveRunIdFromAlias(token) {
  const parsed = parseToken(token);
  if (/^\d+$/.test(parsed) && recentRunAliasIds.length) {
    const idx = Number(parsed) - 1;
    if (idx >= 0 && idx < recentRunAliasIds.length) return recentRunAliasIds[idx];
  }
  return parsed;
}

export async function createWorkRun({
  work_id,
  project_key,
  tool_key,
  adapter_type,
  dispatch_payload,
  dispatch_target = null,
  repo_key = null,
  branch_name = null,
  issue_key = null,
  pr_key = null,
  github_status = 'none',
  github_payload_kind = null,
  review_summary = '',
  merge_readiness = 'unknown',
  db_scope = null,
  migration_name = null,
  function_name = null,
  supabase_payload_kind = null,
  supabase_status = 'none',
  sql_preview = '',
  verification_summary = '',
  rollback_readiness = 'unknown',
  affected_objects = [],
  executor_type = null,
  executor_session_label = null,
  created_by = null,
  notes = '',
}) {
  const items = await getStoreCore().list('work_runs');
  const run_id = await buildNextRunId(items);
  const now = new Date().toISOString();
  const run = {
    run_id,
    work_id,
    project_key,
    tool_key,
    adapter_type,
    status: 'dispatched',
    repo_key,
    branch_name,
    issue_key,
    pr_key,
    github_status,
    github_payload_kind,
    dispatch_payload,
    dispatch_target,
    review_summary,
    merge_readiness,
    db_scope,
    migration_name,
    function_name,
    supabase_status,
    supabase_payload_kind,
    sql_preview,
    verification_summary,
    rollback_readiness,
    affected_objects: Array.isArray(affected_objects) ? affected_objects : [],
    executor_type: executor_type || tool_key || 'manual',
    executor_session_label: executor_session_label || null,
    dispatched_at: now,
    started_at: null,
    finished_at: null,
    result_status: 'none',
    changed_files: [],
    tests_run: [],
    tests_passed: null,
    unresolved_risks: [],
    blockers: [],
    qa_checklist: [],
    qa_status: 'pending',
    reviewer: null,
    reviewed_at: null,
    handoff_updated: null,
    // result intake default fields
    result_summary: '',
    result_link: '',
    error_summary: '',
    retry_count: 0,
    created_by,
    notes: safeTrim(notes),
    created_at: now,
    updated_at: now,
  };
  items.push(run);
  await getStoreCore().replaceAll('work_runs', items);
  return run;
}

export async function listWorkRuns({ status = null, count = 20 } = {}) {
  const items = await getStoreCore().list('work_runs');
  let filtered = [...items];
  if (status) filtered = filtered.filter((i) => i.status === status);
  filtered.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return filtered.slice(0, count);
}

export async function getWorkRun(runIdOrAlias) {
  const runId = resolveRunIdFromAlias(runIdOrAlias);
  const items = await getStoreCore().list('work_runs');
  return items.find((i) => i.run_id === runId) || null;
}

function runRecencyKey(r) {
  return String(r.updated_at || r.created_at || '');
}

/** 최근 활동(결과 기록 등)이 반영된 run을 우선 — result_summary·ingest 후에도 “최신”이 맞게 */
export async function getLatestRunByWorkId(workId) {
  const items = await getStoreCore().list('work_runs');
  return items
    .filter((i) => i.work_id === workId)
    .sort((a, b) => runRecencyKey(b).localeCompare(runRecencyKey(a)))[0] || null;
}

/** 해당 work의 최신 cursor 도구 실행 (handoff 발행 추적용) */
export async function getLatestCursorRunForWork(workId) {
  const items = await getStoreCore().list('work_runs');
  return items
    .filter((i) => i.work_id === workId && i.tool_key === 'cursor')
    .sort((a, b) => runRecencyKey(b).localeCompare(runRecencyKey(a)))[0] || null;
}

export async function updateRunStatus(runIdOrAlias, nextStatus, options = {}) {
  if (!RUN_STATUS.includes(nextStatus)) return { ok: false, reason: 'invalid_status' };
  const runId = resolveRunIdFromAlias(runIdOrAlias);
  const items = await getStoreCore().list('work_runs');
  const index = items.findIndex((i) => i.run_id === runId);
  if (index < 0) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();
  const current = items[index];
  const next = {
    ...current,
    status: nextStatus,
    updated_at: now,
  };
  if (nextStatus === 'running' && !next.started_at) next.started_at = now;
  if (['done', 'failed', 'blocked', 'canceled'].includes(nextStatus)) {
    next.finished_at = now;
  }
  if (options.error_summary !== undefined) next.error_summary = safeTrim(options.error_summary);
  if (options.result_summary !== undefined) next.result_summary = safeTrim(options.result_summary);
  if (options.result_link !== undefined) next.result_link = safeTrim(options.result_link);
  if (options.result_status !== undefined) next.result_status = options.result_status;
  if (options.tests_passed !== undefined) next.tests_passed = options.tests_passed;
  if (options.handoff_updated !== undefined) next.handoff_updated = options.handoff_updated;
  if (options.reviewer !== undefined) next.reviewer = options.reviewer;
  if (options.reviewed_at !== undefined) next.reviewed_at = options.reviewed_at;
  if (options.qa_status !== undefined) next.qa_status = options.qa_status;
  if (options.github_status !== undefined) next.github_status = options.github_status;
  if (options.github_payload_kind !== undefined) next.github_payload_kind = options.github_payload_kind;
  if (options.review_summary !== undefined) next.review_summary = safeTrim(options.review_summary);
  if (options.merge_readiness !== undefined) next.merge_readiness = options.merge_readiness;
  if (options.db_scope !== undefined) next.db_scope = options.db_scope;
  if (options.migration_name !== undefined) next.migration_name = options.migration_name;
  if (options.function_name !== undefined) next.function_name = options.function_name;
  if (options.supabase_status !== undefined) next.supabase_status = options.supabase_status;
  if (options.supabase_payload_kind !== undefined) next.supabase_payload_kind = options.supabase_payload_kind;
  if (options.sql_preview !== undefined) next.sql_preview = options.sql_preview;
  if (options.verification_summary !== undefined) next.verification_summary = safeTrim(options.verification_summary);
  if (options.rollback_readiness !== undefined) next.rollback_readiness = options.rollback_readiness;
  if (options.affected_objects) next.affected_objects = [...new Set(options.affected_objects)];
  if (options.changed_files) next.changed_files = [...new Set(options.changed_files)];
  if (options.tests_run) next.tests_run = [...new Set(options.tests_run)];
  if (options.unresolved_risks) next.unresolved_risks = [...new Set(options.unresolved_risks)];
  if (options.blockers) next.blockers = [...new Set(options.blockers)];
  if (options.qa_checklist) next.qa_checklist = [...new Set(options.qa_checklist)];
  if (options.repo_key !== undefined) next.repo_key = options.repo_key;
  if (options.branch_name !== undefined) next.branch_name = options.branch_name;
  if (options.issue_key !== undefined) next.issue_key = options.issue_key;
  if (options.pr_key !== undefined) next.pr_key = options.pr_key;
  if (options.github_issue_artifact !== undefined) next.github_issue_artifact = options.github_issue_artifact;
  if (options.cursor_handoff_artifact !== undefined) next.cursor_handoff_artifact = options.cursor_handoff_artifact;
  if (options.note) next.notes = safeTrim([current.notes, options.note].filter(Boolean).join('\n'));

  items[index] = next;
  await getStoreCore().replaceAll('work_runs', items);
  return { ok: true, record: next };
}

export async function retryRun(previousRun, { dispatch_payload, created_by, notes = '' } = {}) {
  const items = await getStoreCore().list('work_runs');
  const run_id = await buildNextRunId(items);
  const now = new Date().toISOString();
  const run = {
    ...previousRun,
    run_id,
    status: 'dispatched',
    dispatch_payload: dispatch_payload ?? previousRun.dispatch_payload,
    dispatched_at: now,
    started_at: null,
    finished_at: null,
    result_status: 'none',
    changed_files: [],
    tests_run: [],
    tests_passed: null,
    unresolved_risks: [],
    blockers: [],
    qa_status: 'pending',
    reviewer: null,
    reviewed_at: null,
    handoff_updated: null,
    result_summary: '',
    result_link: '',
    error_summary: '',
    retry_count: Number(previousRun.retry_count || 0) + 1,
    created_by: created_by ?? previousRun.created_by ?? null,
    notes: safeTrim([previousRun.notes, notes].filter(Boolean).join('\n')),
    created_at: now,
    updated_at: now,
  };

  // Retry는 결과/QA 상태를 초기화한다.
  run.result_status = 'none';
  run.qa_status = 'pending';
  run.review_summary = '';
  run.merge_readiness = 'unknown';
  run.github_status = 'drafted';
  run.error_summary = '';
  run.result_summary = '';
  run.result_link = '';
  run.changed_files = [];
  run.tests_run = [];
  run.tests_passed = null;
  run.unresolved_risks = [];
  run.blockers = [];
  run.qa_checklist = [];
  run.handoff_updated = null;
  run.db_scope = null;
  run.migration_name = null;
  run.function_name = null;
  run.supabase_payload_kind = null;
  run.supabase_status = 'none';
  run.sql_preview = '';
  run.verification_summary = '';
  run.rollback_readiness = 'unknown';
  run.affected_objects = [];
  items.push(run);
  await getStoreCore().replaceAll('work_runs', items);
  return run;
}

export async function linkRunResult(runIdOrAlias, { result_summary = '', result_link = '' } = {}) {
  return updateRunStatus(runIdOrAlias, 'review', { result_summary, result_link });
}

function safeLower(text) {
  return String(text || '').toLowerCase();
}

function parseBulletLines(text) {
  return String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^[-*]\s+/.test(l))
    .map((l) => l.replace(/^[-*]\s+/, '').trim())
    .filter(Boolean);
}

function detectFiles(text) {
  const matches = String(text || '').match(/(?:^|\s)([A-Za-z0-9_./-]+\.[A-Za-z0-9]+)(?=\s|$)/g) || [];
  return [...new Set(matches.map((m) => m.trim()))].slice(0, 40);
}

function detectTests(text) {
  const lines = String(text || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return lines
    .filter((l) => /test|테스트|npm run|pnpm|yarn|pytest|jest|vitest/i.test(l))
    .slice(0, 20);
}

function detectSection(text, sectionName) {
  const lines = String(text || '').split('\n');
  const idx = lines.findIndex((l) => l.includes(sectionName));
  if (idx < 0) return '';
  const chunk = [];
  for (let i = idx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (/^\d+\./.test(line.trim()) && chunk.length > 0) break;
    if (/^(변경한 파일|핵심 변경|테스트 실행 결과|남은 리스크|후속 권장 작업|handoff)/.test(line.trim())) break;
    chunk.push(line);
  }
  return chunk.join('\n').trim();
}

export function generateQaChecklist(workType = 'feature') {
  const base = [
    '요청한 범위만 수정되었는가',
    '회귀 리스크가 통제되었는가',
    '테스트 결과가 명시되었는가',
    'handoff/doc 업데이트가 반영되었는가',
    '남은 blocker가 명확한가',
  ];
  if (workType === 'bug') base.push('재현 조건과 수정 후 기대 동작이 확인되었는가');
  if (workType === 'feature') base.push('기능 수용 기준(acceptance criteria)을 충족하는가');
  if (workType === 'refactor') base.push('동작 변화 없이 구조 개선되었는가');
  if (workType === 'ops') base.push('운영 절차/롤백 절차가 명확한가');
  if (workType === 'data') base.push('데이터 정합성과 마이그레이션 안정성이 점검되었는가');
  if (workType === 'content') base.push('문서 최신성과 사용자 관점 정확성이 확보되었는가');
  return [...new Set(base)];
}

export function parseResultIntakeText(text) {
  const t = String(text || '');
  const lower = safeLower(t);
  const filesFromSection = parseBulletLines(detectSection(t, '변경한 파일 목록'));
  const files = [...new Set([...filesFromSection, ...detectFiles(t)])].slice(0, 50);
  const testsRun = detectTests(detectSection(t, '테스트 실행 결과') || t);
  const testsPassed = /(all\s+pass|통과|passed|성공)/i.test(lower)
    ? true
    : /(fail|실패|error|에러)/i.test(lower)
    ? false
    : null;
  const unresolved = parseBulletLines(detectSection(t, '남은 리스크 / 미해결 사항')).slice(0, 20);
  const blockers = parseBulletLines(detectSection(t, 'blocker')).slice(0, 20);
  const handoffUpdated = /(handoff|doc).*(yes|true|완료|업데이트)/i.test(lower)
    ? true
    : /(handoff|doc).*(no|false|미반영|안함)/i.test(lower)
    ? false
    : null;
  const summary = (detectSection(t, '핵심 변경 사항') || t).slice(0, 500);

  return {
    changed_files: files,
    tests_run: testsRun,
    tests_passed: testsPassed,
    unresolved_risks: unresolved,
    blockers,
    handoff_updated: handoffUpdated,
    result_summary: summary,
  };
}

export async function submitRunResult(runIdOrAlias, text, { reviewer = null } = {}) {
  const run = await getWorkRun(runIdOrAlias);
  if (!run) return { ok: false, reason: 'not_found' };
  const parsed = parseResultIntakeText(text);
  const qaChecklist = run.qa_checklist?.length ? run.qa_checklist : generateQaChecklist();
  return updateRunStatus(run.run_id, 'review', {
    ...parsed,
    result_status: 'submitted',
    qa_status: 'pending',
    qa_checklist: qaChecklist,
    reviewer,
    note: `결과등록: ${new Date().toISOString()}`,
  });
}

export function reviewRunResult(run) {
  if (!run) return '실행 ID를 찾지 못했습니다.';
  return [
    `결과 검토 (${run.run_id})`,
    `- work_id: ${run.work_id}`,
    `- 상태: ${run.status} / result_status: ${run.result_status} / qa_status: ${run.qa_status}`,
    `- 변경 파일 수: ${(run.changed_files || []).length}`,
    `- 테스트 통과: ${run.tests_passed === null ? '미기재' : run.tests_passed ? '예' : '아니오'}`,
    `- unresolved_risks: ${(run.unresolved_risks || []).join(' | ') || '없음'}`,
    `- blockers: ${(run.blockers || []).join(' | ') || '없음'}`,
    `- handoff_updated: ${run.handoff_updated === null ? '미기재' : run.handoff_updated ? '예' : '아니오'}`,
    '',
    'QA 체크리스트',
    ...(run.qa_checklist || []).map((q) => `- ${q}`),
  ].join('\n');
}

export async function approveRunResult(runIdOrAlias, { reviewer = null } = {}) {
  return updateRunStatus(runIdOrAlias, 'done', {
    result_status: 'approved',
    qa_status: 'passed',
    reviewer,
    reviewed_at: new Date().toISOString(),
    note: '결과승인 처리',
  });
}

export async function rejectRunResult(runIdOrAlias, reason, { reviewer = null } = {}) {
  return updateRunStatus(runIdOrAlias, 'running', {
    result_status: 'rejected',
    qa_status: 'failed',
    reviewer,
    reviewed_at: new Date().toISOString(),
    error_summary: reason,
    note: `결과반려: ${reason}`,
  });
}

export async function markRunBlocked(runIdOrAlias, reason) {
  const run = await getWorkRun(runIdOrAlias);
  if (!run) return { ok: false, reason: 'not_found' };
  const blockers = [...new Set([...(run.blockers || []), reason])];
  return updateRunStatus(run.run_id, 'blocked', {
    blockers,
    error_summary: reason,
    result_status: 'review',
    qa_status: 'failed',
    note: `막힘등록: ${reason}`,
  });
}

export function summarizeRuns(records, title = '실행 요약') {
  if (!records.length) return `${title}\n- 대상 실행이 없습니다.`;
  const byStatus = new Map();
  for (const r of records) byStatus.set(r.status, (byStatus.get(r.status) || 0) + 1);
  const dist = [...byStatus.entries()].map(([k, v]) => `${k}:${v}`).join(', ');
  return `${title}\n- 총 ${records.length}건\n- 상태 분포: ${dist}`;
}

export function formatRunList(records, title) {
  if (!records.length) return `${title}\n- 대상 실행이 없습니다.`;
  recentRunAliasIds = records.map((r) => r.run_id);
  return [
    title,
    ...records.map(
      (r, i) =>
        `[${i + 1}] ${r.run_id}\n- work_id: ${r.work_id}\n- project/tool: ${r.project_key} / ${r.tool_key}\n- 상태: ${r.status}\n- dispatched_at: ${r.dispatched_at || '없음'}`
    ),
  ].join('\n\n');
}

export function formatRunDetail(run) {
  if (!run) return '실행 ID를 찾지 못했습니다.';
  const ghBlock = formatGithubArtifactSummaryLines(run.github_issue_artifact, {
    header: '── GitHub issue (이 실행 연결) ──',
  });
  const cursorBlock = formatCursorHandoffSummaryLines(run.cursor_handoff_artifact, {
    header: '── Cursor handoff (이 실행 연결) ──',
  });
  return [
    `실행 상세 (${run.run_id})`,
    ...(ghBlock.length ? [...ghBlock, ''] : []),
    ...(cursorBlock.length ? [...cursorBlock, ''] : []),
    `- work_id: ${run.work_id}`,
    `- project_key: ${run.project_key}`,
    `- tool_key: ${run.tool_key}`,
    `- adapter_type: ${run.adapter_type}`,
    `- status: ${run.status}`,
    `- github_status: ${run.github_status || 'none'}`,
    `- github_payload_kind: ${run.github_payload_kind || 'null'}`,
    `- merge_readiness: ${run.merge_readiness || 'unknown'}`,
    `- repo/branch: ${run.repo_key || '없음'} / ${run.branch_name || '없음'}`,
    `- db_scope: ${run.db_scope || '없음'}`,
    `- migration_name: ${run.migration_name || '없음'}`,
    `- function_name: ${run.function_name || '없음'}`,
    `- supabase_status: ${run.supabase_status || 'none'}`,
    `- supabase_payload_kind: ${run.supabase_payload_kind || 'null'}`,
    `- rollback_readiness: ${run.rollback_readiness || 'unknown'}`,
    `- verification_summary: ${run.verification_summary || '없음'}`,
    `- affected_objects: ${(run.affected_objects || []).join(', ') || '없음'}`,
    `- dispatch_target: ${run.dispatch_target || '없음'}`,
    `- dispatched_at: ${run.dispatched_at || '없음'}`,
    `- started_at: ${run.started_at || '없음'}`,
    `- finished_at: ${run.finished_at || '없음'}`,
    `- result_summary: ${run.result_summary || '없음'}`,
    `- result_link: ${run.result_link || '없음'}`,
    `- github_issue: ${run.github_issue_artifact ? `#${run.github_issue_artifact.issue_number} ${run.github_issue_artifact.issue_url || ''} (state: ${run.github_issue_artifact.state || '?'})` : '없음'}`,
    `- error_summary: ${run.error_summary || '없음'}`,
    `- retry_count: ${run.retry_count || 0}`,
    `- result_status: ${run.result_status || 'none'}`,
    `- qa_status: ${run.qa_status || 'pending'}`,
    `- reviewer: ${run.reviewer || '없음'}`,
    `- reviewed_at: ${run.reviewed_at || '없음'}`,
    `- changed_files: ${(run.changed_files || []).join(', ') || '없음'}`,
    `- tests_run: ${(run.tests_run || []).join(' | ') || '없음'}`,
    `- tests_passed: ${run.tests_passed === null ? '미기재' : run.tests_passed ? '예' : '아니오'}`,
    `- unresolved_risks: ${(run.unresolved_risks || []).join(' | ') || '없음'}`,
    `- blockers: ${(run.blockers || []).join(' | ') || '없음'}`,
    `- handoff_updated: ${run.handoff_updated === null ? '미기재' : run.handoff_updated ? '예' : '아니오'}`,
    `- created_by: ${run.created_by || '없음'}`,
    `- notes: ${run.notes || '없음'}`,
    '',
    '[dispatch payload preview]',
    typeof run.dispatch_payload === 'string'
      ? run.dispatch_payload.slice(0, 800)
      : JSON.stringify(run.dispatch_payload, null, 2).slice(0, 800),
  ].join('\n');
}
