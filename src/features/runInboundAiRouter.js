/**
 * Big Pivot (COS Slack) — 내비게이터 / Council / 자연어 dialog AI 꼬리.
 * `runInboundCommandRouter` 가 구조화 명령까지 처리한 뒤, 미스 시에만 호출된다.
 * `classifyInboundResponderPreview` 는 회귀용으로 도움말·조회·플래너 락·**surface**·(이하 AI 꼬리 순)을 LLM 없이 축약한다.
 */

import { normalizeSlackUserPayload } from '../slack/slackTextNormalize.js';
import {
  extractQueryCommandLine,
  handleQueryOnlyCommands,
  isStructuredQueryOnlyLine,
  tryFinalizeSlackQueryRoute,
} from './queryOnlyRoute.js';
import { isCouncilCommand } from '../slack/councilCommandPrefixes.js';
import { tryParseCosNavigatorTrigger, runCosNavigator, getCosNavigatorEmptyIntro } from './cosNavigator.js';
import { runCosNaturalPartner } from './cosNaturalPartner.js';
import {
  normalizePlannerInputForRoute,
  analyzePlannerResponderLock,
  shouldSuppressWorkCandidateFooter,
  logPlannerFc,
} from './plannerRoute.js';
import { finalizeSlackResponse, logRouterEvent } from './topLevelRouter.js';
import {
  runCouncilMode,
  parseCouncilCommand,
  routeTask,
  deriveDecisionState,
} from '../agents/index.js';
import { upsertApprovalRecord } from './approvals.js';
import { inferWorkCandidate } from './workItems.js';
import { appendJsonRecord } from '../storage/jsonStore.js';
import { INTERACTIONS_FILE } from '../storage/paths.js';
import { buildSlackThreadKey, getConversationTranscript } from './slackConversationBuffer.js';
import {
  pickThreadPlanFollowUpHint,
  formatThreadPlanFollowUpFooter,
} from './threadPlanFollowUpHint.js';
import { logCosToolRegistryBind } from './cosToolTelemetry.js';
import {
  shouldOfferWorkspaceQueueButtons,
  buildDialogQueueConfirmationBlocks,
} from '../slack/dialogQueueConfirmBlocks.js';
import { tryExecutiveSurfaceResponse } from './tryExecutiveSurfaceResponse.js';
import { tryFinalizeG1CosLineageTransport } from './g1cosLineageTransport.js';

/**
 * @typedef {{ trimmed: string, planner_lock: { type: string }, query_line_resolved: string }} RouterSyncLike
 */

/**
 * Fixture·회귀용 축약 분류 (LLM 없음). 도움말·조회·플래너 락 다음 **surface** 를 넣어
 * `runInboundCommandRouter` 와 맞춘다. 구조화 명령(`runInboundStructuredCommands`)은 시뮬하지 않는다.
 * @param {RouterSyncLike} snap `buildRouterSyncSnapshot` 결과와 동일 필드
 * @returns {Promise<{ responder: 'help'|'query'|'planner'|'executive_surface'|'navigator'|'council'|'dialog'|'lineage_transport', queryRaw?: string, surfaceRaw?: string, surfacePacketId?: string | null, surfaceStatusPacketId?: string | null, surfaceResponseType?: string, lineageText?: string, lineageResponseType?: string }>}
 */
export async function classifyInboundResponderPreview(snap) {
  const trimmed = snap.trimmed;

  if (trimmed === '도움말' || trimmed === '운영도움말') {
    return { responder: 'help' };
  }

  const queryRaw = await handleQueryOnlyCommands(snap.query_line_resolved);
  if (queryRaw != null) {
    return { responder: 'query', queryRaw };
  }

  if (snap.planner_lock.type !== 'none') {
    return { responder: 'planner' };
  }

  const lineageHit = await tryFinalizeG1CosLineageTransport(trimmed, {});
  if (lineageHit != null) {
    return {
      responder: 'lineage_transport',
      lineageText: lineageHit.text,
      lineageResponseType: lineageHit.response_type,
    };
  }

  const surfaceResult = await tryExecutiveSurfaceResponse(trimmed);
  if (surfaceResult != null) {
    return {
      responder: 'executive_surface',
      surfaceRaw: surfaceResult.text,
      surfacePacketId: surfaceResult.packet_id ?? null,
      surfaceStatusPacketId: surfaceResult.status_packet_id ?? null,
      surfaceResponseType: surfaceResult.response_type ?? 'executive_surface',
    };
  }

  const navPreview = tryParseCosNavigatorTrigger(trimmed);
  if (navPreview) {
    if (navPreview.body?.trim()) {
      const bTrim = navPreview.body.trim();
      const bLine =
        extractQueryCommandLine(normalizeSlackUserPayload(bTrim)) ??
        normalizeSlackUserPayload(bTrim);
      const qNav = await handleQueryOnlyCommands(bLine);
      if (qNav != null) return { responder: 'query', queryRaw: qNav };

      const bodyPlannerNorm = normalizePlannerInputForRoute(bTrim);
      const bodyPlannerLock = analyzePlannerResponderLock(bodyPlannerNorm);
      if (bodyPlannerLock.type === 'hit' || bodyPlannerLock.type === 'miss') {
        return { responder: 'planner' };
      }
    }
    return { responder: 'navigator' };
  }

  if (isCouncilCommand(trimmed)) {
    const cp = parseCouncilCommand(trimmed);
    if (cp?.question && isStructuredQueryOnlyLine(cp.question)) {
      const qLine =
        extractQueryCommandLine(normalizeSlackUserPayload(String(cp.question).trim())) ??
        normalizeSlackUserPayload(String(cp.question).trim());
      const qCouncil = await handleQueryOnlyCommands(qLine);
      if (qCouncil != null) return { responder: 'query', queryRaw: qCouncil };
    }
    return { responder: 'council' };
  }

  return { responder: 'dialog' };
}

/**
 * @param {{
 *   trimmed: string,
 *   routerCtx: { raw_text: unknown, normalized_text: string },
 *   metadata: Record<string, unknown>,
 *   channelContext: string | null,
 *   projectContext: string | null,
 *   envKey: string,
 *   runPlannerHardLockedBranch: (args: object) => Promise<string>,
 *   runLegacySingleFlow: (trimmed: string, channelContext: string | null, metadata: object) => Promise<string>,
 *   makeId: (prefix: string) => string,
 *   callText: (args: { instructions: string, input: string }) => Promise<string>,
 *   callJSON: (args: object) => Promise<unknown>,
 * }} ctx
 * @returns {Promise<string>}
 */
export async function runInboundAiRouter(ctx) {
  const {
    trimmed,
    routerCtx,
    metadata,
    channelContext,
    projectContext,
    envKey,
    runPlannerHardLockedBranch,
    runLegacySingleFlow,
    makeId,
    callText,
    callJSON,
  } = ctx;

  const queryFirst = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
  if (queryFirst != null) return queryFirst;

  const threadKey = buildSlackThreadKey(metadata);

  const navTrig = tryParseCosNavigatorTrigger(trimmed);
  if (navTrig) {
    logRouterEvent('navigator_route_entered', {
      trigger: navTrig.trigger,
      has_body: Boolean(navTrig.body?.trim()),
    });
    const navBodyStripped = navTrig.body?.trim() || '';
    /** `COS 계획진행 PLN-…` 처럼 내비 트리거 + 조회 한 줄 → LLM 내비보다 조회 우선 */
    if (navBodyStripped) {
      const fromNavBody = await tryFinalizeSlackQueryRoute(
        normalizeSlackUserPayload(navBodyStripped),
        routerCtx
      );
      if (fromNavBody != null) {
        logRouterEvent('navigator_route_deferred', { reason: 'body_is_structured_query' });
        return fromNavBody;
      }

      const bodyPlannerNorm = normalizePlannerInputForRoute(navBodyStripped);
      const bodyPlannerLock = analyzePlannerResponderLock(bodyPlannerNorm);
      if (bodyPlannerLock.type === 'hit' || bodyPlannerLock.type === 'miss') {
        logRouterEvent('navigator_route_deferred', { reason: 'body_is_planner_intake' });
        logRouterEvent('router_responder_selected', {
          responder: 'planner',
          command_name: '계획등록',
          planner_match: true,
        });
        logRouterEvent('router_responder_locked', { responder: 'planner', via: 'cos_secretary_body' });
        return runPlannerHardLockedBranch({
          routerCtx,
          plannerNorm: bodyPlannerNorm,
          plannerLock: bodyPlannerLock,
          metadata,
          channelContext,
          projectContext,
          envKey,
        });
      }
    }
    if (!navBodyStripped) {
      const intro = getCosNavigatorEmptyIntro();
      logRouterEvent('navigator_route_returned', { response_type: 'navigator_intro' });
      logCosToolRegistryBind({
        tool_id: 'navigator',
        pipeline: 'ai_navigator',
        response_type: 'navigator_intro',
      });
      return finalizeSlackResponse({
        responder: 'navigator',
        text: intro,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'COS_내비게이터',
        council_blocked: true,
        response_type: 'navigator_intro',
      });
    }
    const priorNav = getConversationTranscript(threadKey);
    try {
      const navBody =
        priorNav.trim()
          ? `${priorNav}\n\n---\n\n(이번 메시지 본문)\n${navTrig.body}`
          : navTrig.body;
      const navText = await runCosNavigator({
        callJSON,
        userText: navBody,
        channelContext,
      });
      logRouterEvent('navigator_route_returned', { response_type: 'navigator_guidance' });
      logCosToolRegistryBind({
        tool_id: 'navigator',
        pipeline: 'ai_navigator',
        response_type: 'navigator_guidance',
      });
      return finalizeSlackResponse({
        responder: 'navigator',
        text: navText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'COS_내비게이터',
        council_blocked: true,
        response_type: 'navigator_guidance',
      });
    } catch (e) {
      const err = e instanceof Error ? e : new Error(String(e));
      console.error('NAVIGATOR_ERROR:', err);
      const errText = [
        '[COS 내비게이터] 잠시 응답을 만들지 못했습니다.',
        `- 사유: ${err.message || String(err)}`,
        '',
        '그래도 진행하려면:',
        '- `협의모드: <질문>` — 여러 관점으로 깊게 논의',
        '- `계획등록: <목표>` — 실행 단위 계획을 문서화',
      ].join('\n');
      logRouterEvent('navigator_route_returned', { response_type: 'navigator_error' });
      logCosToolRegistryBind({
        tool_id: 'navigator',
        pipeline: 'ai_navigator',
        response_type: 'navigator_error',
      });
      return finalizeSlackResponse({
        responder: 'navigator',
        text: errText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'COS_내비게이터',
        council_blocked: true,
        response_type: 'navigator_error',
      });
    }
  }

  const councilParsed = parseCouncilCommand(trimmed);
  const routedInput = councilParsed?.question || trimmed;
  const route = await routeTask(routedInput, channelContext);
  const explicitCouncil = isCouncilCommand(trimmed);

  const probeCouncil = normalizePlannerInputForRoute(trimmed);
  const latePlanner = analyzePlannerResponderLock(probeCouncil);
  if (latePlanner.type === 'miss' || latePlanner.type === 'hit') {
    logRouterEvent('council_or_dialog_blocked', {
      reason: 'planner_hard_lock',
      planner_gate: latePlanner.type,
      council_blocked: true,
    });
    logRouterEvent('router_responder_locked', { responder: 'planner', via: 'pre_ai_firewall' });
    return runPlannerHardLockedBranch({
      routerCtx,
      plannerNorm: probeCouncil,
      plannerLock: latePlanner,
      metadata,
      channelContext,
      projectContext,
      envKey,
    });
  }

  if (explicitCouncil) {
    if (councilParsed?.question && isStructuredQueryOnlyLine(councilParsed.question)) {
      const qLine =
        extractQueryCommandLine(normalizeSlackUserPayload(String(councilParsed.question).trim())) ??
        normalizeSlackUserPayload(String(councilParsed.question).trim());
      const queryViaCouncil = await tryFinalizeSlackQueryRoute(qLine, routerCtx);
      if (queryViaCouncil != null) {
        logRouterEvent('council_route_deferred', { reason: 'question_is_structured_query_only' });
        return queryViaCouncil;
      }
    }
    logRouterEvent('router_responder_selected', {
      responder: 'council',
      command_name: 'council_explicit',
    });
    logRouterEvent('router_responder_locked', { responder: 'council' });

    logRouterEvent('council_route_entered', {
      raw_text: String(routerCtx.raw_text).slice(0, 400),
      normalized_text: trimmed.slice(0, 400),
      responder: 'council',
    });

    const councilFin = (text, response_type, footer_blocked = false) =>
      finalizeSlackResponse({
        responder: 'council',
        text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'council_explicit',
        council_blocked: false,
        response_type,
        footer_blocked,
      });

    const priorCouncil = getConversationTranscript(threadKey);

    try {
      const council = await runCouncilMode({
        userText: routedInput,
        route,
        channelContext,
        command: trimmed,
        conversationContext: priorCouncil || '',
      });

      const decisionState = deriveDecisionState(route, council.primaryLike, council.riskLike);
      let approvalItem = null;
      if (decisionState.decisionNeeded) {
        approvalItem = await upsertApprovalRecord({
          userText: council.meta?.question || trimmed,
          metadata,
          channelContext,
          route,
          primary: council.primaryLike,
          risk: council.riskLike,
        });
      }

      const finalText = approvalItem
        ? `${council.text}\n\n승인 대기열\n- 상태: pending\n- 승인 ID: ${approvalItem.id}`
        : council.text;

      await appendJsonRecord(INTERACTIONS_FILE, {
        id: makeId('INT'),
        created_at: new Date().toISOString(),
        user_text: council.meta?.question || trimmed,
        source: metadata,
        channel_context: channelContext,
        route,
        primary: council.primaryLike,
        risk: council.riskLike,
        approval_id: approvalItem?.id || null,
        decision_needed: decisionState.decisionNeeded,
        orchestration_mode: council.meta?.matrix?.used ? 'matrix_cell' : 'council',
        selected_personas: council.meta?.selectedPersonas || [],
        matrix_reasons: council.meta?.matrix?.reasons || [],
        institutional_memory_hints: council.meta?.institutional_memory_hints || [],
      });

      let out;
      /** @type {string} */
      let councilResponseType = 'council';
      if (inferWorkCandidate(trimmed)) {
        if (shouldSuppressWorkCandidateFooter(trimmed)) {
          logRouterEvent('footer_blocked', { reason: 'suppress_planner_related', responder: 'council' });
          logPlannerFc('planner_fallback_blocked', {
            planner_fallback_blocked: true,
            council_footer_suppressed: true,
          });
          councilResponseType = 'council_footer_suppressed';
          out = councilFin(finalText, councilResponseType, true);
        } else {
          councilResponseType = 'council_with_work_hint';
          out = councilFin(
            `${finalText}\n\n실행 작업 후보로 보입니다. 필요하면 '업무등록: ${routedInput.slice(0, 80)}' 형태로 등록하세요.`,
            councilResponseType,
            false
          );
        }
      } else {
        out = councilFin(finalText, councilResponseType, false);
      }
      logCosToolRegistryBind({
        tool_id: 'council',
        pipeline: 'ai_council',
        response_type: councilResponseType,
      });
      return out;
    } catch (error) {
      console.error('COUNCIL_MODE_ERROR -> fallback single flow:', error);
      const legacyText = await runLegacySingleFlow(trimmed, channelContext, metadata);
      return finalizeSlackResponse({
        responder: 'single',
        text: legacyText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        council_blocked: true,
        response_type: 'legacy_single_after_council_error',
      });
    }
  }

  logRouterEvent('router_responder_selected', { responder: 'dialog', command_name: 'cos_natural' });
  logRouterEvent('router_responder_locked', { responder: 'dialog' });
  logRouterEvent('dialog_route_entered', {
    raw_text: String(routerCtx.raw_text).slice(0, 400),
    normalized_text: trimmed.slice(0, 400),
  });

  const priorDialog = getConversationTranscript(threadKey);

  try {
    const dialogText = await runCosNaturalPartner({
      callText,
      userText: trimmed,
      channelContext,
      route,
      priorTranscript: priorDialog || '',
    });

    await appendJsonRecord(INTERACTIONS_FILE, {
      id: makeId('INT'),
      created_at: new Date().toISOString(),
      user_text: trimmed,
      source: metadata,
      channel_context: channelContext,
      route,
      orchestration_mode: 'cos_natural_dialog',
      approval_id: null,
      decision_needed: false,
    });

    const hintPlanId = pickThreadPlanFollowUpHint({
      priorTranscript: priorDialog,
      currentUserText: trimmed,
    });
    const dialogWithHint = hintPlanId
      ? `${dialogText}\n\n${formatThreadPlanFollowUpFooter(hintPlanId)}`
      : dialogText;
    if (hintPlanId) {
      logRouterEvent('dialog_thread_plan_hint', { plan_id: hintPlanId });
    }

    const out = finalizeSlackResponse({
      responder: 'dialog',
      text: dialogWithHint,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'COS_대화',
      council_blocked: true,
      response_type: hintPlanId ? 'cos_natural_dialog_thread_plan_hint' : 'cos_natural_dialog',
    });
    if (shouldOfferWorkspaceQueueButtons(trimmed)) {
      logRouterEvent('dialog_queue_buttons_attached', { normalized_len: trimmed.length });
      return {
        text: out,
        blocks: buildDialogQueueConfirmationBlocks(trimmed),
      };
    }
    return out;
  } catch (error) {
    console.error('COS_NATURAL_DIALOG_ERROR -> fallback single flow:', error);
    const legacyText = await runLegacySingleFlow(trimmed, channelContext, metadata);
    return finalizeSlackResponse({
      responder: 'single',
      text: legacyText,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      council_blocked: true,
      response_type: 'legacy_single_after_dialog_error',
    });
  }
}
