/**
 * Pre-AI 인바운드 파이프라인: 정규화 → 도움말(대표/운영) → 결정 짧은 회신 → **Clean `start_project` Front Door** → **M4 lineage** → 조회 → … → 구조화 명령 →
 * **대표 표면(surface intent)** → 미스 시 AI.
 * 순서 정본: `COS_FastTrack_v1_Surface_And_Routing.md`
 *
 * @see buildRouterSyncSnapshot — 동일한 정규화·플래너·조회 추출 순서 유지
 */

import { normalizeSlackUserPayload } from '../slack/slackTextNormalize.js';
import {
  tryFinalizeSlackQueryRoute,
  matchQueryCommandPrefix,
  extractQueryCommandLine,
} from './queryOnlyRoute.js';
import { finalizeSlackResponse, logRouterEvent } from './topLevelRouter.js';
import {
  normalizePlannerInputForRoute,
  analyzePlannerResponderLock,
} from './plannerRoute.js';
import { getChannelContext } from '../storage/channelContext.js';
import { getProjectContext } from '../storage/projectContext.js';
import { getEnvironmentContext } from '../storage/environmentContext.js';
import { getDefaultEnvKey } from '../storage/environmentProfiles.js';
import { runInboundStructuredCommands } from './runInboundStructuredCommands.js';
import { tryExecutiveSurfaceResponse } from './tryExecutiveSurfaceResponse.js';
import { tryFinalizeDecisionShortReply } from './decisionPackets.js';
import { tryFinalizeG1CosLineageTransport } from './g1cosLineageTransport.js';
import { resolveCleanStartProjectKickoff } from './startProjectKickoffDoor.js';

/** 구조화 명령 턴 trace·로그용 라벨(첫 토큰, 콜론 앞만). */
function structuredCommandTraceLabel(trimmed) {
  const t = String(trimmed || '').trim();
  if (!t) return 'structured';
  const head = t.split(/\s+/u)[0] || t;
  const noColon = head.split(/[:：]/u)[0] || head;
  return noColon.slice(0, 48) || 'structured';
}

/**
 * @typedef {{
 *   userText: unknown,
 *   metadata?: Record<string, unknown>,
 *   getExecutiveHelpText: () => string,
 *   getOperatorHelpText: () => string,
 *   runPlannerHardLockedBranch: (args: {
 *     routerCtx: { raw_text: unknown, normalized_text: string },
 *     plannerNorm: unknown,
 *     plannerLock: { type: string },
 *     metadata: Record<string, unknown>,
 *     channelContext: string | null,
 *     projectContext: string | null,
 *     envKey: string,
 *   }) => Promise<string>,
 *   structuredDeps: Record<string, unknown>,
 * }} RunInboundCommandRouterInput
 */

/**
 * @param {RunInboundCommandRouterInput} ctx
 * @returns {Promise<
 *   | { done: true, response: string }
 *   | {
 *       done: false,
 *       aiCtx: {
 *         trimmed: string,
 *         routerCtx: { raw_text: unknown, normalized_text: string },
 *         metadata: Record<string, unknown>,
 *         channelContext: string | null,
 *         projectContext: string | null,
 *         envKey: string,
 *       },
 *     }
 * >}
 */
export async function runInboundCommandRouter(ctx) {
  const {
    userText,
    metadata = {},
    getExecutiveHelpText,
    getOperatorHelpText,
    getHelpText,
    runPlannerHardLockedBranch,
    structuredDeps,
  } = ctx;

  const execHelp = getExecutiveHelpText ?? getHelpText;
  const opHelp = getOperatorHelpText ?? getHelpText;

  const trimmed = normalizeSlackUserPayload(String(userText ?? '').trim());
  const routerCtx = { raw_text: userText, normalized_text: trimmed };

  if (trimmed === '도움말') {
    logRouterEvent('router_responder_selected', { responder: 'help', command_name: '도움말' });
    logRouterEvent('router_responder_locked', { responder: 'help' });
    const response = finalizeSlackResponse({
      responder: 'help',
      text: execHelp(),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: '도움말',
      council_blocked: true,
      response_type: 'help_executive',
    });
    return { done: true, response };
  }

  if (trimmed === '운영도움말') {
    logRouterEvent('router_responder_selected', { responder: 'help', command_name: '운영도움말' });
    logRouterEvent('router_responder_locked', { responder: 'help' });
    const response = finalizeSlackResponse({
      responder: 'help',
      text: opHelp(),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: '운영도움말',
      council_blocked: true,
      response_type: 'help_operator',
    });
    return { done: true, response };
  }

  const decisionShort = await tryFinalizeDecisionShortReply(trimmed, metadata);
  if (decisionShort != null) {
    logRouterEvent('router_responder_selected', {
      responder: 'executive_surface',
      command_name: 'decision_reply',
      packet_id: decisionShort.packet_id,
      work_queue_id: decisionShort.work_queue_id ?? null,
    });
    logRouterEvent('router_responder_locked', { responder: 'executive_surface', via: 'decision_short_reply' });
    const response = finalizeSlackResponse({
      responder: 'executive_surface',
      text: decisionShort.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'decision_reply',
      council_blocked: true,
      response_type: decisionShort.response_type,
      packet_id: decisionShort.packet_id,
      work_queue_id: decisionShort.work_queue_id ?? null,
    });
    return { done: true, response };
  }

  const kickDoor = resolveCleanStartProjectKickoff(trimmed, metadata);
  if (kickDoor) {
    const surfaceKick = await tryExecutiveSurfaceResponse(kickDoor.line, metadata, {
      startProjectToneAck: kickDoor.toneAck,
    });
    if (surfaceKick != null && surfaceKick.response_type === 'start_project') {
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: 'start_project',
        via: 'clean_start_project_front_door',
      });
      logRouterEvent('router_responder_locked', {
        responder: 'executive_surface',
        via: 'clean_start_project_front_door',
      });
      const response = finalizeSlackResponse({
        responder: 'executive_surface',
        text: surfaceKick.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'start_project',
        council_blocked: true,
        response_type: surfaceKick.response_type,
      });
      return { done: true, response };
    }
  }

  const lineageHit = await tryFinalizeG1CosLineageTransport(trimmed, routerCtx);
  if (lineageHit != null) {
    logRouterEvent('router_responder_selected', {
      responder: 'query',
      command_name: 'g1cos_lineage',
      query_match: false,
      response_type: lineageHit.response_type,
    });
    logRouterEvent('router_responder_locked', { responder: 'query', via: 'g1cos_lineage_transport' });
    const response = finalizeSlackResponse({
      responder: 'query',
      text: lineageHit.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      query_match: false,
      council_blocked: true,
      response_type: lineageHit.response_type,
    });
    return { done: true, response };
  }

  const queryFinalized = await tryFinalizeSlackQueryRoute(trimmed, routerCtx);
  if (queryFinalized != null) {
    return { done: true, response: queryFinalized };
  }

  const plannerNormSync = normalizePlannerInputForRoute(trimmed);
  const plannerLockSync = analyzePlannerResponderLock(plannerNormSync);
  const queryLineResolved = extractQueryCommandLine(trimmed) ?? trimmed;
  const queryPrefixSync = matchQueryCommandPrefix(queryLineResolved);

  logRouterEvent('router_entered', {
    raw_text: String(userText).slice(0, 400),
    normalized_text: trimmed.slice(0, 400),
    routing_sync: {
      planner_lock: plannerLockSync.type,
      query_prefix: queryPrefixSync,
    },
  });
  logRouterEvent('router_normalized', {
    raw_text: String(userText).slice(0, 400),
    normalized_text: trimmed.slice(0, 400),
    routing_sync: {
      planner_lock: plannerLockSync.type,
      query_prefix: queryPrefixSync,
    },
  });
  logRouterEvent('routing_sync_snapshot', {
    normalized_head: trimmed.slice(0, 220),
    planner_lock: plannerLockSync.type,
    query_prefix: queryPrefixSync,
  });

  const channelContext = metadata.channel ? await getChannelContext(metadata.channel) : null;
  const projectContext = metadata.channel ? await getProjectContext(metadata.channel) : null;
  const envContext =
    metadata.channel && metadata.source_type !== 'direct_message'
      ? await getEnvironmentContext(metadata.channel)
      : null;
  const envKey = envContext || getDefaultEnvKey();

  if (plannerLockSync.type !== 'none') {
    logRouterEvent('router_responder_selected', {
      responder: 'planner',
      command_name: '계획등록',
      planner_match: true,
    });
    logRouterEvent('router_responder_locked', { responder: 'planner' });
    const response = await runPlannerHardLockedBranch({
      routerCtx,
      plannerNorm: plannerNormSync,
      plannerLock: plannerLockSync,
      metadata,
      channelContext,
      projectContext,
      envKey,
    });
    return { done: true, response };
  }

  const structuredOut = await runInboundStructuredCommands({
    trimmed,
    metadata,
    channelContext,
    projectContext,
    envKey,
    ...structuredDeps,
  });
  if (structuredOut !== undefined) {
    if (typeof structuredOut === 'string') {
      const scLabel = structuredCommandTraceLabel(trimmed);
      logRouterEvent('router_responder_selected', {
        responder: 'structured',
        command_name: scLabel,
      });
      logRouterEvent('router_responder_locked', { responder: 'structured' });
      const response = finalizeSlackResponse({
        responder: 'structured',
        text: structuredOut,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: scLabel,
        council_blocked: true,
        response_type: 'structured_command',
      });
      return { done: true, response };
    }
    return { done: true, response: structuredOut };
  }

  const surfaceResult = await tryExecutiveSurfaceResponse(trimmed, metadata);
  if (surfaceResult != null) {
    logRouterEvent('surface_intent_handled', {
      normalized_head: trimmed.slice(0, 160),
      packet_id: surfaceResult.packet_id,
      status_packet_id: surfaceResult.status_packet_id ?? null,
    });
    const response = finalizeSlackResponse({
      responder: 'executive_surface',
      text: surfaceResult.text,
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: surfaceResult.packet_id
        ? 'decision_packet'
        : surfaceResult.response_type ?? 'executive_surface',
      council_blocked: true,
      response_type: surfaceResult.response_type,
      packet_id: surfaceResult.packet_id,
      status_packet_id: surfaceResult.status_packet_id ?? null,
    });
    return { done: true, response };
  }

  return {
    done: false,
    aiCtx: {
      trimmed,
      routerCtx,
      metadata,
      channelContext,
      projectContext,
      envKey,
    },
  };
}
