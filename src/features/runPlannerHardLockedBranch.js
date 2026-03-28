/**
 * 플래너 응답 고정 분기 — Council·inferWorkCandidate 금지 (Invariant 1).
 * @see docs/cursor-handoffs/Router_Lockdown_260318_handoff.md
 */

import { createPlannerApprovalRecord } from './approvals.js';
import {
  logPlannerStage,
  logPlannerFc,
  buildPlannerDedupKey,
  peekPlannerDedupPlanId,
  storePlannerDedupPlanId,
  invalidatePlannerDedupKey,
  PLANNER_SLACK_EMPTY_BODY_MESSAGE,
  PLANNER_SLACK_ROUTING_MISS_MESSAGE,
} from './plannerRoute.js';
import {
  normalizePlanRequest,
  createPlanFromIntake,
  formatPlanRegisterContract,
  formatPlanRegisterContractFromStoredPlan,
  setPlanLinkedApprovalId,
} from './plans.js';
import { finalizeSlackResponse, logRouterEvent } from './topLevelRouter.js';
import { formatError } from '../util/formatError.js';
import { logCosToolRegistryBind } from './cosToolTelemetry.js';

/**
 * @param {{
 *   routerCtx: { raw_text: unknown, normalized_text: string },
 *   plannerNorm: string,
 *   plannerLock: { type: string, req?: object },
 *   metadata: { channel?: string|null, user?: string|null, ts?: string|null },
 *   channelContext?: string|null,
 *   projectContext?: unknown,
 *   envKey?: string|null,
 * }} args
 * @returns {Promise<string>}
 */
export async function runPlannerHardLockedBranch({
  routerCtx,
  plannerNorm,
  plannerLock,
  metadata,
  channelContext,
  projectContext,
  envKey,
}) {
  const baseFinCore = (text, response_type, target_id = null) =>
    finalizeSlackResponse({
      responder: 'planner',
      text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: '계획등록',
      target_id,
      planner_match: true,
      query_match: false,
      council_blocked: true,
      response_type,
      source_used: null,
      footer_blocked: false,
    });

  const baseFin = (text, response_type, target_id = null) => {
    logCosToolRegistryBind({
      tool_id: 'plan_register',
      pipeline: 'pre_ai_planner',
      response_type,
      target_id,
    });
    return baseFinCore(text, response_type, target_id);
  };

  logRouterEvent('planner_route_entered', {
    raw_text: String(routerCtx.raw_text).slice(0, 400),
    normalized_text: plannerNorm.slice(0, 400),
    command_name: '계획등록',
    planner_match: true,
    query_match: false,
    responder: 'planner',
    council_blocked: true,
  });

  if (plannerLock.type === 'miss') {
    logPlannerFc('planner_routing_miss', {
      planner_routing_miss: true,
      probe_preview: plannerNorm.slice(0, 240),
      probe_hex_head: Buffer.from(plannerNorm.slice(0, 72), 'utf8').toString('hex'),
    });
    logRouterEvent('usage_error_returned', {
      command_name: '계획등록',
      responder: 'planner',
      response_type: 'planner_routing_miss',
    });
    logRouterEvent('planner_route_returned', { responder: 'planner', response_type: 'planner_routing_miss' });
    return baseFin(PLANNER_SLACK_ROUTING_MISS_MESSAGE, 'planner_error_routing_miss');
  }

  const plannerReq = plannerLock.req;
  logPlannerFc('planner_normalized_input', { planner_normalized_input: plannerNorm.slice(0, 500) });

  const { raw, route_reason, normalized_input } = plannerReq;
  logPlannerFc('planner_prefix_detected', {
    planner_prefix_detected: true,
    route_reason,
    normalized_input: normalized_input?.slice(0, 300) || '',
  });

  if (!raw || plannerReq.empty_body) {
    logPlannerFc('planner_empty_body', { planner_empty_body: true, route_reason });
    logPlannerFc('planner_fallback_blocked', { planner_fallback_blocked: true, reason: 'empty_body' });
    logRouterEvent('usage_error_returned', { command_name: '계획등록', response_type: 'planner_empty_body' });
    logRouterEvent('planner_route_returned', { response_type: 'planner_empty_body' });
    return baseFin(PLANNER_SLACK_EMPTY_BODY_MESSAGE, 'planner_error_empty_body');
  }

  const dedupKey = buildPlannerDedupKey({
    channel: metadata.channel,
    user: metadata.user,
    normalizedBody: raw,
  });
  const existingPid = peekPlannerDedupPlanId(dedupKey);
  if (existingPid) {
    logPlannerFc('planner_dedup_hit', { planner_dedup_hit: true, plan_id: existingPid });
    const rebuilt = await formatPlanRegisterContractFromStoredPlan(existingPid);
    if (rebuilt.ok) {
      logPlannerFc('planner_dedup_returned_existing', {
        planner_dedup_returned_existing: true,
        plan_id: rebuilt.plan_id,
      });
      logRouterEvent('planner_route_returned', { response_type: 'planner_dedup', target_id: rebuilt.plan_id });
      return baseFin(
        `${rebuilt.text}\n\n(동일 요청 재사용 — 새 계획이 필요하면 문구를 바꿔 주세요.)`,
        'planner_contract_dedup',
        rebuilt.plan_id
      );
    }
    invalidatePlannerDedupKey(dedupKey);
    logPlannerFc('planner_dedup_hit', {
      planner_dedup_stale: true,
      plan_id: existingPid,
      note: 'stored plan missing — creating new',
    });
  }

  logPlannerStage('route_entered', {
    normalized_input,
    route_reason,
    fallback_suppressed: true,
    plan_id: null,
    work_ids: [],
    approval_id: null,
  });

  const normalized = normalizePlanRequest(raw, {
    projectContext,
    envKey,
    channelId: metadata.channel || null,
  });
  const { approval_required, approval_reason } = normalized;
  let plan;
  try {
    plan = await createPlanFromIntake({
      sourceText: raw,
      normalizedPlan: normalized,
      approvalRequired: approval_required,
      approvalReason: approval_reason,
      metadata: { channel: metadata.channel || null, user: metadata.user || null, message_ts: metadata.ts || null },
      channelContext: channelContext || 'general_cos',
    });
  } catch (e) {
    logPlannerStage('persisted', {
      normalized_input,
      route_reason,
      fallback_suppressed: true,
      plan_id: null,
      work_ids: [],
      approval_id: null,
      error: formatError(e),
    });
    logPlannerFc('planner_fallback_blocked', {
      planner_fallback_blocked: true,
      reason: 'persist_failed',
      council_skipped: true,
    });
    const errText = [
      '[계획등록] 저장에 실패했습니다 (Council로 넘기지 않음).',
      `- 사유: ${formatError(e)}`,
      '- 입력을 짧게 나누거나 bullet 목록으로 다시 시도해 주세요.',
    ].join('\n');
    logRouterEvent('planner_route_returned', { response_type: 'planner_persist_error' });
    return baseFin(errText, 'planner_error_persist');
  }

  logPlannerStage('persisted', {
    normalized_input,
    route_reason,
    fallback_suppressed: true,
    plan_id: plan.plan_id,
    work_ids: plan.linked_work_items || [],
    approval_id: null,
  });
  logPlannerStage('works_created', {
    normalized_input,
    route_reason,
    fallback_suppressed: true,
    plan_id: plan.plan_id,
    work_ids: plan.linked_work_items || [],
    approval_id: null,
  });

  let apr = null;
  if (approval_required) {
    try {
      apr = await createPlannerApprovalRecord({
        metadata,
        channelContext,
        linked_plan_id: plan.plan_id,
        linked_work_ids: plan.linked_work_items || [],
        linked_plan_status_snapshot: plan.status,
        title: normalized.goal || raw.slice(0, 100),
        question: `Planner 계획 승인: ${plan.plan_id}`,
        recommendation: approval_reason || normalized.goal || '',
      });
      await setPlanLinkedApprovalId(plan.plan_id, apr.id);
      logPlannerStage('approval_created', {
        normalized_input,
        route_reason,
        fallback_suppressed: true,
        plan_id: plan.plan_id,
        work_ids: plan.linked_work_items || [],
        approval_id: apr.id,
      });
    } catch (aprErr) {
      console.warn('[planner:apr_create]', 'fail', plan.plan_id, formatError(aprErr));
      logPlannerStage('approval_created', {
        normalized_input,
        route_reason,
        fallback_suppressed: true,
        plan_id: plan.plan_id,
        work_ids: plan.linked_work_items || [],
        approval_id: null,
        error: formatError(aprErr),
      });
    }
  }

  const body = formatPlanRegisterContract(plan, { apr, approvalRequired: approval_required });
  storePlannerDedupPlanId(dedupKey, plan.plan_id);
  logPlannerStage('response_rendered', {
    normalized_input,
    route_reason,
    fallback_suppressed: true,
    plan_id: plan.plan_id,
    work_ids: plan.linked_work_items || [],
    approval_id: apr?.id || null,
  });
  logRouterEvent('planner_route_returned', { response_type: 'planner_contract', target_id: plan.plan_id });
  return baseFin(body, 'planner_contract_ok', plan.plan_id);
}
