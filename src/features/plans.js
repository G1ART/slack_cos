import { getStoreCore } from '../storage/core/index.js';
import { PROJECT_KEYS, TOOL_KEYS, createWorkItem, updateWorkStatus, getWorkItem } from './workItems.js';
import {
  aggregateWorkBuckets,
  derivePlanRollupLabel,
  normalizeWorkLifecycleStatus,
  formatGithubOneliner,
  formatCursorOneliner,
} from './workLifecycle.js';
import { getLatestCursorRunForWork } from './workRuns.js';
import { resolvePlannerAprIfPending, getLatestPlannerApprovalForPlan } from './approvals.js';

/** Phase 3b: 실행 브리지·마감용 상태 확장 (기존 JSON plan도 하위 호환) */
export const PLAN_STATUS = [
  'draft',
  'review_pending',
  'approved',
  'rejected',
  'ready_for_dispatch',
  'in_progress',
  'done',
  'blocked',
];

/** dispatch/destructive 계열 허용 — 승인 후 실행 단계 */
export const PLAN_GATE_ALLOWED_STATUSES = ['approved', 'ready_for_dispatch', 'in_progress'];

export const PLAN_GATE_CODES = ['plan_missing', 'plan_not_approved', 'plan_rejected', 'plan_lookup_failed'];

let recentPlanAliasIds = [];

function safeTrim(v) {
  return typeof v === 'string' ? v.trim() : '';
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

function parseSeqFromPlanId(planId) {
  const match = safeTrim(planId).match(/^PLN-\d{6}-(\d{2,})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

async function buildNextPlanId(items, now = new Date()) {
  const yymmdd = getYYMMDD(now);
  let maxSeq = 0;
  for (const item of items) {
    const id = safeTrim(item?.plan_id);
    if (!id.startsWith(`PLN-${yymmdd}-`)) continue;
    const seq = parseSeqFromPlanId(id);
    if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
  }
  return `PLN-${yymmdd}-${pad2(maxSeq + 1)}`;
}

function parseBracketOrNumeric(token) {
  const t = safeTrim(token);
  const b = t.match(/^\[(\d+)\]$/);
  if (b) return b[1];
  return t;
}

function resolvePlanIdFromAlias(token) {
  const parsed = parseBracketOrNumeric(token);
  if (/^\d+$/.test(parsed) && recentPlanAliasIds.length) {
    const idx = Number(parsed) - 1;
    if (idx >= 0 && idx < recentPlanAliasIds.length) return recentPlanAliasIds[idx];
  }
  return parsed;
}

/** 줄 단위 도구 힌트 (fabricate 금지 — 키워드만) */
function inferToolFromText(text) {
  const t = String(text || '').toLowerCase();
  if (/(supabase|sql|마이그레이션|rls|policy)/.test(t)) return 'supabase';
  if (/(github|issue|pr|깃허브|리포)/.test(t)) return 'github';
  if (/(문서|docs|핸드오프|md)/.test(t)) return 'docs';
  if (/(cursor|코드|구현|리팩터|버그\s*수정)/.test(t)) return 'cursor';
  return 'manual';
}

function inferProjectKey(text, channelProjectFallback) {
  if (channelProjectFallback && PROJECT_KEYS.includes(channelProjectFallback)) return channelProjectFallback;
  const t = String(text || '').toLowerCase();
  if (/\bslack_cos\b|slack cos|슬랙\s*cos|bolt/.test(t)) return 'slack_cos';
  if (/\bshared_tools\b|공유\s*도구/.test(t)) return 'shared_tools';
  if (/\bg1_ops\b|g1 ops|운영/.test(t)) return 'g1_ops';
  if (/\babstract\b/.test(t)) return 'abstract';
  return channelProjectFallback && PROJECT_KEYS.includes(channelProjectFallback) ? channelProjectFallback : 'shared_tools';
}

/**
 * 보수적 승인 필요 판단 — 근거 문자열 동반 (값 지어내기 금지)
 */
export function inferPlanApprovalRequired(text) {
  const raw = String(text || '');
  const t = raw.toLowerCase();
  const reasons = [];

  if (/(운영|프로덕션|production|\bprod\b|live\s*traffic)/i.test(raw)) reasons.push('production/운영 언급');
  if (/(삭제\s*전체|drop\s+table|truncate|destructive|파괴적)/i.test(raw)) reasons.push('destructive/대량 삭제 유사 표현');
  if (/(배포|deploy|롤아웃|rollout)/i.test(raw)) reasons.push('deployment 언급');
  if (/(secret|\.env|token|pat|api[_\s-]*key|credential)/i.test(raw)) reasons.push('secret/env/자격증명 언급');
  if (/(bulk|대량|전체\s*마이그레이션|one[-\s]?shot)/i.test(raw)) reasons.push('bulk/migration 위험 언급');
  if (/(대외|외부\s*고객|공개\s*api|billing|결제)/i.test(raw)) reasons.push('외부 영향/대외 영향 언급');

  const existing = /(승인\s*필요|approval|법무|보안\s*검토)/i.test(raw);
  if (existing) reasons.push('승인/검토 키워드');

  const approval_required = reasons.length > 0;
  const approval_reason = approval_required ? reasons.join('; ') : null;
  return { approval_required, approval_reason };
}

function inferRiskTags(text) {
  const raw = String(text || '');
  const tags = [];
  if (/prod|운영|production/i.test(raw)) tags.push('production_touch');
  if (/secret|credential|token|\.env/i.test(raw)) tags.push('secrets');
  if (/delete|drop|truncate|삭제/i.test(raw)) tags.push('data_destructive');
  if (/deploy|배포/i.test(raw)) tags.push('deploy');
  if (/migrat|마이그레이션|schema/i.test(raw)) tags.push('schema_change');
  return tags.length ? tags : null;
}

function extractGoal(requestText) {
  const t = safeTrim(requestText);
  if (!t) return null;
  const parts = t.split(/(?<=[.!?。！？])\s+|\n+/);
  const first = parts[0] || t;
  return first.length > 240 ? `${first.slice(0, 237)}…` : first;
}

/**
 * 목록 줄만 추출 — 없으면 단일 subtask(전체 요청을 쪼개지 않음)
 */
export function extractProposedSubtasks(requestText) {
  const lines = String(requestText || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const subtasks = [];
  for (const line of lines) {
    const m = line.match(/^(?:[-*•]|\d+[\.)])\s+(.+)$/);
    if (m) {
      const title = safeTrim(m[1]).slice(0, 160);
      if (title) {
        subtasks.push({
          title,
          brief: null,
          suggested_tool: inferToolFromText(title),
        });
      }
    }
  }

  if (subtasks.length === 0) {
    const g = extractGoal(requestText) || safeTrim(requestText).slice(0, 120) || 'Planned task';
    return [
      {
        title: g.slice(0, 160),
        brief: safeTrim(requestText).slice(0, 1200) || null,
        suggested_tool: inferToolFromText(requestText),
      },
    ];
  }

  return subtasks;
}

/**
 * Practical normalization — 불확실 필드는 null, 추측 값 금지
 */
export function normalizePlanRequest(requestText, ctx = {}) {
  const text = safeTrim(requestText);
  const { projectContext = null, envKey = 'dev', channelId = null } = ctx;

  const { approval_required, approval_reason } = inferPlanApprovalRequired(text);
  const project_key = inferProjectKey(text, projectContext);
  const goal = extractGoal(text);
  const proposed_subtasks = extractProposedSubtasks(text);
  const risk_tags = inferRiskTags(text);
  const recommended_tooling = inferToolFromText(text);

  const lifecycle_phase = approval_required ? 'approval_needed' : 'approved';
  const next_action_recommendation = approval_required
    ? '계획상세로 범위를 확인한 뒤 `계획승인 <plan_id>` 를 실행하세요. (자동 dispatch 없음)'
    : '업무가 초안에서 배정 상태로 올라갔습니다. `업무상세` 확인 후 `커서발행`/`이슈발행` 등은 수동으로 실행하세요.';

  return {
    request_text: text,
    goal: goal || null,
    scope_in: null,
    scope_out: null,
    requested_outputs: null,
    assumptions: null,
    constraints: null,
    project_key,
    environment: envKey || null,
    channel_id: channelId || null,
    risk_tags,
    approval_required,
    approval_reason,
    proposed_subtasks,
    recommended_tooling,
    next_action_recommendation,
    lifecycle_phase,
    dispatch_state: 'not_dispatched',
  };
}

export async function listRecentPlansForAlias(count = 25) {
  const items = await getStoreCore().list('plans', {
    _orderBy: 'updated_at',
    _orderDir: 'desc',
    _limit: count,
  });
  recentPlanAliasIds = items.map((p) => p.plan_id);
  return items;
}

export async function getPlan(planIdOrAlias) {
  await listRecentPlansForAlias(40);
  const id = resolvePlanIdFromAlias(planIdOrAlias);
  return getStoreCore().get('plans', id);
}

async function saveAllPlans(items) {
  await getStoreCore().replaceAll('plans', items);
}

async function loadPlanIndex(planId) {
  const all = await getStoreCore().list('plans');
  const idx = all.findIndex((p) => p.plan_id === planId);
  return { all, idx, record: idx >= 0 ? all[idx] : null };
}

/** work_id → 해당 work의 run 개수 */
export async function getRunCountsByWorkIds(workIds) {
  const ids = new Set((workIds || []).filter(Boolean));
  if (!ids.size) return {};
  let runs = [];
  try {
    runs = await getStoreCore().list('work_runs');
  } catch {
    return Object.fromEntries([...ids].map((id) => [id, 0]));
  }
  const map = Object.fromEntries([...ids].map((id) => [id, 0]));
  for (const r of runs) {
    if (r?.work_id && map[r.work_id] !== undefined) map[r.work_id] += 1;
  }
  return map;
}

function workDispatchBucket(w) {
  if (!w) return 'missing';
  if (['done', 'canceled'].includes(w.status)) return 'done';
  if (w.status === 'blocked') return 'blocked';
  if (['review', 'review_requested', 'needs_revision'].includes(w.status)) return 'review';
  if (['assigned', 'in_progress', 'dispatched'].includes(w.status)) return 'ready';
  if (['draft', 'pending_approval'].includes(w.status)) return 'waiting';
  return 'other';
}

export function recommendDispatchCommandForWork(work) {
  if (!work) return null;
  const t = work.assigned_tool || work.tool_key || 'manual';
  if (t === 'cursor') return `커서발행 ${work.id}`;
  if (t === 'github') return `이슈발행 ${work.id}`;
  if (t === 'supabase') return `수파베이스발행 ${work.id}`;
  if (t === 'docs') return `업무발행 ${work.id}`;
  return `업무발행 ${work.id}`;
}

function cursorPhaseForDispatchRow(w, latestCursorRun) {
  const hasHandoff =
    (Array.isArray(w.cursor_artifacts) && w.cursor_artifacts.some((a) => a?.artifact_type === 'handoff')) ||
    w.cursor_handoff_artifact;
  const hasResult =
    Boolean(latestCursorRun?.result_summary?.trim()) ||
    Boolean(
      (Array.isArray(w.cursor_artifacts) && w.cursor_artifacts.some((a) => a?.result_notes)) ||
        w.cursor_handoff_artifact?.result_notes
    );
  if (hasResult) return 'result';
  if (hasHandoff) return 'handoff';
  return 'none';
}

/**
 * 계획발행 / 계획발행목록 공통 본문
 * @param {{ title?: string, queryDispatchList?: boolean }} [opts] queryDispatchList=true → 조회형 계약(계획발행목록)
 */
export async function buildPlanDispatchSlackBody(plan, { title, queryDispatchList = false } = {}) {
  if (!plan) return '[plan] 없음';
  const ids = plan.linked_work_items || [];
  const runCounts = await getRunCountsByWorkIds(ids);
  let ready = 0;
  let blocked = 0;
  let waiting = 0;
  let done = 0;
  const lines = [];

  for (const id of ids) {
    const w = await getWorkItem(id);
    const b = workDispatchBucket(w);
    if (b === 'ready') ready += 1;
    else if (b === 'blocked') blocked += 1;
    else if (b === 'waiting') waiting += 1;
    else if (b === 'done') done += 1;

    const rc = runCounts[id] ?? 0;
    if (!w) {
      lines.push(`- ${id} | (missing) | runs:${rc}`);
      continue;
    }
    const gh = Array.isArray(w.github_artifacts)
      ? w.github_artifacts.find((a) => a?.artifact_type === 'issue')
      : w.github_artifact;
    const ghOk = gh?.issue_number != null || gh?.issue_url ? 'gh:yes' : 'gh:no';
    const crOk = Array.isArray(w.cursor_artifacts) && w.cursor_artifacts.some((a) => a?.artifact_type === 'handoff')
      ? 'cursor:yes'
      : w.cursor_handoff_artifact
        ? 'cursor:yes'
        : 'cursor:no';
    const rev =
      w.status === 'review_requested' || w.status === 'review'
        ? 'review:pending'
        : w.status === 'needs_revision'
          ? 'review:revise'
          : w.status === 'done'
            ? 'done:yes'
            : 'done:no';
    const cmd = recommendDispatchCommandForWork(w);
    if (queryDispatchList) {
      const lcr = await getLatestCursorRunForWork(w.id);
      const ghLink = gh?.issue_number != null || gh?.issue_url ? 'linked' : 'not_linked';
      const ghState = gh?.state ? String(gh.state) : ghLink === 'linked' ? 'unknown' : '—';
      const cPhase = cursorPhaseForDispatchRow(w, lcr);
      lines.push(
        `- ${w.id} | lifecycle:${normalizeWorkLifecycleStatus(w.status)} | github:${ghLink} state:${ghState} | cursor:${cPhase} | review:${rev} | runs:${rc} | dispatch_hint:\`${cmd}\``
      );
    } else {
      lines.push(
        `- ${w.id} | ${normalizeWorkLifecycleStatus(w.status)} | ${w.assigned_tool} | ${ghOk} ${crOk} | ${rev} | runs:${rc} | → \`${cmd}\``
      );
    }
  }

  const totalRuns = Object.values(runCounts).reduce((a, n) => a + n, 0);
  const head = queryDispatchList
    ? [
        title || `[계획발행목록] ${plan.plan_id}`,
        `- plan_status: ${plan.status}`,
        `- approval_required: ${plan.approval_required ? 'yes' : 'no'}`,
        `- work_count: ${ids.length} | bucket_ready:${ready} blocked:${blocked} waiting:${waiting} done:${done}`,
        `- linked_runs_total: ${totalRuns}`,
        '',
        '── work rows ──',
        ...lines,
        '',
        'Next:',
        `- 계획상세 ${plan.plan_id}`,
        `- 계획진행 ${plan.plan_id}`,
        `- 계획완료 ${plan.plan_id}`,
      ]
    : [
        title || `[계획발행목록] ${plan.plan_id}`,
        `- plan status: ${plan.status}`,
        `- approval_required: ${plan.approval_required ? 'yes' : 'no'}`,
        `- linked work: ${ids.length}건 | ready:${ready} blocked:${blocked} waiting:${waiting} done:${done}`,
        `- linked runs(합계): ${totalRuns}`,
        '',
        '── 발행 후보 / 수동 발행 명령 ──',
        ...lines,
        '',
        '다음:',
        `- 계획상세 ${plan.plan_id}`,
        `- 계획진행 ${plan.plan_id}  (선택, plan을 in_progress로)`,
        `- 계획완료 ${plan.plan_id}  (선택, 전체 마감 표시)`,
      ];
  return head.join('\n');
}

/**
 * 계획발행: approved → ready_for_dispatch 전이 + 본문
 */
export async function bridgePlanToDispatch(planIdOrAlias) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };

  if (['rejected', 'draft', 'review_pending'].includes(plan.status)) {
    return {
      ok: false,
      reason: 'not_approved',
      plan,
      message:
        plan.status === 'review_pending'
          ? '[계획발행] 먼저 `계획승인`이 필요합니다 (review_pending).'
          : `[계획발행] 현재 상태(${plan.status})에서는 브리지할 수 없습니다.`,
    };
  }
  if (['done', 'blocked'].includes(plan.status)) {
    return {
      ok: false,
      reason: 'closed',
      plan,
      message: `[계획발행] plan이 ${plan.status} 상태입니다.`,
    };
  }

  const { all, idx, record } = await loadPlanIndex(plan.plan_id);
  if (idx < 0 || !record) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();
  let next = record;
  if (record.status === 'approved') {
    const np = {
      ...record.normalized_plan,
      dispatch_state: 'ready_for_dispatch',
      lifecycle_phase: record.normalized_plan?.lifecycle_phase || 'approved',
    };
    next = {
      ...record,
      status: 'ready_for_dispatch',
      normalized_plan: np,
      updated_at: now,
      bridged_at: now,
    };
    all[idx] = next;
    await saveAllPlans(all);
  }

  const body = await buildPlanDispatchSlackBody(next, { title: `[계획발행] ${next.plan_id}` });
  return { ok: true, plan: next, message: body };
}

export async function formatPlansOverviewSlack({ count = 14 } = {}) {
  const plans = await getStoreCore().list('plans', {
    _orderBy: 'updated_at',
    _orderDir: 'desc',
    _limit: count,
  });
  recentPlanAliasIds = plans.map((p) => p.plan_id);
  if (!plans.length) return '[계획요약] 저장된 plan이 없습니다.';

  const lines = ['[계획요약]', ''];
  for (const p of plans) {
    const n = (p.linked_work_items || []).length;
    const runs = await getRunCountsByWorkIds(p.linked_work_items || []);
    const runSum = Object.values(runs).reduce((a, x) => a + x, 0);
    lines.push(
      `- ${p.plan_id} | ${p.status} | appr:${p.approval_required ? 'yes' : 'no'} | work:${n} | runs:${runSum}`
    );
  }
  lines.push(
    '',
    '다음:',
    '- 계획상세 <plan_id>',
    '- 계획승인 <plan_id>',
    '- 계획발행 <plan_id>',
    '- 계획발행목록 <plan_id>'
  );
  return lines.join('\n');
}

export async function markPlanInProgress(planIdOrAlias) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.status === 'in_progress') return { ok: true, record: plan, idempotent: true };
  if (['rejected', 'done', 'blocked', 'draft', 'review_pending'].includes(plan.status)) {
    return { ok: false, reason: 'invalid_transition', plan };
  }
  const { all, idx } = await loadPlanIndex(plan.plan_id);
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const now = new Date().toISOString();
  const np = { ...plan.normalized_plan, lifecycle_phase: 'in_progress', dispatch_state: 'in_progress' };
  all[idx] = { ...plan, status: 'in_progress', normalized_plan: np, updated_at: now };
  await saveAllPlans(all);
  return { ok: true, record: all[idx] };
}

/** 계획진행 — child work 집계 (상태 전이 없음) */
export async function formatPlanProgressSlack(plan) {
  if (!plan) {
    return '[계획진행] plan을 찾지 못했습니다.\n- 형식: 계획진행 <PLN-...|번호>';
  }
  const ids = plan.linked_work_items || [];
  const statuses = [];
  const openLines = [];
  for (const id of ids) {
    const w = await getWorkItem(id);
    const st = w?.status || 'missing';
    statuses.push(st);
    if (w && w.status !== 'done' && w.status !== 'canceled') {
      openLines.push(`${w.id}|${normalizeWorkLifecycleStatus(st)}|source:${w.assigned_tool || '—'}`);
    }
  }
  const b = aggregateWorkBuckets(statuses);
  const rollup = derivePlanRollupLabel(plan.status, b);
  const head = [
    `[계획진행] ${plan.plan_id}`,
    `- plan_status: ${plan.status}`,
    `- child_work_rollup: ${rollup}`,
    `- total_works: ${b.total}`,
    `- counts: approval_pending:${b.approval_pending} approved:${b.approved} assigned:${b.assigned} dispatched:${b.dispatched} in_progress:${b.in_progress} review_requested:${b.review_requested} needs_revision:${b.needs_revision} done:${b.done} blocked:${b.blocked} rejected:${b.rejected} canceled:${b.canceled} other:${b.other}`,
    '',
    '- open_works_sample (max 8):',
  ];
  if (!openLines.length) head.push('  (empty state)');
  else head.push(...openLines.slice(0, 8).map((l) => `  - ${l}`));
  head.push(
    '',
    '── next_allowed_actions ──',
    `- 계획상세 ${plan.plan_id} | 계획발행목록 ${plan.plan_id}`,
    `- 계획완료 ${plan.plan_id} (조건: child 전부 done)`,
    `- open work: 업무상세 | 업무검토 | 커서결과기록`,
    '',
    'Next:',
    `- 계획상세 ${plan.plan_id}`,
    `- 계획발행목록 ${plan.plan_id}`,
    `- 계획시작 ${plan.plan_id}`
  );
  return head.join('\n');
}

export async function markPlanDone(planIdOrAlias) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.status === 'done') return { ok: true, record: plan, idempotent: true };
  if (plan.status === 'rejected') return { ok: false, reason: 'rejected', plan };

  const ids = plan.linked_work_items || [];
  const incomplete = [];
  for (const wid of ids) {
    const w = await getWorkItem(wid);
    const st = w?.status || 'missing';
    if (!w || st !== 'done') incomplete.push({ id: wid, status: st });
  }
  if (incomplete.length) {
    return { ok: false, reason: 'works_incomplete', plan, incomplete };
  }

  const { all, idx } = await loadPlanIndex(plan.plan_id);
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const now = new Date().toISOString();
  const np = { ...plan.normalized_plan, lifecycle_phase: 'done', dispatch_state: 'closed' };
  all[idx] = { ...plan, status: 'done', normalized_plan: np, updated_at: now };
  await saveAllPlans(all);
  return { ok: true, record: all[idx] };
}

export async function markPlanBlocked(planIdOrAlias, reason) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.status === 'blocked') {
    return { ok: true, record: plan, idempotent: true };
  }
  if (plan.status === 'done') return { ok: false, reason: 'already_done', plan };
  const { all, idx } = await loadPlanIndex(plan.plan_id);
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const now = new Date().toISOString();
  const np = { ...plan.normalized_plan, lifecycle_phase: 'blocked', dispatch_state: 'not_dispatched' };
  const note = safeTrim(reason) ? `계획차단: ${reason}` : '계획차단';
  all[idx] = {
    ...plan,
    status: 'blocked',
    normalized_plan: np,
    updated_at: now,
    block_reason: safeTrim(reason) || null,
    notes: safeTrim([plan.notes, note].filter(Boolean).join('\n')),
  };
  await saveAllPlans(all);
  return { ok: true, record: all[idx] };
}

export async function createPlanFromIntake({
  sourceText,
  normalizedPlan,
  approvalRequired,
  approvalReason,
  metadata = {},
  channelContext = null,
}) {
  const all = await getStoreCore().list('plans');
  const plan_id = await buildNextPlanId(all);
  const now = new Date().toISOString();

  const status = approvalRequired ? 'review_pending' : 'approved';
  const persona = channelContext || 'general_cos';
  const linked = [];
  const wqSource =
    metadata.workspace_queue_id != null ? String(metadata.workspace_queue_id).trim() : null;

  for (const st of normalizedPlan.proposed_subtasks || []) {
    const tool = TOOL_KEYS.includes(st.suggested_tool) ? st.suggested_tool : normalizedPlan.recommended_tooling;
    const assigned_tool = TOOL_KEYS.includes(tool) ? tool : 'manual';

    const work = await createWorkItem({
      project_key: normalizedPlan.project_key,
      tool_key: assigned_tool,
      work_type: 'feature',
      owner_type: 'persona',
      assigned_persona: persona,
      assigned_tool,
      title: st.title,
      brief: st.brief || normalizedPlan.request_text,
      approval_required: false,
      source: { kind: 'planner', plan_id },
      source_channel: metadata.channel || null,
      source_message_ts: metadata.message_ts || null,
      notes: `planner(3a): subtask of ${plan_id}`,
      source_plan_id: plan_id,
      source_workspace_queue_id: wqSource || null,
      status_override: 'draft',
      approval_status_override: 'not_required',
    });
    linked.push(work.id);
  }

  const plan = {
    plan_id,
    source_text: safeTrim(sourceText),
    normalized_plan: normalizedPlan,
    status,
    created_at: now,
    updated_at: now,
    linked_work_items: linked,
    linked_approval_id: null,
    approval_required: Boolean(approvalRequired),
    approval_reason: approvalReason || null,
    source_channel: metadata.channel || null,
    source_user: metadata.user || null,
    planner_version: '3b-link',
  };

  all.push(plan);
  await saveAllPlans(all);

  if (!approvalRequired) {
    for (const wid of linked) {
      await updateWorkStatus(wid, 'assigned', { note: `계획 자동 승인(저위험): ${plan_id}` });
    }
  }

  recentPlanAliasIds = [plan_id, ...recentPlanAliasIds.filter((x) => x !== plan_id)].slice(0, 40);
  return plan;
}

export async function setPlanLinkedApprovalId(planId, aprInternalId) {
  const { all, idx } = await loadPlanIndex(planId);
  if (idx < 0) return { ok: false, reason: 'not_found' };
  const now = new Date().toISOString();
  all[idx] = { ...all[idx], linked_approval_id: safeTrim(aprInternalId) || null, updated_at: now };
  await saveAllPlans(all);
  return { ok: true, record: all[idx] };
}

export async function appendPlanHoldNote(planId, note) {
  const { all, idx, record } = await loadPlanIndex(planId);
  if (idx < 0 || !record) return { ok: false, reason: 'not_found' };
  const line = safeTrim(note) ? `APR보류: ${safeTrim(note)}` : 'APR보류';
  const now = new Date().toISOString();
  all[idx] = { ...record, notes: safeTrim([record.notes, line].filter(Boolean).join('\n')), updated_at: now };
  await saveAllPlans(all);
  return { ok: true, record: all[idx] };
}

export async function approvePlan(planIdOrAlias) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (plan.status === 'rejected') return { ok: false, reason: 'rejected' };
  if (['approved', 'ready_for_dispatch', 'in_progress', 'done'].includes(plan.status)) {
    await resolvePlannerAprIfPending(plan.plan_id, 'approved', '계획 승인 상태·APR 동기화');
    return { ok: true, record: plan, idempotent: true };
  }

  const all = await getStoreCore().list('plans');
  const idx = all.findIndex((p) => p.plan_id === plan.plan_id);
  if (idx < 0) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();
  const np = {
    ...plan.normalized_plan,
    lifecycle_phase: 'approved',
    dispatch_state: 'ready_for_manual_dispatch',
  };
  all[idx] = {
    ...plan,
    status: 'approved',
    normalized_plan: np,
    updated_at: now,
  };
  await saveAllPlans(all);

  for (const wid of plan.linked_work_items || []) {
    const w = await getWorkItem(wid);
    if (w && w.status === 'draft') {
      await updateWorkStatus(wid, 'assigned', { note: `계획승인: ${plan.plan_id}` });
    }
  }

  await resolvePlannerAprIfPending(plan.plan_id, 'approved', '계획승인 동기화');

  return { ok: true, record: all[idx] };
}

export async function rejectPlan(planIdOrAlias, { reason = '' } = {}) {
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  if (['approved', 'ready_for_dispatch', 'in_progress', 'done'].includes(plan.status)) {
    return { ok: false, reason: 'already_approved' };
  }

  const all = await getStoreCore().list('plans');
  const idx = all.findIndex((p) => p.plan_id === plan.plan_id);
  if (idx < 0) return { ok: false, reason: 'not_found' };

  const now = new Date().toISOString();
  const np = {
    ...plan.normalized_plan,
    lifecycle_phase: 'rejected',
    dispatch_state: 'not_dispatched',
  };
  const note = safeTrim(reason) ? `계획기각: ${reason}` : '계획기각';
  all[idx] = {
    ...plan,
    status: 'rejected',
    normalized_plan: np,
    updated_at: now,
    rejection_reason: safeTrim(reason) || null,
    notes: safeTrim([plan.notes, note].filter(Boolean).join('\n')),
  };
  await saveAllPlans(all);

  await resolvePlannerAprIfPending(plan.plan_id, 'rejected', safeTrim(reason) || '계획기각');

  for (const wid of plan.linked_work_items || []) {
    const w = await getWorkItem(wid);
    if (w && !['done', 'canceled'].includes(w.status)) {
      await updateWorkStatus(wid, 'canceled', { note: `계획기각·연결종료: ${plan.plan_id}` });
    }
  }

  return { ok: true, record: all[idx] };
}

/**
 * 계획등록 Slack 출력 계약 — PLN / WRK / APR(해당 시) 항상 노출
 */
export function formatPlanRegisterContract(plan, { apr = null, approvalRequired = false } = {}) {
  if (!plan) return '[계획등록] plan이 없습니다.';
  const works = plan.linked_work_items || [];
  const w0 = works[0];
  const w1 = works[1];
  const aprKey = apr?.approval_key || null;
  const approvalIdLine =
    approvalRequired && apr
      ? `${apr.id}${aprKey ? ` (${aprKey})` : ''}`
      : approvalRequired
        ? '(APR 생성 실패 — 계획승인으로 수동 진행)'
        : 'none';

  const lines = [
    '[계획등록] 저장 완료',
    `Plan: ${plan.plan_id}`,
    `Status: ${plan.status}`,
    `Approval: ${approvalRequired ? 'yes' : 'no'}`,
    `Approval ID: ${approvalIdLine}`,
    `Works: ${works.length ? works.join(', ') : '—'}`,
    plan.approval_reason && approvalRequired ? `- Approval reason: ${plan.approval_reason}` : null,
    '',
    'Next:',
    `- 계획상세 ${plan.plan_id}`,
    `- 계획발행목록 ${plan.plan_id}`,
    `- 계획진행 ${plan.plan_id}`,
  ];

  if (approvalRequired) {
    if (apr) lines.push(`- 승인 ${aprKey || apr.id} : 메모(선택)`, `- 계획승인 ${plan.plan_id}`);
    else lines.push(`- 계획승인 ${plan.plan_id}`);
    lines.push(`- 계획기각 ${plan.plan_id} <사유(선택)>`);
  } else {
    lines.push(`- 계획발행 ${plan.plan_id}`);
  }

  if (w0) {
    lines.push(
      `- 이슈발행 ${w0}  (github 도구면; 아니면 커서발행/수파베이스발행/업무발행으로 대체)`
    );
  }
  if (w1) lines.push(`- (추가 work) ${works.slice(1).join(', ')}`);

  return lines.filter(Boolean).join('\n');
}

/** dedup hit 시 저장소에서 동일 contract 재구성 (새 PLN/APR 생성 없음) */
export async function formatPlanRegisterContractFromStoredPlan(planIdOrAlias) {
  await listRecentPlansForAlias(40);
  const plan = await getPlan(planIdOrAlias);
  if (!plan) return { ok: false, reason: 'not_found' };
  const apr =
    plan.approval_required ? await getLatestPlannerApprovalForPlan(plan.plan_id) : null;
  const text = formatPlanRegisterContract(plan, {
    apr,
    approvalRequired: Boolean(plan.approval_required),
  });
  return { ok: true, text, plan_id: plan.plan_id };
}

/** @deprecated formatPlanRegisterContract 사용 */
export function formatPlanRegisterSuccess(plan) {
  return formatPlanRegisterContract(plan, { apr: null, approvalRequired: Boolean(plan?.approval_required) });
}

async function formatPlanNextCommandsBlock(plan) {
  const works = plan.linked_work_items || [];
  const w0 = works[0];
  const apr = await getLatestPlannerApprovalForPlan(plan.plan_id);
  const lines = [
    '',
    '── Next (복붙) ──',
    `- 계획상세 ${plan.plan_id}`,
    `- 계획진행 ${plan.plan_id}`,
    `- 계획발행목록 ${plan.plan_id}`,
  ];
  if (apr) {
    const k = apr.approval_key || apr.id;
    lines.push(`- 승인 ${k} : 메모(선택)`, `- APR 상태: ${apr.status} (${apr.id})`);
  }
  if (plan.status === 'review_pending') {
    lines.push(`- 계획승인 ${plan.plan_id}`, `- 계획기각 ${plan.plan_id} <사유>`);
  } else {
    lines.push(`- 계획발행 ${plan.plan_id}`);
  }
  if (w0) lines.push(`- 이슈발행 ${w0} / 커서발행 ${w0} (도구에 맞게 선택)`);
  return lines.join('\n');
}

/** Query-only 계약: 짧은 Next (Council·장문 금지 구역) */
async function formatPlanNextBlockQuery(plan) {
  const works = plan.linked_work_items || [];
  const w0 = works[0];
  const apr = await getLatestPlannerApprovalForPlan(plan.plan_id);
  const lines = [
    '',
    'Next:',
    `- 계획진행 ${plan.plan_id}`,
    `- 계획발행목록 ${plan.plan_id}`,
  ];
  if (apr) {
    const k = apr.approval_key || apr.id;
    lines.push(`- 승인 ${k} (메모 선택) | APR ${apr.id} (${apr.status})`);
  }
  if (plan.status === 'review_pending') {
    lines.push(`- 계획승인 ${plan.plan_id} | 계획기각 ${plan.plan_id}`);
  } else {
    lines.push(`- 계획발행 ${plan.plan_id}`);
  }
  if (w0) lines.push(`- 이슈발행 ${w0} | 커서발행 ${w0} (assigned_tool 기준)`);
  return lines.join('\n');
}

export async function formatPlanDetail(plan, { queryContract = true } = {}) {
  if (!plan) {
    return queryContract
      ? '[계획상세] plan을 찾지 못했습니다.\n- 형식: 계획상세 <PLN-...|번호>'
      : '[계획상세] plan을 찾지 못했습니다.';
  }
  const np = plan.normalized_plan || {};
  const ids = plan.linked_work_items || [];
  const runCounts = await getRunCountsByWorkIds(ids);
  const runSum = Object.values(runCounts).reduce((a, n) => a + n, 0);
  const apr = await getLatestPlannerApprovalForPlan(plan.plan_id);
  const wStatuses = [];
  for (const id of ids) {
    const w = await getWorkItem(id);
    wStatuses.push(w?.status || 'missing');
  }
  const buck = aggregateWorkBuckets(wStatuses);
  const rollup = derivePlanRollupLabel(plan.status, buck);
  const lines = [
    `[계획상세] ${plan.plan_id}`,
    `- plan_status: ${plan.status}`,
    `- child_work_rollup: ${rollup}`,
    `- total_works: ${buck.total}`,
    '',
    '── approval_summary ──',
    `- approval_required: ${plan.approval_required ? 'yes' : 'no'} | linked_approval_id: ${plan.linked_approval_id || '없음'}`,
    apr
      ? `- APR: ${apr.id} | key: ${apr.approval_key || '—'} | status: ${apr.status}`
      : '- APR: (planner 연결 없음)',
    plan.approval_reason ? `- approval_reason: ${plan.approval_reason}` : null,
    '',
    '── counts summary ──',
    `- approval_pending:${buck.approval_pending} approved:${buck.approved} assigned:${buck.assigned} dispatched:${buck.dispatched} in_progress:${buck.in_progress} review_requested:${buck.review_requested} needs_revision:${buck.needs_revision} done:${buck.done} blocked:${buck.blocked} rejected:${buck.rejected} canceled:${buck.canceled} other:${buck.other}`,
    `- linked_runs_total: ${runSum}`,
    '',
    '── normalized_plan (stored artifact, not live advice) ──',
    `- lifecycle_phase: ${np.lifecycle_phase || 'unknown'}`,
    `- goal: ${np.goal || 'null'}`,
    `- scope_in: ${np.scope_in == null ? 'null' : JSON.stringify(np.scope_in)}`,
    `- scope_out: ${np.scope_out == null ? 'null' : JSON.stringify(np.scope_out)}`,
    `- requested_outputs: ${np.requested_outputs == null ? 'null' : JSON.stringify(np.requested_outputs)}`,
    `- assumptions: ${np.assumptions == null ? 'null' : np.assumptions}`,
    `- constraints: ${np.constraints == null ? 'null' : np.constraints}`,
    `- risk_tags: ${np.risk_tags == null ? 'null' : np.risk_tags.join(', ')}`,
    `- recommended_tooling: ${np.recommended_tooling || 'unknown'}`,
    `- planner_snapshot.next_action: ${np.next_action_recommendation || 'null'}`,
    `- linked_work_ids: ${(plan.linked_work_items || []).join(', ') || '없음'}`,
    '',
    '── child works ──',
  ];

  if (ids.length) {
    for (const id of ids) {
      const w = await getWorkItem(id);
      const rc = runCounts[id] ?? 0;
      if (!w) lines.push(`- ${id} (없음) | runs:${rc}`);
      else {
        const cmd = recommendDispatchCommandForWork(w);
        const ghA = Array.isArray(w.github_artifacts)
          ? w.github_artifacts.find((a) => a?.artifact_type === 'issue')
          : w.github_artifact;
        const crA =
          (Array.isArray(w.cursor_artifacts) && w.cursor_artifacts.find((a) => a?.artifact_type === 'handoff')) ||
          w.cursor_handoff_artifact;
        const lcr = await getLatestCursorRunForWork(w.id);
        lines.push(
          `- ${w.id} | ${normalizeWorkLifecycleStatus(w.status)} | ${w.assigned_tool} | runs:${rc} | ${w.title}`
        );
        lines.push(`    ${formatGithubOneliner(ghA)} | ${formatCursorOneliner(crA, lcr)}`);
        lines.push(`    dispatch_hint: \`${cmd}\``);
      }
    }
  } else {
    lines.push('- (empty state) 연결된 work 없음');
  }

  lines.push(
    '',
    '── next_allowed_actions ──',
    `- 계획진행 ${plan.plan_id} | 계획발행목록 ${plan.plan_id}`,
    buck.done === buck.total && plan.status !== 'done' && plan.status !== 'rejected'
      ? `- 계획완료 ${plan.plan_id} (조건 충족: child 전부 done)`
      : `- 계획완료 ${plan.plan_id} (조건: child 전부 done; 미충족 시 명령이 거부됨)`,
    `- per work: 업무상세 <WRK> | 업무검토 | 커서결과기록 | 업무수정요청 | 업무완료`,
    queryContract ? await formatPlanNextBlockQuery(plan) : await formatPlanNextCommandsBlock(plan)
  );

  return lines.filter(Boolean).join('\n');
}

export async function formatPlanWorkList(plan) {
  if (!plan) return '[계획작업목록] plan을 찾지 못했습니다.';
  const ids = plan.linked_work_items || [];
  if (!ids.length) return `[계획작업목록] ${plan.plan_id}\n- (연결된 work 없음)`;

  const rows = [];
  for (const id of ids) {
    const w = await getWorkItem(id);
    if (!w) rows.push(`- ${id} (삭제됨 또는 없음)`);
    else {
      rows.push(
        `- ${w.id} | ${w.status} | ${w.assigned_tool} | ${w.title}`
      );
    }
  }
  const apr = await getLatestPlannerApprovalForPlan(plan.plan_id);
  const aprLines = apr
    ? [
        '',
        `── APR ──`,
        `- id: ${apr.id} | key: ${apr.approval_key || '—'} | status: ${apr.status}`,
      ]
    : ['', '── APR ──', '- (없음)'];

  const next = await formatPlanNextCommandsBlock(plan);
  return [`[계획작업목록] ${plan.plan_id}`, ...rows, ...aprLines, next].join('\n');
}

/**
 * Generalized plan gate — legacy work(source_plan_id 없음)는 항상 통과
 */
export async function evaluatePlanGateForWorkItem(workItem) {
  if (!workItem?.source_plan_id) return { ok: true };
  let plan;
  try {
    plan = await getStoreCore().get('plans', workItem.source_plan_id);
  } catch (e) {
    return {
      ok: false,
      code: 'plan_lookup_failed',
      plan_id: workItem.source_plan_id,
      message: String(e?.message || e || 'error'),
    };
  }
  if (!plan) {
    return { ok: false, code: 'plan_missing', plan_id: workItem.source_plan_id };
  }
  if (plan.status === 'rejected') {
    return { ok: false, code: 'plan_rejected', plan_id: plan.plan_id, plan_status: plan.status };
  }
  if (PLAN_GATE_ALLOWED_STATUSES.includes(plan.status)) {
    return { ok: true, plan_id: plan.plan_id, plan_status: plan.status };
  }

  let detail = '';
  if (plan.status === 'review_pending') detail = '`계획승인 <plan_id>` 필요';
  else if (plan.status === 'draft') detail = 'plan이 draft 상태';
  else if (plan.status === 'done') detail = 'plan이 done — 신규 dispatch 비권장';
  else if (plan.status === 'blocked') detail = 'plan이 blocked — 차단 해제 전까지 dispatch 불가';
  else detail = `plan_status=${plan.status}`;

  return {
    ok: false,
    code: 'plan_not_approved',
    plan_id: plan.plan_id,
    plan_status: plan.status,
    detail,
  };
}

export function formatPlanGateResult(r) {
  if (r.ok) return '';
  const pid = r.plan_id ? ` plan_id=${r.plan_id}` : '';
  const st = r.plan_status ? ` [${r.plan_status}]` : '';
  switch (r.code) {
    case 'plan_missing':
      return `[plan_gate:plan_missing] 연결 plan 레코드가 없습니다.${pid}`;
    case 'plan_rejected':
      return `[plan_gate:plan_rejected] 기각된 계획입니다. 새로 계획등록 하세요.${pid}`;
    case 'plan_lookup_failed':
      return `[plan_gate:plan_lookup_failed] plan 조회 실패: ${r.message || 'error'}${pid}`;
    case 'plan_not_approved':
      return `[plan_gate:plan_not_approved]${st} ${r.detail || '승인·브리지 필요'}${pid} — \`계획승인\` / \`계획발행\` 확인`;
    default:
      return `[plan_gate:${r.code || 'unknown'}] ${r.message || 'blocked'}${pid}`;
  }
}

/** @deprecated 호환용 — 내부는 evaluate + format */
export async function getPlanGateMessageForWorkItem(workItem) {
  const r = await evaluatePlanGateForWorkItem(workItem);
  return r.ok ? null : formatPlanGateResult(r);
}
