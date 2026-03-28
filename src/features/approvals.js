import { getStoreCore } from '../storage/core/index.js';

let makeIdFn = null;
let deriveDecisionStateFn = null;
let mergeRisksFn = null;

let recentApprovalAliasIds = [];

export function initApprovals({ makeId, deriveDecisionState, mergeRisks }) {
  makeIdFn = makeId;
  deriveDecisionStateFn = deriveDecisionState;
  mergeRisksFn = mergeRisks;
}

function assertInjected() {
  if (!makeIdFn || !deriveDecisionStateFn || !mergeRisksFn) {
    throw new Error('approvals.js: missing injected helpers (initApprovals not called)');
  }
}

function safeTrim(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function padSeq2(n) {
  return String(n).padStart(2, '0');
}

function getYYMMDDFromCreatedAt(createdAt) {
  if (!createdAt) return null;
  const d = new Date(createdAt);
  if (!Number.isFinite(d.getTime())) return null;

  const y = String(d.getUTCFullYear()).slice(-2);
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}${m}${day}`;
}

function parseSeqFromApprovalKey(approvalKey) {
  // <CAT>-<YYMMDD>-<SEQ2>
  const match = safeTrim(approvalKey).match(/^[A-Z]{3}-\d{6}-(\d{2,})$/);
  if (!match) return null;
  const n = Number(match[1]);
  return Number.isFinite(n) ? n : null;
}

function deriveChannelSensitivity(channelContext) {
  if (channelContext === 'risk_review') return 'high';
  if (channelContext === 'strategy_finance') return 'high';
  if (channelContext === 'engineering') return 'medium';
  if (channelContext === 'ops_grants') return 'medium';
  if (channelContext === 'product_ux') return 'medium';
  return 'low';
}

function deriveApprovalCategory(channelContext) {
  // approval_category code (for external display key prefix)
  if (channelContext === 'risk_review') return 'RSK';
  if (channelContext === 'strategy_finance') return 'FIN';
  if (channelContext === 'engineering') return 'ENG';
  if (channelContext === 'ops_grants') return 'OPS';
  if (channelContext === 'product_ux') return 'PRD';
  return 'GEN';
}

function computePriorityFields({ route, primary, risk, channelContext }) {
  const reasons = [];
  let score = 0;

  const urgency = route?.urgency;
  if (urgency === 'high') {
    score += 30;
    reasons.push('긴급도 high');
  } else if (urgency === 'medium') {
    score += 15;
    reasons.push('긴급도 medium');
  }

  if (primary?.ceo_decision_needed === true) {
    score += 20;
    reasons.push('대표 결정 필요');
  }

  if (risk?.decision_should_pause === true) {
    score += 25;
    reasons.push('리스크로 인한 결정 보류');
  }

  if (route?.include_risk === true) {
    score += 5;
    reasons.push('리스크 포함 요청');
  }

  const channel_sensitivity = deriveChannelSensitivity(channelContext);
  if (channel_sensitivity === 'high') {
    score += 15;
    reasons.push('채널 민감도 high');
  } else if (channel_sensitivity === 'medium') {
    score += 8;
    reasons.push('채널 민감도 medium');
  }

  return {
    priority_score: clamp(score, 0, 100),
    channel_sensitivity,
    priority_reasons: reasons,
  };
}

function deriveApprovalKey({ approval_category, yymmdd, approval_seq }) {
  if (!approval_category || !yymmdd || !Number.isFinite(approval_seq)) return null;
  return `${approval_category}-${yymmdd}-${padSeq2(approval_seq)}`;
}

function getItemSeq(item) {
  if (Number.isFinite(item?.approval_seq)) return item.approval_seq;
  const parsed = parseSeqFromApprovalKey(item?.approval_key);
  return parsed;
}

async function ensureBackfilledApprovalFields(items, { persist = false } = {}) {
  let changed = false;

  // First pass: compute priority + channel/ category fields.
  for (const item of items) {
    const channelContext = item?.channel_context ?? null;

    if (!item.approval_category) {
      item.approval_category = deriveApprovalCategory(channelContext);
      changed = true;
    }

    if (!item.channel_sensitivity) {
      item.channel_sensitivity = deriveChannelSensitivity(channelContext);
      changed = true;
    }

    const needsPriority =
      typeof item.priority_score !== 'number' ||
      !Array.isArray(item.priority_reasons) ||
      item.priority_reasons.length === 0;

    if (needsPriority) {
      const computed = computePriorityFields({
        route: item.route,
        primary: item.primary,
        risk: item.risk,
        channelContext,
      });

      item.priority_score = computed.priority_score;
      item.channel_sensitivity = computed.channel_sensitivity;
      item.priority_reasons = computed.priority_reasons;
      changed = true;
    }
  }

  // Second pass: compute approval_key + approval_seq lazily when missing.
  const groupMap = new Map();
  for (const item of items) {
    const yymmdd = getYYMMDDFromCreatedAt(item.created_at);
    if (!yymmdd) continue;

    const category = item.approval_category || deriveApprovalCategory(item.channel_context ?? null);
    const key = `${category}|${yymmdd}`;
    if (!groupMap.has(key)) groupMap.set(key, []);
    groupMap.get(key).push(item);
  }

  for (const [groupKey, groupItems] of groupMap.entries()) {
    const [approval_category, yymmdd] = groupKey.split('|');

    let maxSeq = 0;
    for (const item of groupItems) {
      const seq = getItemSeq(item);
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
    }

    // If approval_key exists but approval_seq is missing, restore it from the key.
    for (const item of groupItems) {
      if (item.approval_key && !Number.isFinite(item.approval_seq)) {
        const parsedSeq = parseSeqFromApprovalKey(item.approval_key);
        if (Number.isFinite(parsedSeq)) {
          item.approval_seq = parsedSeq;
          changed = true;
        }
      }
    }

    const missing = groupItems
      .filter((i) => !i.approval_key)
      .sort((a, b) => String(a.created_at || '').localeCompare(String(b.created_at || '')));

    let nextSeq = maxSeq;
    for (const item of missing) {
      nextSeq += 1;
      item.approval_seq = nextSeq;
      item.approval_category = approval_category;
      item.approval_key = deriveApprovalKey({
        approval_category,
        yymmdd,
        approval_seq: nextSeq,
      });
      changed = true;
    }
  }

  if (changed && persist) {
    await getStoreCore().replaceAll('approvals', items);
  }

  // Keep alias list backfill-safe: if we didn't persist, list resolution by approval_key might still work in-memory.
  return changed;
}

export async function getPendingApprovals(count = 20) {
  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: true });

  const pending = items.filter((item) => item.status === 'pending');
  pending.sort((a, b) => {
    const sa = typeof a.priority_score === 'number' ? a.priority_score : 0;
    const sb = typeof b.priority_score === 'number' ? b.priority_score : 0;
    if (sb !== sa) return sb - sa;
    // ISO string can be compared lexicographically
    return String(b.created_at || '').localeCompare(String(a.created_at || ''));
  });

  return pending.slice(0, count);
}

export async function upsertApprovalRecord({
  userText,
  metadata,
  channelContext,
  route,
  primary,
  risk,
}) {
  assertInjected();

  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: false });

  const existing = items.find(
    (item) =>
      item.status === 'pending' &&
      metadata?.event_id &&
      item.source?.event_id &&
      item.source.event_id === metadata.event_id
  );

  if (existing) {
    return existing;
  }

  const created_at = new Date().toISOString();
  const channel_sensitivity = deriveChannelSensitivity(channelContext ?? null);
  const approval_category = deriveApprovalCategory(channelContext ?? null);
  const priorityComputed = computePriorityFields({
    route,
    primary,
    risk,
    channelContext: channelContext ?? null,
  });
  const yymmdd = getYYMMDDFromCreatedAt(created_at);

  let maxSeq = 0;
  if (yymmdd) {
    for (const item of items) {
      const itemY = getYYMMDDFromCreatedAt(item.created_at);
      if (itemY !== yymmdd) continue;
      const itemCat = item.approval_category || deriveApprovalCategory(item.channel_context ?? null);
      if (itemCat !== approval_category) continue;

      const seq = getItemSeq(item);
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
    }
  }
  const approval_seq = maxSeq + 1;
  const approval_key = deriveApprovalKey({ approval_category, yymmdd, approval_seq });

  const record = {
    id: makeIdFn('APR'),
    status: 'pending',
    created_at,
    updated_at: created_at,
    title: primary.one_line_summary.slice(0, 100),
    question: deriveDecisionStateFn(route, primary, risk).decisionQuestion,
    recommendation: primary.recommendation,
    strongest_objection: risk?.strongest_objection || primary.strongest_objection,
    key_risks: mergeRisksFn(primary.key_risks, risk?.hidden_risks || []),
    next_actions: primary.next_actions,
    route,
    primary,
    risk,
    user_text: userText,
    source: metadata,
    channel_context: channelContext,

    priority_score: priorityComputed.priority_score,
    channel_sensitivity: priorityComputed.channel_sensitivity,
    priority_reasons: priorityComputed.priority_reasons,

    approval_key: approval_key || null,
    approval_seq: Number.isFinite(approval_seq) ? approval_seq : null,
    approval_category,
  };

  items.push(record);
  await getStoreCore().replaceAll('approvals', items);
  return record;
}

/**
 * 계획등록(고위험) 전용 APR — council primary/risk 없이 plan/work 링크 고정
 */
export async function createPlannerApprovalRecord({
  metadata,
  channelContext,
  linked_plan_id,
  linked_work_ids = [],
  linked_plan_status_snapshot = null,
  title,
  question,
  recommendation = '',
}) {
  assertInjected();

  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: false });

  const created_at = new Date().toISOString();
  const channel_sensitivity = deriveChannelSensitivity(channelContext ?? null);
  const approval_category = deriveApprovalCategory(channelContext ?? null);
  const priorityComputed = computePriorityFields({
    route: { urgency: 'high', include_risk: true },
    primary: { ceo_decision_needed: true },
    risk: { decision_should_pause: true },
    channelContext: channelContext ?? null,
  });
  const yymmdd = getYYMMDDFromCreatedAt(created_at);

  let maxSeq = 0;
  if (yymmdd) {
    for (const item of items) {
      const itemY = getYYMMDDFromCreatedAt(item.created_at);
      if (itemY !== yymmdd) continue;
      const itemCat = item.approval_category || deriveApprovalCategory(item.channel_context ?? null);
      if (itemCat !== approval_category) continue;
      const seq = getItemSeq(item);
      if (Number.isFinite(seq)) maxSeq = Math.max(maxSeq, seq);
    }
  }
  const approval_seq = maxSeq + 1;
  const approval_key = deriveApprovalKey({ approval_category, yymmdd, approval_seq });

  const record = {
    id: makeIdFn('APR'),
    status: 'pending',
    created_at,
    updated_at: created_at,
    approval_kind: 'planner',
    linked_plan_id: safeTrim(linked_plan_id),
    linked_work_ids: Array.isArray(linked_work_ids) ? [...linked_work_ids] : [],
    linked_plan_status_snapshot: linked_plan_status_snapshot || null,

    title: safeTrim(title).slice(0, 100) || 'Planner 계획 승인',
    question: safeTrim(question) || '계획 승인이 필요합니다.',
    recommendation: safeTrim(recommendation),
    strongest_objection: '',
    key_risks: [],
    next_actions: [
      `승인 ${approval_key || 'APR-...'} : 메모(선택)`,
      `계획승인 ${linked_plan_id}`,
      `계획상세 ${linked_plan_id}`,
    ],
    route: { source: 'planner', linked_plan_id },
    primary: {
      one_line_summary: safeTrim(title).slice(0, 100),
      recommendation: safeTrim(recommendation),
      ceo_decision_needed: true,
      key_risks: [],
      next_actions: [],
    },
    risk: {
      strongest_objection: '',
      hidden_risks: [],
      decision_should_pause: true,
    },
    user_text: `planner_plan:${linked_plan_id}`,
    source: { ...(metadata || {}), planner: true, linked_plan_id },
    channel_context: channelContext,

    priority_score: priorityComputed.priority_score,
    channel_sensitivity: priorityComputed.channel_sensitivity,
    priority_reasons: priorityComputed.priority_reasons,

    approval_key: approval_key || null,
    approval_seq: Number.isFinite(approval_seq) ? approval_seq : null,
    approval_category,
  };

  items.push(record);
  await getStoreCore().replaceAll('approvals', items);
  return record;
}

/** plan에 매달린 pending planner APR을 종료(결정 로그 없음 — 계획승인/기각 동기화용) */
export async function resolvePlannerAprIfPending(planId, targetStatus, note = '') {
  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: false });
  const idx = items.findIndex(
    (i) => i.linked_plan_id === planId && i.status === 'pending' && i.approval_kind === 'planner'
  );
  if (idx < 0) return { ok: false, reason: 'none' };

  const now = new Date().toISOString();
  const actionMap = {
    approved: '승인',
    on_hold: '보류',
    rejected: '폐기',
  };
  items[idx] = {
    ...items[idx],
    status: targetStatus,
    resolved_at: now,
    resolution_note: safeTrim(note),
    resolution_action: actionMap[targetStatus] || '승인',
    updated_at: now,
  };
  await getStoreCore().replaceAll('approvals', items);
  return { ok: true, record: items[idx] };
}

export async function findPendingPlannerAprForPlan(planId) {
  const items = await getStoreCore().list('approvals');
  return (
    items.find(
      (i) => i.linked_plan_id === planId && i.status === 'pending' && i.approval_kind === 'planner'
    ) || null
  );
}

/** plan에 연결된 planner APR 최신 1건 (pending 우선 아님 — 상세 표시용) */
export async function getLatestPlannerApprovalForPlan(planId) {
  const items = await getStoreCore().list('approvals');
  const linked = items.filter((i) => i.linked_plan_id === planId && i.approval_kind === 'planner');
  if (!linked.length) return null;
  linked.sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
  return linked[0];
}

/**
 * 승인/보류/폐기 명령 파싱.
 * token: 내부 id(APR-...), approval_key(FIN-260318-01), alias 숫자(1, 2), [1] 형태 모두 허용.
 */
export function parseApprovalAction(text) {
  const match = text
    .trim()
    .match(/^(승인|보류|폐기)\s+([^\s]+)(?:\s*:\s*(.+)|\s+(.+))?$/);
  if (!match) return null;

  let token = safeTrim(match[2]);
  const bracketAlias = token.match(/^\[(\d+)\]$/);
  if (bracketAlias) token = bracketAlias[1];

  return {
    action: match[1],
    approvalId: token,
    note: (match[3] || match[4]) ? safeTrim(match[3] || match[4]) : '',
  };
}

export async function updateApprovalStatus(approvalId, action, note = '', context = {}) {
  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: false });

  // Resolve token -> internal approval id.
  let resolvedId = null;
  if (/^\d+$/.test(String(approvalId)) && recentApprovalAliasIds.length) {
    const aliasIdx = Number(approvalId) - 1;
    if (aliasIdx >= 0 && aliasIdx < recentApprovalAliasIds.length) {
      resolvedId = recentApprovalAliasIds[aliasIdx];
    }
  }

  if (!resolvedId) {
    const byId = items.find((item) => item.id === approvalId);
    if (byId) resolvedId = byId.id;
  }

  if (!resolvedId) {
    const byKey = items.find((item) => item.approval_key === approvalId);
    if (byKey) resolvedId = byKey.id;
  }

  const idx = items.findIndex((item) => item.id === resolvedId);

  if (idx === -1) {
    return { ok: false, reason: 'not_found' };
  }

  const current = items[idx];

  const statusMap = {
    승인: 'approved',
    보류: 'on_hold',
    폐기: 'rejected',
  };

  const status = statusMap[action];
  if (!status) {
    return { ok: false, reason: 'invalid_action' };
  }

  const resolved_at = new Date().toISOString();
  const updated_at = resolved_at;

  // Already resolved: allow note update for the same disposition (optional follow-up comment).
  if (current.status !== 'pending') {
    if (current.status === status) {
      const trimmedNote = safeTrim(note);
      if (trimmedNote && (!current.resolution_note || !safeTrim(current.resolution_note))) {
        items[idx] = {
          ...current,
          resolution_note: trimmedNote,
          resolution_action: action,
          updated_at,
        };
        await getStoreCore().replaceAll('approvals', items);
        return { ok: true, record: items[idx] };
      }
    }

    return { ok: false, reason: 'already_resolved', current };
  }

  // Pending -> resolve
  items[idx] = {
    ...current,
    status,
    resolved_at,
    resolution_note: safeTrim(note),
    resolution_action: action,
    updated_at,
  };

  await getStoreCore().replaceAll('approvals', items);

  // Decision/Lesson auto-link (only on pending transition).
  const actorId = context?.approved_by || context?.actor || null;
  const approvalKey = items[idx].approval_key || items[idx].id;

  if (action === '승인') {
    const decision_summary = safeTrim(note) || items[idx].question || items[idx].recommendation || items[idx].title;
    const tags = Array.from(new Set([items[idx].approval_category || 'GEN', 'approved'])).slice(0, 5);

    await getStoreCore().insert('decisions', {
      id: makeIdFn('DEC'),
      created_at: resolved_at,

      title: items[idx].title,
      adopted_option: decision_summary,
      strongest_objection: items[idx].strongest_objection,
      next_actions: items[idx].next_actions || [],
      tags,

      // Auto-link metadata
      source_type: 'approval',
      source_approval_id: items[idx].id,
      source_approval_key: approvalKey,
      approval_category: items[idx].approval_category,
      approved_by: actorId,
      approved_at: resolved_at,
      decision_summary,

      source: { ...(context?.source || {}), source_type: 'approval' },
      channel_context: items[idx].channel_context,
    });
  } else if (action === '보류' || action === '폐기') {
    const disposition = action === '보류' ? 'held' : 'discarded';
    const reason = safeTrim(note);
    const tags = Array.from(
      new Set([items[idx].approval_category || 'GEN', disposition])
    ).slice(0, 5);

    await getStoreCore().insert('lessons', {
      id: makeIdFn('LES'),
      created_at: resolved_at,

      title: `${disposition === 'held' ? '보류' : '폐기'}: ${items[idx].title}`,
      what_worked: '결정 조건과 리스크를 명확히 함',
      what_failed: reason ? `보류/폐기 사유: ${reason}` : '추가 사유 없음',
      what_to_change_next_time: '필요한 조건/정보를 보완한 뒤 재검토',
      future_trigger: '조건이 충족되면 승인대기 재요청',
      tags,

      // Auto-link metadata
      source_type: 'approval',
      source_approval_id: items[idx].id,
      source_approval_key: approvalKey,
      disposition,
      reason,
      channel: items[idx].channel_context || null,
      category: items[idx].approval_category || null,
      timestamp: resolved_at,

      source: { ...(context?.source || {}), source_type: 'approval' },
      channel_context: items[idx].channel_context,
    });
  }

  return { ok: true, record: items[idx] };
}

export function formatPendingApprovals(records) {
  if (!records.length) {
    return '현재 승인 대기 중인 안건이 없습니다.';
  }

  recentApprovalAliasIds = records.map((r) => r.id);

  const text = [
    '승인 대기 안건',
    ...records.map((r, i) => {
      const key = r.approval_key || r.id;
      const score = typeof r.priority_score === 'number' ? r.priority_score : 0;
      const sens = r.channel_sensitivity || 'low';
      const reasons = Array.isArray(r.priority_reasons) ? r.priority_reasons.slice(0, 3) : [];
      const shortQuestion = safeTrim(r.question || '').slice(0, 120);

      const pln = r.linked_plan_id ? `\n- 연결 Plan: ${r.linked_plan_id}` : '';
      return (
        `[${i + 1}] ${key}\n` +
        `- 점수: ${score}\n` +
        `- 채널 민감도: ${sens}\n` +
        `- 제목/질문 요약: ${r.title} / ${shortQuestion}\n` +
        `- 핵심 이유: ${reasons.length ? reasons.join(', ') : '없음'}\n` +
        `- 생성일: ${r.created_at}\n` +
        `- 내부 ID: ${r.id}` +
        pln
      );
    }),
  ].join('\n\n');

  // Optional Slack buttons
  const blocks = buildApprovalListBlocks(records);
  return { text, blocks };
}

export function formatPendingApprovalsSummary(records) {
  if (!records.length) {
    return '현재 승인 대기 중인 안건이 없습니다.';
  }

  recentApprovalAliasIds = records.map((r) => r.id);

  const text = [
    '승인 대기 요약',
    ...records.map((r, i) => {
      const key = r.approval_key || r.id;
      const score = typeof r.priority_score === 'number' ? r.priority_score : 0;
      const sens = r.channel_sensitivity || 'low';
      const reasons = Array.isArray(r.priority_reasons) ? r.priority_reasons.slice(0, 3) : [];
      const shortQuestion = safeTrim(r.question || '').slice(0, 90);
      const reasonText = reasons.length ? reasons.join(', ') : '없음';

      const pln = r.linked_plan_id ? `\n- Plan: ${r.linked_plan_id}` : '';
      return (
        `[${i + 1}] ${key}\n` +
        `- 점수: ${score} / 민감도: ${sens}\n` +
        `- 요약: ${r.title} / ${shortQuestion}\n` +
        `- 핵심 이유: ${reasonText}` +
        pln
      );
    }),
  ].join('\n\n');

  const blocks = buildApprovalListBlocks(records, { compact: true });
  return { text, blocks };
}

export function formatApprovalUpdate(result) {
  if (!result.ok) {
    if (result.reason === 'not_found') return '해당 승인 ID를 찾지 못했습니다.';
    if (result.reason === 'already_resolved') {
      return `이미 처리된 안건입니다. 현재 상태: ${result.current.status}`;
    }
    return '승인 상태 변경에 실패했습니다.';
  }

  const r = result.record;
  const lines = [
    '승인 상태 변경 완료',
    `- 승인 ID: ${r.approval_key || r.id}`,
    `- 상태: ${r.status}`,
    `- 제목: ${r.title}`,
    `- 메모: ${r.resolution_note || '없음'}`,
  ];
  if (r.linked_plan_id) {
    lines.push(`- 연결 Plan: ${r.linked_plan_id}`);
    if (Array.isArray(r.linked_work_ids) && r.linked_work_ids.length) {
      lines.push(`- 연결 Works: ${r.linked_work_ids.join(', ')}`);
    }
  }
  return lines.join('\n');
}

export async function getApprovalByInternalId(approvalId) {
  const items = await getStoreCore().list('approvals');
  await ensureBackfilledApprovalFields(items, { persist: false });
  return items.find((item) => item.id === approvalId) || null;
}

export function formatApprovalDetail(r) {
  const key = r?.approval_key || r?.id;
  const score = typeof r?.priority_score === 'number' ? r.priority_score : 0;
  const sens = r?.channel_sensitivity || 'low';
  const reasons = Array.isArray(r?.priority_reasons) ? r.priority_reasons.slice(0, 3) : [];
  const shortQuestion = safeTrim(r?.question || '').slice(0, 200);

  return [
    '승인 상세',
    `- 승인 Key: ${key}`,
    `- 점수: ${score} / 민감도: ${sens}`,
    `- 제목/질문: ${r?.title} / ${shortQuestion}`,
    `- 핵심 이유: ${reasons.length ? reasons.join(', ') : '없음'}`,
    `- 상태: ${r?.status}`,
    `- 내부 ID: ${r?.id}`,
  ].join('\n');
}

function buildApprovalListBlocks(records, { compact = false } = {}) {
  const blocks = [];

  blocks.push({
    type: 'section',
    text: { type: 'mrkdwn', text: compact ? '*승인 대기 요약*' : '*승인 대기 안건*' },
  });

  for (let i = 0; i < records.length; i += 1) {
    const r = records[i];
    const key = r.approval_key || r.id;
    const score = typeof r.priority_score === 'number' ? r.priority_score : 0;
    const sens = r.channel_sensitivity || 'low';
    const reasons = Array.isArray(r.priority_reasons) ? r.priority_reasons.slice(0, 3) : [];
    const reasonsText = reasons.length ? reasons.join(', ') : '없음';
    const shortQuestion = safeTrim(r.question || '').slice(0, compact ? 80 : 110);

    // 사용자 입력(title/question/reasons)을 mrkdwn에 넣으면 * < 등으로 invalid_blocks →
    // registerHandlers가 텍스트만 재전송해 버튼이 사라질 수 있음. 본문은 plain_text 사용.
    const bodyText =
      `[${i + 1}] ${key}\n` +
      `- 점수: ${score} / 민감도: ${sens}\n` +
      `- 제목/질문: ${r.title ?? ''} / ${shortQuestion}\n` +
      `- 핵심 이유: ${reasonsText}`;
    blocks.push({
      type: 'section',
      text: {
        type: 'plain_text',
        text: bodyText.slice(0, 2000),
        emoji: true,
      },
    });

    // Slack: action_id must be unique within the entire message.
    const blockPrefix = `approval_${i}_`;
    blocks.push({
      type: 'actions',
      elements: [
        {
          type: 'button',
          text: { type: 'plain_text', text: '승인' },
          value: JSON.stringify({ approvalId: r.id }),
          action_id: `${blockPrefix}approve`,
          style: 'primary',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '보류' },
          value: JSON.stringify({ approvalId: r.id }),
          action_id: `${blockPrefix}hold`,
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '폐기' },
          value: JSON.stringify({ approvalId: r.id }),
          action_id: `${blockPrefix}reject`,
          style: 'danger',
        },
        {
          type: 'button',
          text: { type: 'plain_text', text: '상세' },
          value: JSON.stringify({ approvalId: r.id }),
          action_id: `${blockPrefix}detail`,
        },
      ],
    });
  }

  return blocks;
}

