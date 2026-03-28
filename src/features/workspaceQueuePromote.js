/**
 * 실행 큐(spec_intake) → 계획·업무(PLN·WRK) 승격 — Slack 한 줄로 에이전트/Cursor 브리지까지 연결.
 * @see cosWorkspaceQueue.js · plans.js · runInboundStructuredCommands `실행큐계획화`
 */

import { readJsonArray } from '../storage/jsonStore.js';
import { resolveCosWorkspaceQueuePath } from '../storage/paths.js';
import { normalizePlanRequest, createPlanFromIntake } from './plans.js';
import { patchWorkspaceQueueItem } from './cosWorkspaceQueue.js';

/**
 * @param {string} id
 * @param {string} [filePath]
 */
export async function findWorkspaceQueueItemById(id, filePath = resolveCosWorkspaceQueuePath()) {
  const qid = String(id || '').trim();
  if (!qid) return null;
  const items = await readJsonArray(filePath);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    if (items[i] && items[i].id === qid) return items[i];
  }
  return null;
}

/**
 * 가장 최근의 · 아직 PLN으로 승격되지 않은 `spec_intake` id (없으면 null).
 * @param {string} [filePath]
 */
export async function findLatestPromotableWorkspaceQueueId(filePath = resolveCosWorkspaceQueuePath()) {
  const items = await readJsonArray(filePath);
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const it = items[i];
    if (!it || it.kind !== 'spec_intake') continue;
    if (it.status === 'promoted') continue;
    if (!String(it.body || '').trim()) continue;
    return it.id;
  }
  return null;
}

/**
 * @param {object} p
 * @param {string} p.queueId CWS-…
 * @param {Record<string, unknown>} [p.metadata]
 * @param {string | null} [p.channelContext]
 * @param {string | null} [p.projectContext]
 * @param {string} [p.envKey]
 * @param {string} [p.filePath]
 */
export async function promoteWorkspaceQueueSpecToPlan({
  queueId,
  metadata = {},
  channelContext = null,
  projectContext = null,
  envKey = 'dev',
  filePath = resolveCosWorkspaceQueuePath(),
}) {
  const item = await findWorkspaceQueueItemById(queueId, filePath);
  if (!item) return { ok: false, reason: 'not_found' };
  if (item.kind !== 'spec_intake') return { ok: false, reason: 'wrong_kind', item };
  if (item.status === 'promoted' && item.linked_plan_id) {
    return { ok: false, reason: 'already_promoted', item };
  }

  const body = String(item.body || '').trim();
  if (!body) return { ok: false, reason: 'empty_body', item };

  const channelId = metadata.channel != null ? String(metadata.channel) : null;
  const normalized = normalizePlanRequest(`[실행큐 ${item.id}] ${body}`, {
    projectContext,
    envKey,
    channelId,
  });

  const plan = await createPlanFromIntake({
    sourceText: `[실행큐 ${item.id}] ${body}`,
    normalizedPlan: normalized,
    approvalRequired: normalized.approval_required,
    approvalReason: normalized.approval_reason,
    metadata: {
      ...metadata,
      workspace_queue_id: item.id,
    },
    channelContext,
  });

  await patchWorkspaceQueueItem(
    item.id,
    {
      status: 'promoted',
      linked_plan_id: plan.plan_id,
    },
    filePath,
  );

  try {
    console.info(
      JSON.stringify({
        event: 'cos_workspace_queue_promoted',
        ts: new Date().toISOString(),
        queue_id: item.id,
        plan_id: plan.plan_id,
        work_ids: plan.linked_work_items || [],
      }),
    );
  } catch {
    /* ignore */
  }

  return { ok: true, plan, queueItem: item };
}

/**
 * @param {{ plan: object, queueItem: object }} p
 */
export function formatWorkspaceQueuePromoteSlack({ plan, queueItem }) {
  const wrks = Array.isArray(plan.linked_work_items) ? plan.linked_work_items : [];
  const w0 = wrks[0];
  const needApr = Boolean(plan.approval_required) || plan.status === 'review_pending';
  return [
    '*[실행 큐 → 계획·업무]*',
    `\`${queueItem.id}\` → \`${plan.plan_id}\``,
    needApr
      ? `*PLN 상태:* \`${plan.status}\` — 다음: \`계획승인 ${plan.plan_id}\` (또는 \`계획상세\`로 범위 확인)`
      : `*PLN 상태:* \`${plan.status}\` — 업무에 배정됨`,
    wrks.length ? `*WRK:* ${wrks.map((w) => `\`${w}\``).join(' ')}` : '*WRK:* 없음',
    '',
    '*다음 — COS 아래 레이어 (Cursor / GitHub / CI)*',
    w0
      ? `· \`커서발행 ${w0}\` — 핸드오프·RUN 기록 (외부 Cursor 에이전트)`
      : '· 세부 업무가 비었습니다 — 실행 큐 본문을 `- 항목` 리스트로 나눠 다시 적재해 보세요',
    `· \`계획진행 ${plan.plan_id}\` · \`계획상세 ${plan.plan_id}\` · \`업무상세 ${w0 || 'WRK-…'}\``,
    '· 배포·증거: \`워크큐증거\`·\`러너증거\` · 설정 시 \`POST /cos/ci-proof\`',
    w0 ? `· 실행 맥락: \`업무상세 ${w0}\` (실행 큐·PLN id 포함)` : null,
    queueItem?.id ? `· 실행 큐 감사: 항목 \`${queueItem.id}\` (promoted)` : null,
  ]
    .filter(Boolean)
    .join('\n');
}
