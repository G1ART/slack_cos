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
import { classifySurfaceIntent, isStartProjectKickoffInput } from './surfaceIntentClassifier.js';
import { resolveCleanStartProjectKickoff } from './startProjectKickoffDoor.js';
import {
  tryStartProjectLockConfirmedResponse,
  tryStartProjectRefineResponse,
  tryProjectIntakeExecutiveContinue,
  isStartProjectLockConfirmedContext,
  isStartProjectRefineFlowContext,
} from './startProjectLockConfirmed.js';
import {
  tryFinalizeProjectIntakeCancel,
  buildProjectIntakeCouncilDeferSurface,
  isActiveProjectIntake,
  hasOpenExecutionOwnership,
} from './projectIntakeSession.js';
import { tryFinalizeProjectSpecBuildThread } from './projectSpecSession.js';
import { tryFinalizeExecutionSpineTurn } from './executionSpineRouter.js';
import {
  interpretTask,
  isResearchSurfaceCandidate,
  isFreshnessRequired,
  openPlaybook,
  getActivePlaybook,
  checkPlaybookExecutionPromotion,
  linkPlaybookToExecution,
} from './dynamicPlaybook.js';
import { createExecutionPacket, createExecutionRun, getExecutionRunByThread } from './executionRun.js';
import { transitionProjectIntakeStage, getProjectIntakeSession } from './projectIntakeSession.js';
import { runRepresentativeResearch } from './representativeResearchSurface.js';
import { renderExecutionRunningPacket } from './executionSpineRouter.js';
import { ensureExecutionRunDispatched } from './executionDispatchLifecycle.js';
import { resolveProjectSpaceForThread, detectProjectIntent, renderProjectResolutionSurface } from './projectSpaceResolver.js';
import { bootstrapProjectSpace, renderBootstrapPlanForSlack } from './projectSpaceBootstrap.js';
import { linkRunToProjectSpace, linkThreadToProjectSpace } from './projectSpaceRegistry.js';
import { detectDeliverableIntent, buildDeliverableBundlePrompt, bundleTypeLabel } from './deliverableBundleRouter.js';
import { detectContinuationIntent, buildContextSynthesisPrompt, shouldActivateContextSynthesis } from './contextSynthesis.js';
import { deriveAnchorCluster, detectTopicDrift, buildAnchorReminder, logDriftEvent } from './topicAnchorGuard.js';
import { getOrCreateLedger, getResolvedSlots, getUnresolvedSlots, resolveSlotsBulk, isSlotResolved, tryAutoResolveSlots } from './founderSlotLedger.js';
import { getMergedDocumentText, hasDocumentContext } from './slackDocumentContext.js';
import { classifyFounderRoutingLock } from './inboundFounderRoutingLock.js';
// GREP_FOUNDERRLOCK_IMPORT
import { tryFinalizeInboundFounderRoutingLock } from './founderRoutingLockFinalize.js';
import { formatFounderApprovalAppendix } from './founderSurfaceGuard.js';

/**
 * @typedef {{ trimmed: string, planner_lock: { type: string }, query_line_resolved: string }} RouterSyncLike
 */

/**
 * Fixture·회귀용 축약 분류 (LLM 없음). 도움말 다음 **`start_project` 실행 승인(충분성)** → **`start_project` 정제(refine)** → **Front Door** → 조회·플래너 락·lineage…
 * `runInboundCommandRouter` 와 맞춘다. 구조화 명령(`runInboundStructuredCommands`)은 시뮬하지 않는다.
 * @param {RouterSyncLike} snap `buildRouterSyncSnapshot` 결과와 동일 필드
 * @param {Record<string, unknown>} [previewMetadata] 스레드 푸시백 픽스처용 슬랙 메타(채널·thread_ts 등)
 * @returns {Promise<{ responder: 'help'|'query'|'planner'|'executive_surface'|'execution_spine'|'navigator'|'council'|'research_surface'|'partner_surface'|'lineage_transport', queryRaw?: string, surfaceRaw?: string, surfacePacketId?: string | null, surfaceStatusPacketId?: string | null, surfaceResponseType?: string, lineageText?: string, lineageResponseType?: string }>}
 */
export async function classifyInboundResponderPreview(snap, previewMetadata = {}) {
  const trimmed = snap.trimmed;
  const meta =
    previewMetadata && typeof previewMetadata === 'object'
      ? { ...(snap.preview_metadata && typeof snap.preview_metadata === 'object' ? snap.preview_metadata : {}), ...previewMetadata }
      : {};

  if (trimmed === '도움말' || trimmed === '운영도움말') {
    return { responder: 'help' };
  }

  const founderLockPrev = classifyFounderRoutingLock(trimmed);
  if (founderLockPrev?.kind === 'version') {
    return { responder: 'runtime_meta_surface', surfaceResponseType: 'routing_lock_version' };
  }
  if (founderLockPrev?.kind === 'meta_debug') {
    return { responder: 'meta_debug_surface', surfaceResponseType: 'routing_lock_meta_debug' };
  }
  if (founderLockPrev?.kind === 'kickoff_test') {
    return { responder: 'executive_surface', surfaceResponseType: 'start_project' };
  }

  const intakeCancelPrev = tryFinalizeProjectIntakeCancel(trimmed, meta);
  if (intakeCancelPrev != null) {
    return {
      responder: 'executive_surface',
      surfaceRaw: intakeCancelPrev.text,
      surfacePacketId: null,
      surfaceStatusPacketId: null,
      surfaceResponseType: intakeCancelPrev.response_type,
    };
  }

  if (isActiveProjectIntake(meta)) {
    const specPr = await tryFinalizeProjectSpecBuildThread({
      trimmed,
      metadata: meta,
      routerCtx: { raw_text: trimmed, normalized_text: trimmed },
      previewOnly: true,
    });
    if (specPr?.kind === 'council_deferred') {
      return {
        responder: 'executive_surface',
        surfaceRaw: buildProjectIntakeCouncilDeferSurface(),
        surfacePacketId: null,
        surfaceStatusPacketId: null,
        surfaceResponseType: 'project_intake_council_deferred',
      };
    }
    if (specPr && specPr.text) {
      return {
        responder: 'executive_surface',
        surfaceRaw: specPr.text,
        surfacePacketId: null,
        surfaceStatusPacketId: null,
        surfaceResponseType: specPr.response_type ?? 'project_spec_session',
      };
    }
  }

  const lockPrev = await tryStartProjectLockConfirmedResponse(trimmed, meta);
  if (lockPrev != null) {
    return {
      responder: 'executive_surface',
      surfaceRaw: lockPrev.text,
      surfacePacketId: lockPrev.packet_id ?? null,
      surfaceStatusPacketId: null,
      surfaceResponseType: lockPrev.response_type ?? 'start_project_confirmed',
    };
  }

  const refinePrev = await tryStartProjectRefineResponse(trimmed, meta);
  if (refinePrev != null) {
    return {
      responder: 'executive_surface',
      surfaceRaw: refinePrev.text,
      surfacePacketId: refinePrev.packet_id ?? null,
      surfaceStatusPacketId: null,
      surfaceResponseType: refinePrev.response_type ?? 'start_project_refine',
    };
  }

  const kickDoor = resolveCleanStartProjectKickoff(trimmed, meta);
  if (kickDoor) {
    const surfaceEarly = await tryExecutiveSurfaceResponse(kickDoor.line, meta, {
      startProjectToneAck: kickDoor.toneAck,
    });
    if (surfaceEarly?.response_type === 'start_project') {
      return {
        responder: 'executive_surface',
        surfaceRaw: surfaceEarly.text,
        surfacePacketId: surfaceEarly.packet_id ?? null,
        surfaceStatusPacketId: surfaceEarly.status_packet_id ?? null,
        surfaceResponseType: surfaceEarly.response_type ?? 'start_project',
      };
    }
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

  if (isResearchSurfaceCandidate(trimmed)) {
    return { responder: 'research_surface' };
  }
  return { responder: 'partner_surface' };
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

  const threadKey = buildSlackThreadKey(metadata);

  // GREP_FOUNDERRLOCK_CALLSITE — GREP_FOUNDERRLOCK_VERSION_RETURN | META_RETURN | KICKOFF_RETURN 는 founderRoutingLockFinalize.js
  const founderLockHit = await tryFinalizeInboundFounderRoutingLock({ trimmed, routerCtx, metadata });
  if (founderLockHit != null) {
    return founderLockHit;
  }

  const queryFirst = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
  if (queryFirst != null) return queryFirst;

  const intakeCancelAi = tryFinalizeProjectIntakeCancel(trimmed, metadata);
  if (intakeCancelAi != null) {
    logRouterEvent('router_responder_selected', {
      responder: 'executive_surface',
      command_name: intakeCancelAi.response_type,
      via: 'ai_head_project_intake_cancel',
    });
    logRouterEvent('router_responder_locked', { responder: 'executive_surface', via: 'ai_head_project_intake_cancel' });
    return finalizeSlackResponse({
      responder: 'executive_surface',
      text: intakeCancelAi.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: intakeCancelAi.response_type,
      council_blocked: true,
      response_type: intakeCancelAi.response_type,
    });
  }

  // Execution spine guard — post-lock threads never fall through to council/dialog
  if (hasOpenExecutionOwnership(metadata)) {
    const execResult = tryFinalizeExecutionSpineTurn({ trimmed, metadata });
    if (execResult && execResult !== 'council_defer' && execResult.text) {
      logRouterEvent('router_responder_selected', {
        responder: 'execution_spine',
        command_name: execResult.response_type,
        via: 'ai_router_execution_spine_guard',
      });
      logRouterEvent('router_responder_locked', { responder: 'execution_spine', via: 'ai_router_execution_spine_guard' });
      return finalizeSlackResponse({
        responder: 'execution_spine',
        text: execResult.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: execResult.response_type,
        council_blocked: true,
        response_type: execResult.response_type,
        packet_id: execResult.packet_id || null,
      });
    }
    return finalizeSlackResponse({
      responder: 'execution_spine',
      text: buildProjectIntakeCouncilDeferSurface(metadata),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'execution_spine_council_block',
      council_blocked: true,
      response_type: 'execution_spine_council_block',
    });
  }

  if (!isCouncilCommand(trimmed)) {
    const intakeEarly = await tryProjectIntakeExecutiveContinue(trimmed, metadata);
    if (intakeEarly != null) {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: intakeEarly.response_type,
        via: 'ai_head_project_intake_sticky',
      });
      logRouterEvent('router_responder_locked', {
        responder: 'executive_surface',
        via: 'ai_head_project_intake_sticky',
      });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: intakeEarly.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: intakeEarly.response_type,
        council_blocked: true,
        response_type: intakeEarly.response_type,
      });
    }
  }

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

      const navLock = await tryStartProjectLockConfirmedResponse(navBodyStripped, metadata);
      if (navLock != null) {
        logRouterEvent('navigator_route_deferred', { reason: 'body_is_start_project_lock_confirmed' });
        return finalizeSlackResponse({
          responder: 'executive_surface',
          text: navLock.text,
          raw_text: routerCtx.raw_text,
          normalized_text: routerCtx.normalized_text,
          command_name: 'start_project_confirmed',
          council_blocked: true,
          response_type: navLock.response_type,
        });
      }

      const navRefine = await tryStartProjectRefineResponse(navBodyStripped, metadata);
      if (navRefine != null) {
        logRouterEvent('navigator_route_deferred', { reason: 'body_is_start_project_refine' });
        return finalizeSlackResponse({
          responder: 'executive_surface',
          text: navRefine.text,
          raw_text: routerCtx.raw_text,
          normalized_text: routerCtx.normalized_text,
          command_name: 'start_project_refine',
          council_blocked: true,
          response_type: navRefine.response_type,
        });
      }

      const navIntake = await tryProjectIntakeExecutiveContinue(navBodyStripped, metadata);
      if (navIntake != null) {
        logRouterEvent('navigator_route_deferred', { reason: 'project_intake_sticky_nav_body' });
        return finalizeSlackResponse({
          responder: 'executive_surface',
          text: navIntake.text,
          raw_text: routerCtx.raw_text,
          normalized_text: routerCtx.normalized_text,
          command_name: navIntake.response_type,
          council_blocked: true,
          response_type: navIntake.response_type,
        });
      }

      const navKick = resolveCleanStartProjectKickoff(navBodyStripped, metadata);
      if (navKick) {
        const se = await tryExecutiveSurfaceResponse(navKick.line, metadata, {
          startProjectToneAck: navKick.toneAck,
        });
        if (se?.response_type === 'start_project') {
          logRouterEvent('navigator_route_deferred', { reason: 'body_is_start_project_kickoff' });
          return finalizeSlackResponse({
            responder: 'executive_surface',
            text: se.text,
            raw_text: routerCtx.raw_text,
            normalized_text: routerCtx.normalized_text,
            command_name: 'start_project',
            council_blocked: true,
            response_type: 'start_project',
          });
        }
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

  if (isActiveProjectIntake(metadata)) {
    const specFinAi = await tryFinalizeProjectSpecBuildThread({
      trimmed,
      metadata,
      routerCtx,
    });
    if (specFinAi?.kind === 'council_deferred') {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: 'project_intake_council_deferred',
        via: 'ai_tail_project_spec_defer_council',
      });
      logRouterEvent('router_responder_locked', {
        responder: 'executive_surface',
        via: 'ai_tail_project_spec_defer_council',
      });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: buildProjectIntakeCouncilDeferSurface(),
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'project_intake_council_deferred',
        council_blocked: true,
        response_type: 'project_intake_council_deferred',
      });
    }
    if (specFinAi && specFinAi.text) {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: specFinAi.response_type || 'project_spec_session',
        via: 'ai_tail_project_spec_build_thread',
      });
      logRouterEvent('router_responder_locked', {
        responder: 'executive_surface',
        via: 'ai_tail_project_spec_build_thread',
      });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: specFinAi.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: specFinAi.response_type || 'project_spec_session',
        council_blocked: true,
        response_type: specFinAi.response_type || 'project_spec_session',
      });
    }
  }

  const aiLock = await tryStartProjectLockConfirmedResponse(trimmed, metadata);
  if (aiLock != null) {
    logRouterEvent('router_responder_selected', {
      responder: 'executive_surface',
      command_name: 'start_project_confirmed',
    });
    logRouterEvent('router_responder_locked', {
      responder: 'executive_surface',
      via: 'ai_tail_start_project_lock_confirmed',
    });
    return finalizeSlackResponse({
      responder: 'executive_surface',
      text: aiLock.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'start_project_confirmed',
      council_blocked: true,
      response_type: aiLock.response_type,
    });
  }

  const aiRefine = await tryStartProjectRefineResponse(trimmed, metadata);
  if (aiRefine != null) {
    logRouterEvent('router_responder_selected', {
      responder: 'executive_surface',
      command_name: 'start_project_refine',
    });
    logRouterEvent('router_responder_locked', {
      responder: 'executive_surface',
      via: 'ai_tail_start_project_refine',
    });
    return finalizeSlackResponse({
      responder: 'executive_surface',
      text: aiRefine.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'start_project_refine',
      council_blocked: true,
      response_type: aiRefine.response_type,
    });
  }

  const aiKickDoor = resolveCleanStartProjectKickoff(trimmed, metadata);
  if (aiKickDoor) {
    const surfaceEarly = await tryExecutiveSurfaceResponse(aiKickDoor.line, metadata, {
      startProjectToneAck: aiKickDoor.toneAck,
    });
    if (surfaceEarly?.response_type === 'start_project') {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: 'start_project',
      });
      logRouterEvent('router_responder_locked', {
        responder: 'executive_surface',
        via: 'ai_tail_clean_start_project_front_door',
      });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: surfaceEarly.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'start_project',
        council_blocked: true,
        response_type: 'start_project',
      });
    }
  }

  const routedInput = councilParsed?.question || trimmed;
  const route = await routeTask(routedInput, channelContext);

  if (explicitCouncil) {
    if (isActiveProjectIntake(metadata)) {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: 'project_intake_council_deferred',
        via: 'ai_head_intake_blocks_council',
      });
      logRouterEvent('router_responder_locked', { responder: 'executive_surface', via: 'ai_head_intake_blocks_council' });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: buildProjectIntakeCouncilDeferSurface(),
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'project_intake_council_deferred',
        council_blocked: true,
        response_type: 'project_intake_council_deferred',
      });
    }
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
        source_formatter: 'runCouncilMode:synthesizeCouncil',
        slack_route_label: metadata.slack_route_label ?? null,
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
      const kickSuppressApproval =
        isStartProjectKickoffInput(trimmed) ||
        isStartProjectKickoffInput(routedInput) ||
        isStartProjectLockConfirmedContext(trimmed, metadata) ||
        isStartProjectRefineFlowContext(trimmed, metadata) ||
        Boolean(resolveCleanStartProjectKickoff(trimmed, metadata)) ||
        Boolean(councilParsed?.question && isStartProjectKickoffInput(councilParsed.question)) ||
        Boolean(
          councilParsed?.question && isStartProjectRefineFlowContext(String(councilParsed.question).trim(), metadata),
        );

      let approvalItem = null;
      if (decisionState.decisionNeeded && !kickSuppressApproval) {
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
        ? `${council.text}${formatFounderApprovalAppendix(approvalItem.id)}`
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
        logRouterEvent('work_candidate_detected_internal', { responder: 'council' });
        councilResponseType = 'council_work_candidate_internal';
      }
      out = councilFin(finalText, councilResponseType, true);
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
        source_formatter: 'runLegacySingleFlow:after_council_error',
        slack_route_label: metadata.slack_route_label ?? null,
      });
    }
  }

  // ── Dynamic Playbook Interpretation + Research / Partner Surface ──
  const hypothesis = interpretTask(trimmed);
  const existingPlaybook = getActivePlaybook(threadKey);
  const taskKind = existingPlaybook?.kind || hypothesis.kind;
  const playbookForThread = existingPlaybook || (
    hypothesis.should_open_playbook
      ? openPlaybook(threadKey, hypothesis, trimmed)
      : null
  );

  const existingRun = getExecutionRunByThread(threadKey);
  const existingSess = getProjectIntakeSession(metadata);

  logRouterEvent('dynamic_task_interpreted', {
    task_kind: taskKind,
    mode: hypothesis.mode,
    is_research: hypothesis.is_research,
    freshness_required: hypothesis.freshness_required,
    should_open_playbook: hypothesis.should_open_playbook,
    should_open_execution: hypothesis.should_open_execution,
    confidence: hypothesis.confidence,
    playbook_id: playbookForThread?.playbook_id || null,
    run_id: existingRun?.run_id || null,
    packet_id: existingRun?.packet_id || null,
    council_allowed: false,
    council_exposed: false,
    execution_ownership: Boolean(existingRun),
  });

  // Playbook → Execution promotion: "진행해줘" in active playbook thread
  const promotion = checkPlaybookExecutionPromotion(trimmed, threadKey);
  if (promotion.should_promote && promotion.playbook && !existingRun) {
    const pb = promotion.playbook;
    const packet = createExecutionPacket({
      thread_key: threadKey,
      goal_line: pb.task_summary,
      locked_scope_summary: pb.task_summary,
      includes: [],
      excludes: [],
      deferred_items: [],
      approval_rules: [],
      session_id: '',
      requested_by: String(metadata?.user || ''),
    });
    const run = createExecutionRun({
      packet,
      metadata,
      playbook_id: pb.playbook_id,
      task_kind: pb.kind,
    });
    linkPlaybookToExecution(pb.playbook_id, { packet_id: packet.packet_id, run_id: run.run_id });

    const resolved = resolveProjectSpaceForThread({ threadKey, text: trimmed, metadata });
    if (resolved.resolved && resolved.project_id) {
      linkRunToProjectSpace(resolved.project_id, run.run_id);
      run.project_id = resolved.project_id;
    }

    ensureExecutionRunDispatched(run, metadata);

    logRouterEvent('router_responder_selected', {
      responder: 'execution_spine',
      command_name: 'playbook_execution_promotion',
      via: 'dynamic_playbook_proceed',
      playbook_id: pb.playbook_id,
      run_id: run.run_id,
      packet_id: packet.packet_id,
      project_id: resolved.project_id || null,
    });
    logRouterEvent('router_responder_locked', { responder: 'execution_spine', via: 'playbook_execution_promotion' });

    return finalizeSlackResponse({
      responder: 'execution_spine',
      text: renderExecutionRunningPacket(run),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'playbook_execution_promotion',
      council_blocked: true,
      response_type: 'execution_running_surface',
      packet_id: packet.packet_id,
    });
  }

  // Research Surface — broad natural-language research questions
  if (hypothesis.is_research) {
    logRouterEvent('router_responder_selected', { responder: 'research_surface', command_name: 'research', task_kind: taskKind });
    logRouterEvent('router_responder_locked', { responder: 'research_surface' });

    const priorResearch = getConversationTranscript(threadKey);
    try {
      const researchText = await runRepresentativeResearch({
        callText,
        userText: trimmed,
        channelContext,
        freshness_required: hypothesis.freshness_required,
        task_kind: taskKind,
        playbook_id: playbookForThread?.playbook_id || null,
        priorTranscript: priorResearch || '',
      });

      await appendJsonRecord(INTERACTIONS_FILE, {
        id: makeId('INT'),
        created_at: new Date().toISOString(),
        user_text: trimmed,
        source: metadata,
        channel_context: channelContext,
        route,
        orchestration_mode: 'research_surface',
        task_kind: taskKind,
        playbook_id: playbookForThread?.playbook_id || null,
        freshness_required: hypothesis.freshness_required,
        approval_id: null,
        decision_needed: false,
      });

      return finalizeSlackResponse({
        responder: 'research_surface',
        text: researchText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'research',
        council_blocked: true,
        response_type: 'research_surface',
      });
    } catch (error) {
      console.error('RESEARCH_SURFACE_ERROR -> fallback partner:', error);
    }
  }

  // Project Space routing — new or existing reference
  const projectIntent = detectProjectIntent(trimmed);
  if (projectIntent === 'new_project') {
    const labelMatch = trimmed.match(/(?:프로젝트|앱|서비스)\s*(?:이름|명|:)?\s*[「"']?([^"'」\n]{2,30})/);
    const label = labelMatch?.[1]?.trim() || trimmed.slice(0, 40);
    const { space, plan } = bootstrapProjectSpace({ label, threadKey, metadata });
    linkThreadToProjectSpace(space.project_id, threadKey);

    logRouterEvent('router_responder_selected', { responder: 'project_bootstrap', project_id: space.project_id });
    return finalizeSlackResponse({
      responder: 'partner_surface',
      text: renderBootstrapPlanForSlack(plan),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'project_bootstrap',
      council_blocked: true,
      response_type: 'project_bootstrap',
    });
  }

  if (projectIntent === 'existing_reference') {
    return handleExistingProjectReference({ threadKey, trimmed, metadata, routerCtx });
  }

  // ---------- Founder-grade context enrichment ----------
  const projectSpace = resolveProjectSpaceForThread({ threadKey, text: trimmed, metadata })?.space || null;
  const ledger = getOrCreateLedger(threadKey, projectSpace?.project_id);

  const autoResolved = tryAutoResolveSlots(threadKey, trimmed, {
    hasDocument: hasDocumentContext(threadKey),
    source: 'founder_inbound',
  });
  if (Object.keys(autoResolved).length > 0) {
    logRouterEvent('slots_auto_resolved', { count: Object.keys(autoResolved).length, slots: Object.keys(autoResolved) });
  }

  const resolvedSlots = getResolvedSlots(threadKey);
  const unresolvedSlots = getUnresolvedSlots(threadKey);
  const documentText = getMergedDocumentText(threadKey);
  const priorDialog = getConversationTranscript(threadKey);

  // ---------- Deliverable bundle detection ----------
  const deliverableIntent = detectDeliverableIntent(trimmed);
  if (deliverableIntent.triggered) {
    logRouterEvent('deliverable_bundle_triggered', {
      bundleType: deliverableIntent.bundleType,
      resolved_slot_count: Object.keys(resolvedSlots).length,
    });

    const bundlePrompt = buildDeliverableBundlePrompt({
      bundleType: deliverableIntent.bundleType,
      resolvedSlots,
      documentContext: documentText,
      recentTranscript: priorDialog,
    });

    try {
      const bundleText = await runCosNaturalPartner({
        callText,
        userText: bundlePrompt,
        channelContext,
        route,
        priorTranscript: priorDialog || '',
      });

      const anchorCluster = deriveAnchorCluster({
        projectSpace,
        slotLedger: ledger,
        recentTranscript: priorDialog,
        playbookKind: taskKind,
      });
      const drift = detectTopicDrift({ draftText: bundleText, anchorCluster, currentRequestText: trimmed });
      if (drift.drifted) {
        logDriftEvent(drift, { threadKey, phase: 'deliverable_bundle' });
        const reminder = buildAnchorReminder(anchorCluster, drift);
        const retryText = await runCosNaturalPartner({
          callText,
          userText: `${bundlePrompt}\n\n${reminder}`,
          channelContext,
          route,
          priorTranscript: priorDialog || '',
        });
        return finalizeSlackResponse({
          responder: 'partner_surface',
          text: retryText,
          raw_text: routerCtx.raw_text,
          normalized_text: routerCtx.normalized_text,
          command_name: 'deliverable_bundle',
          council_blocked: true,
          response_type: `deliverable_${deliverableIntent.bundleType}`,
        });
      }

      return finalizeSlackResponse({
        responder: 'partner_surface',
        text: bundleText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'deliverable_bundle',
        council_blocked: true,
        response_type: `deliverable_${deliverableIntent.bundleType}`,
      });
    } catch (error) {
      console.error('DELIVERABLE_BUNDLE_ERROR:', error);
    }
  }

  // ---------- Context synthesis / continuation detection ----------
  const synthCheck = shouldActivateContextSynthesis({
    text: trimmed,
    hasDocumentContext: hasDocumentContext(threadKey),
    resolvedSlotCount: Object.keys(resolvedSlots).length,
  });
  if (synthCheck.activate) {
    logRouterEvent('context_synthesis_activated', { intent: synthCheck.intent, threadKey });

    const synthPrompt = buildContextSynthesisPrompt({
      intent: synthCheck.intent,
      resolvedSlots,
      documentContext: documentText,
      recentTranscript: priorDialog,
      currentText: trimmed,
    });

    try {
      const synthText = await runCosNaturalPartner({
        callText,
        userText: synthPrompt,
        channelContext,
        route,
        priorTranscript: priorDialog || '',
      });

      return finalizeSlackResponse({
        responder: 'partner_surface',
        text: synthText,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'context_synthesis',
        council_blocked: true,
        response_type: `synthesis_${synthCheck.intent}`,
      });
    } catch (error) {
      console.error('CONTEXT_SYNTHESIS_ERROR:', error);
    }
  }

  // ---------- Partner Surface — COS natural partner (default) ----------
  logRouterEvent('router_responder_selected', {
    responder: 'partner_surface',
    command_name: 'cos_natural',
    task_kind: taskKind,
    playbook_id: playbookForThread?.playbook_id || null,
  });
  logRouterEvent('router_responder_locked', { responder: 'partner_surface' });
  logRouterEvent('dialog_route_entered', {
    raw_text: String(routerCtx.raw_text).slice(0, 400),
    normalized_text: trimmed.slice(0, 400),
    task_kind: taskKind,
  });

  try {
    let llmInput = trimmed;
    if (documentText && !deliverableIntent.triggered && !synthCheck.activate) {
      llmInput = `${trimmed}\n\n[Thread에 첨부된 문서 컨텍스트]\n${documentText}`;
    }
    if (Object.keys(resolvedSlots).length > 0) {
      const slotCtx = Object.entries(resolvedSlots).map(([k, v]) => `${k}: ${v}`).join('\n');
      llmInput = `${llmInput}\n\n[이미 확정된 사항 — 다시 묻지 마세요]\n${slotCtx}`;
    }

    const dialogText = await runCosNaturalPartner({
      callText,
      userText: llmInput,
      channelContext,
      route,
      priorTranscript: priorDialog || '',
    });

    // Topic anchor guard — drift check on outbound draft
    const anchorCluster = deriveAnchorCluster({
      projectSpace,
      slotLedger: ledger,
      recentTranscript: priorDialog,
      playbookKind: taskKind,
    });
    let finalDialogText = dialogText;
    if (anchorCluster.domains.length > 0) {
      const drift = detectTopicDrift({ draftText: dialogText, anchorCluster, currentRequestText: trimmed });
      if (drift.drifted) {
        logDriftEvent(drift, { threadKey, phase: 'partner_surface' });
        const reminder = buildAnchorReminder(anchorCluster, drift);
        finalDialogText = await runCosNaturalPartner({
          callText,
          userText: `${llmInput}\n\n${reminder}`,
          channelContext,
          route,
          priorTranscript: priorDialog || '',
        });
      }
    }

    await appendJsonRecord(INTERACTIONS_FILE, {
      id: makeId('INT'),
      created_at: new Date().toISOString(),
      user_text: trimmed,
      source: metadata,
      channel_context: channelContext,
      route,
      orchestration_mode: 'cos_partner_surface',
      task_kind: taskKind,
      playbook_id: playbookForThread?.playbook_id || null,
      approval_id: null,
      decision_needed: false,
    });

    const hintPlanId = pickThreadPlanFollowUpHint({
      priorTranscript: priorDialog,
      currentUserText: trimmed,
    });
    const dialogWithHint = hintPlanId
      ? `${finalDialogText}\n\n${formatThreadPlanFollowUpFooter(hintPlanId)}`
      : finalDialogText;
    if (hintPlanId) {
      logRouterEvent('dialog_thread_plan_hint', { plan_id: hintPlanId });
    }

    const out = finalizeSlackResponse({
      responder: 'partner_surface',
      text: dialogWithHint,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'COS_대화',
      council_blocked: true,
      response_type: hintPlanId ? 'cos_partner_surface_thread_plan_hint' : 'cos_partner_surface',
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
    console.error('COS_PARTNER_SURFACE_ERROR -> fallback single flow:', error);
    const legacyText = await runLegacySingleFlow(trimmed, channelContext, metadata);
    return finalizeSlackResponse({
      responder: 'single',
      text: legacyText,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      council_blocked: true,
      response_type: 'legacy_single_after_partner_error',
      source_formatter: 'runLegacySingleFlow:after_partner_error',
      slack_route_label: metadata.slack_route_label ?? null,
    });
  }
}

/**
 * Handle explicit existing-project reference routing.
 * Outcomes: resolved → bind + continue, ambiguous → candidates, unresolved → clarification.
 */
function handleExistingProjectReference({ threadKey, trimmed, metadata, routerCtx }) {
  const resolved = resolveProjectSpaceForThread({ threadKey, text: trimmed, metadata });
  logRouterEvent('existing_project_resolve_attempt', {
    resolved: resolved.resolved,
    reason: resolved.reason,
    project_id: resolved.project_id || null,
    candidate_count: resolved.candidates?.length || 0,
  });

  if (resolved.resolved) {
    linkThreadToProjectSpace(resolved.project_id, threadKey);
    return finalizeSlackResponse({
      responder: 'partner_surface',
      text: renderProjectResolutionSurface(resolved),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'existing_project_resolved',
      council_blocked: true,
      response_type: 'existing_project_resolved',
      project_id: resolved.project_id,
    });
  }

  return finalizeSlackResponse({
    responder: 'partner_surface',
    text: renderProjectResolutionSurface(resolved),
    raw_text: routerCtx.raw_text,
    normalized_text: routerCtx.normalized_text,
    command_name: 'existing_project_unresolved',
    council_blocked: true,
    response_type: 'existing_project_unresolved',
  });
}
