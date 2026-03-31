/**
 * vNext.10b — 단일 진입점: classifyFounderRoutingLock → finalizeSlackResponse
 * (멘션/DM 명령 라우터 + AI 라우터 모두 동일 응답).
 */

// GREP_FOUNDERRLOCK_MODULE

import {
  classifyFounderRoutingLock,
  formatRuntimeMetaSurfaceText,
  formatMetaDebugSurfaceText,
  surfaceLineForFounderKickoffLock,
} from './inboundFounderRoutingLock.js';
import { tryExecutiveSurfaceResponse } from './tryExecutiveSurfaceResponse.js';
import { finalizeSlackResponse, logRouterEvent } from './topLevelRouter.js';

/**
 * @param {{ trimmed: string, routerCtx: { raw_text: unknown, normalized_text: string }, metadata?: Record<string, unknown> }} p
 * @returns {Promise<string | null>}
 */
export async function tryFinalizeInboundFounderRoutingLock(p) {
  const { trimmed, routerCtx, metadata = {} } = p;
  const slack_route_label =
    metadata.slack_route_label != null ? String(metadata.slack_route_label) : null;

  const founderRouteLock = classifyFounderRoutingLock(trimmed);
  if (founderRouteLock?.kind === 'version') {
    // GREP_FOUNDERRLOCK_VERSION_RETURN
    logRouterEvent('router_responder_selected', {
      responder: 'runtime_meta_surface',
      command_name: 'routing_lock_version',
      via: 'inboundFounderRoutingLock',
    });
    return finalizeSlackResponse({
      responder: 'runtime_meta_surface',
      text: formatRuntimeMetaSurfaceText(),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'version',
      council_blocked: true,
      response_type: 'routing_lock_version',
      source_formatter: 'founderRoutingLockFinalize:version',
      slack_route_label,
    });
  }

  if (founderRouteLock?.kind === 'meta_debug') {
    // GREP_FOUNDERRLOCK_META_RETURN
    logRouterEvent('router_responder_selected', {
      responder: 'meta_debug_surface',
      command_name: 'routing_lock_meta',
      via: 'inboundFounderRoutingLock',
    });
    return finalizeSlackResponse({
      responder: 'meta_debug_surface',
      text: formatMetaDebugSurfaceText(),
      raw_text: routerCtx.raw_text,
      normalized_text: routerCtx.normalized_text,
      command_name: 'meta_debug',
      council_blocked: true,
      response_type: 'routing_lock_meta_debug',
      source_formatter: 'founderRoutingLockFinalize:meta_debug',
      slack_route_label,
    });
  }

  if (founderRouteLock?.kind === 'kickoff_test') {
    const surfKick = await tryExecutiveSurfaceResponse(surfaceLineForFounderKickoffLock(trimmed), metadata, {});
    if (surfKick?.response_type === 'start_project') {
      // GREP_FOUNDERRLOCK_KICKOFF_RETURN
      logRouterEvent('router_responder_selected', {
        responder: 'executive_surface',
        command_name: 'start_project',
        via: 'inboundFounderRoutingLock_kickoff',
      });
      return finalizeSlackResponse({
        responder: 'executive_surface',
        text: surfKick.text,
        raw_text: routerCtx.raw_text,
        normalized_text: routerCtx.normalized_text,
        command_name: 'start_project',
        council_blocked: true,
        response_type: surfKick.response_type,
        source_formatter: 'founderRoutingLockFinalize:kickoff_tryExecutiveSurfaceResponse',
        slack_route_label,
        packet_id: surfKick.packet_id ?? null,
        status_packet_id: surfKick.status_packet_id ?? null,
      });
    }
  }

  return null;
}
