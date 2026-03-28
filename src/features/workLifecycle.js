/**
 * Operations loop v1 — display / aggregation helpers (work-centric).
 * Canonical Slack-facing lifecycle labels (stored status may differ slightly).
 */

const DONE = new Set(['done']);
const CANCELED = new Set(['canceled']);
const BLOCKED = new Set(['blocked']);
const NEEDS_REV = new Set(['needs_revision']);
const REVIEW = new Set(['review', 'review_requested']);
const DISPATCHED = new Set(['dispatched']);
const IN_PROG = new Set(['in_progress']);
const ASSIGNED = new Set(['assigned', 'approved']);
const DRAFTY = new Set(['draft', 'pending_approval']);

/** @param {string|null|undefined} status */
export function normalizeWorkLifecycleStatus(status) {
  const s = String(status || '').trim();
  if (s === 'review') return 'review_requested';
  if (s === 'proposed') return 'proposed';
  return s || 'unknown';
}

/**
 * 운영자 관점 표시 상태 (plan이 review_pending이면 child draft를 approval_pending으로 표시)
 */
export function deriveDisplayLifecycle(work, plan = null) {
  if (!work) return 'unknown';
  const s = normalizeWorkLifecycleStatus(work.status);
  if (plan?.status === 'review_pending' && (work.status === 'draft' || work.status === 'pending_approval' || work.status === 'proposed')) {
    return 'approval_pending';
  }
  return s;
}

export function formatGithubOneliner(issueArtifact) {
  if (!issueArtifact?.issue_number && !issueArtifact?.issue_url) {
    return 'GitHub: not linked';
  }
  const n = issueArtifact.issue_number != null ? `#${issueArtifact.issue_number}` : '?';
  const st = issueArtifact.state || 'unknown';
  return `GitHub: linked / issue ${n} / ${st}`;
}

export function formatCursorOneliner(handoffArtifact, latestCursorRun) {
  const path = handoffArtifact?.handoff_path || handoffArtifact?.dispatch_target || '';
  const runSt = latestCursorRun?.status || '';
  if (!path && !runSt) return 'Cursor: (no handoff run)';
  if (path && /result|기록|ingest/i.test(String(latestCursorRun?.notes || ''))) {
    return 'Cursor: result recorded';
  }
  if (path && (runSt === 'running' || runSt === 'dispatched')) return 'Cursor: dispatched';
  if (path) return 'Cursor: handoff ready';
  return `Cursor: run ${runSt || '—'}`;
}

export function formatReviewOneliner(displayLifecycle) {
  if (displayLifecycle === 'needs_revision') return 'Review: needs_revision';
  if (displayLifecycle === 'review_requested' || displayLifecycle === 'review') return 'Review: pending';
  if (displayLifecycle === 'done') return 'Review: done';
  return 'Review: —';
}

/**
 * @param {object|null} item work_item
 * @param {object|null} plan optional plan record
 * @param {object|null} latestRun any latest work_run
 * @param {object|null} latestCursorRun cursor run if any
 */
export function formatWorkReviewSummaryFromParts(item, plan, latestRun, latestCursorRun) {
  if (!item) return '[업무검토] 업무를 찾지 못했습니다.';
  const disp = deriveDisplayLifecycle(item, plan);
  const gh = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
  const ghIssue =
    gh.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue') ||
    (item.github_artifact?.artifact_type === 'issue' ? item.github_artifact : null);
  const cursorArts = Array.isArray(item.cursor_artifacts) ? item.cursor_artifacts : [];
  const handoff =
    cursorArts.find((a) => a?.artifact_type === 'handoff') || item.cursor_handoff_artifact || null;

  const reviewPending = disp === 'review_requested' || disp === 'review';
  const resultRun = latestCursorRun && latestCursorRun.tool_key === 'cursor' ? latestCursorRun : latestRun;
  const resultBody =
    (latestCursorRun?.result_summary || handoff?.result_notes || latestRun?.result_summary || '—') || '—';
  const revFromNotes = (item.notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^업무수정요청:/i.test(l))
    .slice(-3);

  const lines = [
    `[업무검토] ${item.id} (읽기 전용 요약)`,
    `- work_id: ${item.id}`,
    `- parent_plan_id: ${item.source_plan_id || '—'} | plan_status: ${plan?.status || '—'}`,
    `- lifecycle(display): ${disp} | work.status(raw): ${item.status}`,
    `- approval_required: ${item.approval_required} | approval_status: ${item.approval_status}`,
    `- 검토 대기(review_requested): ${reviewPending ? 'yes' : 'no'}`,
    '',
    '── 현재 결과 (latest) ──',
    `- 기준 run: ${resultRun?.run_id || '—'} (${resultRun?.tool_key || '—'}) | run_status: ${resultRun?.status || '—'}`,
    `- result_summary: ${typeof resultBody === 'string' ? resultBody.slice(0, 400) : resultBody}`,
    `- qa_status: ${resultRun?.qa_status || '—'} | result_status: ${resultRun?.result_status || '—'}`,
    '',
    '── GitHub ──',
    formatGithubOneliner(ghIssue),
    ghIssue?.issue_url ? `  url: ${ghIssue.issue_url}` : null,
    ghIssue?.state ? `  state: ${ghIssue.state}` : null,
    '',
    '── Cursor ──',
    formatCursorOneliner(handoff, latestCursorRun),
    handoff?.handoff_path || handoff?.dispatch_target
      ? `  handoff_path: ${handoff.handoff_path || handoff.dispatch_target}`
      : null,
    '',
    '── Review ──',
    formatReviewOneliner(disp),
    revFromNotes.length ? ['  최근 수정요청:', ...revFromNotes.map((l) => `    ${l}`)].join('\n') : '  (수정요청 notes 없음)',
    '',
    '── notes tail (참고) ──',
    item.notes ? item.notes.split('\n').slice(-4).map((l) => `  ${l}`).join('\n') : '  (없음)',
  ];
  return lines.filter(Boolean).join('\n');
}

/**
 * 조회형 `업무검토` — 구조화만 + next_allowed_actions + Next (Council 금지)
 */
export function formatWorkReviewQuery(item, plan, latestRun, latestCursorRun) {
  if (!item) {
    return '[업무검토] work를 찾지 못했습니다.\n- 형식: 업무검토 <WRK-...|번호>';
  }
  const disp = deriveDisplayLifecycle(item, plan);
  const gh = Array.isArray(item.github_artifacts) ? item.github_artifacts : [];
  const ghIssue =
    gh.find((a) => a?.provider === 'github' && a?.artifact_type === 'issue') ||
    (item.github_artifact?.artifact_type === 'issue' ? item.github_artifact : null);
  const cursorArts = Array.isArray(item.cursor_artifacts) ? item.cursor_artifacts : [];
  const handoff =
    cursorArts.find((a) => a?.artifact_type === 'handoff') || item.cursor_handoff_artifact || null;

  const reviewPending = disp === 'review_requested' || disp === 'review';
  const resultRun = latestCursorRun && latestCursorRun.tool_key === 'cursor' ? latestCursorRun : latestRun;
  const resultBody =
    (latestCursorRun?.result_summary || handoff?.result_notes || latestRun?.result_summary || '—') || '—';
  const revFromNotes = (item.notes || '')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => /^업무수정요청:/i.test(l))
    .slice(-3);

  const next = [];
  if (disp === 'needs_revision') next.push('커서발행 | 커서결과기록');
  if (reviewPending || disp === 'needs_revision') next.push('업무완료 | 업무수정요청');
  if (['assigned', 'dispatched', 'in_progress'].includes(disp)) next.push('커서발행 | 이슈발행(도구별) | 업무상세');
  if (disp === 'done') next.push('(종료)');
  if (!next.length) next.push('업무상세');

  const lines = [
    `[업무검토] ${item.id}`,
    `- parent_plan_id: ${item.source_plan_id || '—'} | plan_status: ${plan?.status || '—'}`,
    `- lifecycle (display): ${disp} | work.status(raw): ${item.status}`,
    '',
    '── github summary ──',
    formatGithubOneliner(ghIssue),
    ghIssue?.issue_url ? `- issue_url: ${ghIssue.issue_url}` : null,
    ghIssue?.state ? `- issue_state: ${ghIssue.state}` : null,
    '',
    '── cursor summary ──',
    formatCursorOneliner(handoff, latestCursorRun),
    handoff?.handoff_path || handoff?.dispatch_target
      ? `- handoff_path: ${handoff.handoff_path || handoff.dispatch_target}`
      : null,
    '',
    '── review summary ──',
    formatReviewOneliner(disp),
    `- review_pending: ${reviewPending ? 'yes' : 'no'}`,
    '',
    '── latest result summary ──',
    `- basis_run: ${resultRun?.run_id || '—'} | tool: ${resultRun?.tool_key || '—'} | run_status: ${resultRun?.status || '—'}`,
    `- result_summary: ${typeof resultBody === 'string' ? resultBody.slice(0, 400) : resultBody}`,
    `- qa_status: ${resultRun?.qa_status || '—'} | result_status: ${resultRun?.result_status || '—'}`,
    '',
    '── revision note (if any) ──',
    revFromNotes.length ? revFromNotes.map((l) => `  ${l}`).join('\n') : '  (none)',
    '',
    '── next_allowed_actions ──',
    `- ${next.join(' | ')}`,
    '',
    'Next:',
    `- 업무상세 ${item.id}`,
    `- 커서결과기록 ${item.id} <요약>`,
    `- 업무완료 ${item.id}`,
  ];
  return lines.filter(Boolean).join('\n');
}

/** Spec-style coarse buckets for plan aggregate */
export function aggregateWorkBuckets(workStatuses) {
  const out = {
    total: workStatuses.length,
    approval_pending: 0,
    approved: 0,
    assigned: 0,
    dispatched: 0,
    in_progress: 0,
    review_requested: 0,
    needs_revision: 0,
    done: 0,
    blocked: 0,
    rejected: 0,
    canceled: 0,
    other: 0,
  };
  for (const raw of workStatuses) {
    const s = normalizeWorkLifecycleStatus(raw);
    if (s === 'draft' || s === 'pending_approval' || s === 'proposed') out.approval_pending += 1;
    else if (s === 'approved') out.approved += 1;
    else if (s === 'assigned') out.assigned += 1;
    else if (s === 'dispatched') out.dispatched += 1;
    else if (s === 'in_progress') out.in_progress += 1;
    else if (s === 'review_requested' || s === 'review') out.review_requested += 1;
    else if (s === 'needs_revision') out.needs_revision += 1;
    else if (s === 'done') out.done += 1;
    else if (s === 'blocked') out.blocked += 1;
    else if (s === 'rejected') out.rejected += 1;
    else if (s === 'canceled') out.canceled += 1;
    else out.other += 1;
  }
  return out;
}

export const WORK_LIFECYCLE_STATES_DOC = [
  'proposed | draft',
  'pending_approval (표시: approval_pending when plan review_pending)',
  'approved',
  'assigned',
  'dispatched',
  'in_progress',
  'review_requested',
  'needs_revision',
  'done',
  'blocked',
  'rejected (work-level)',
  'canceled',
];

/**
 * child work 집계로 plan 진행 상황을 한 줄로 (저장 plan.status와 병기용)
 */
export function derivePlanRollupLabel(planStatus, buckets) {
  if (planStatus === 'rejected') return 'plan_rejected';
  if (planStatus === 'done') return 'plan_marked_done';
  if (planStatus === 'blocked') return 'plan_blocked';
  if (!buckets?.total) return 'no_works';
  if (buckets.done === buckets.total) return 'all_work_done';
  if ((buckets.blocked || 0) > 0) return 'has_blocked_work';
  if ((buckets.needs_revision || 0) > 0) return 'has_revision_loop';
  if ((buckets.review_requested || 0) > 0) return 'in_review';
  if ((buckets.dispatched || 0) + (buckets.in_progress || 0) > 0) return 'executing';
  if ((buckets.approval_pending || 0) > 0) return 'awaiting_approval_or_draft';
  return 'open';
}
