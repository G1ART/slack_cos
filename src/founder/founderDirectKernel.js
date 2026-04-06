/**
 * vNext.13.10 — Founder natural surface subtraction.
 * vNext.13.12 — Root surgery: no transcript/state poisoning on 기본 경로; 현재 턴 첨부만.
 * 회귀 전용: `runFounderArtifactConversationPipeline`.
 */

import { FounderSurfaceType, SAFE_FALLBACK_TEXT } from '../core/founderContracts.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { thinFounderSlackSurface } from '../features/founderSurfaceGuard.js';
import {
  normalizeFounderMetaCommandLine,
  classifyFounderRoutingLock,
  classifyFounderOperationalProbe,
} from '../features/inboundFounderRoutingLock.js';
import { tryResolveFounderDeterministicUtility } from './founderDeterministicUtilityResolver.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';
import { isFounderStagingModeEnabled } from './founderArtifactGate.js';

export { runFounderArtifactConversationPipeline } from './founderArtifactConversationPipeline.js';

function founderPreflightTrace() {
  return {
    founder_staging_mode: isFounderStagingModeEnabled(),
    founder_preflight_boundary: true,
  };
}

function founderMinimalWorkContext(metadata, threadKey) {
  const run = getExecutionRunByThread(threadKey);
  const space = getProjectSpaceByThread(threadKey);
  const intake = getProjectIntakeSession(metadata);
  return {
    resolved: Boolean(run || space || intake),
    primary_type: run ? 'execution_run' : intake ? 'intake_session' : space ? 'project_space' : 'none',
    intake_session_id: intake?.session_id ?? intake?.id ?? null,
    project_id: run?.project_id ?? space?.project_id ?? null,
    run_id: run?.run_id ?? null,
  };
}

function buildCurrentAttachmentContext(metadata = {}) {
  const ok = Array.isArray(metadata.current_attachment_contexts) ? metadata.current_attachment_contexts : [];
  const failed = Array.isArray(metadata.current_attachment_failures) ? metadata.current_attachment_failures : [];
  const lines = [];

  for (const x of ok) {
    const name = String(x?.filename || '첨부').trim();
    const summary = String(x?.summary || '').trim();
    if (summary) lines.push(`- ${name}: ${summary.slice(0, 1600)}`);
  }

  for (const x of failed) {
    const name = String(x?.filename || '첨부').trim();
    const reason = String(x?.reason || '열지 못함').trim();
    lines.push(`- ${name}: 읽지 못함 (${reason})`);
  }

  return lines;
}

async function runFounderNaturalChatOnly(brainText, metadata, route_label, threadKey, callText) {
  if (typeof callText !== 'function') {
    return {
      text: SAFE_FALLBACK_TEXT,
      blocks: undefined,
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      trace: {
        surface_type: FounderSurfaceType.PARTNER_NATURAL,
        route_label: route_label || null,
        responder_kind: 'founder_kernel',
        responder: 'founder_kernel',
        founder_direct_kernel: true,
        founder_conversation_path: true,
        founder_path: 'natural_chat_only',
        founder_step: 'no_callText',
        transcript_ready: false,
        founder_transcript_injected: false,
        ...founderPreflightTrace(),
      },
    };
  }

  const attachmentLines = buildCurrentAttachmentContext(metadata);

  let userPayload = String(brainText || '').trim();
  if (attachmentLines.length) {
    userPayload += `\n\n[현재 턴 첨부 참고]\n${attachmentLines.join('\n')}`;
  }

  let raw = '';
  try {
    raw = await runCosNaturalPartner({
      callText,
      userText: userPayload,
      channelContext: null,
      route: null,
      priorTranscript: '',
    });
  } catch {
    raw = '';
  }

  const body = thinFounderSlackSurface(String(raw || ''));
  const workContext = founderMinimalWorkContext(metadata, threadKey);

  return {
    text: body,
    blocks: undefined,
    surface_type: FounderSurfaceType.PARTNER_NATURAL,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: 'founder_conversation',
      phase_source: 'founder_natural_chat_only',
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      responder: 'founder_kernel',
      pipeline_version: 'vNext.13.12.root_surgery',
      founder_direct_kernel: true,
      founder_conversation_path: true,
      founder_path: 'natural_chat_only',
      founder_step: 'cos_single_turn',
      transcript_ready: false,
      founder_transcript_injected: false,
      partner_natural: true,
      partner_output_sanitized: String(raw || '').trim() !== body.trim(),
      founder_surface_source: 'direct_cos_chat',
      attachment_context_count: attachmentLines.length,
      intake_session_id: workContext.intake_session_id ?? null,
      cos_governance_advisory: false,
      governance_advisory_topics: [],
      approval_required: false,
      approval_packet_attached: false,
      external_dispatch_candidate: false,
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      legacy_ai_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      founder_four_step: false,
      ...founderPreflightTrace(),
    },
  };
}

/**
 * @param {{ text: string, metadata?: Record<string, unknown>, route_label?: string }} input
 */
export async function runFounderDirectKernel({ text, metadata = {}, route_label } = {}) {
  const normalized = normalizeFounderMetaCommandLine(String(text || '').trim());
  const threadKey = buildSlackThreadKey(metadata);
  const callText = typeof metadata.callText === 'function' ? metadata.callText : null;

  if (metadata.founder_explicit_meta_utility_path === true) {
    const routeLockEarly = classifyFounderRoutingLock(normalized);
    const opProbeEarly = classifyFounderOperationalProbe(normalized);
    const utilEligible =
      routeLockEarly?.kind === 'version' ||
      opProbeEarly?.kind === 'runtime_sha' ||
      opProbeEarly?.kind === 'provider_cursor' ||
      opProbeEarly?.kind === 'provider_supabase';
    if (utilEligible) {
      const util = tryResolveFounderDeterministicUtility({
        normalized,
        threadKey,
        metadata: { ...metadata, founder_explicit_meta_utility_path: true },
      });
      if (util.handled) {
        return {
          text: util.text,
          blocks: undefined,
          surface_type: FounderSurfaceType.RUNTIME_META,
          trace: {
            surface_type: FounderSurfaceType.RUNTIME_META,
            route_label: route_label || null,
            responder_kind: 'founder_kernel',
            responder: 'founder_kernel',
            founder_direct_kernel: true,
            passed_pipeline: true,
            passed_renderer: true,
            legacy_router_used: false,
            legacy_command_router_used: false,
            legacy_ai_router_used: false,
            founder_classifier_used: false,
            founder_keyword_route_used: false,
            founder_four_step: false,
            founder_deterministic_utility: util.kind,
            founder_conversation_path: false,
            founder_operational_meta_short_circuit: true,
            ...founderPreflightTrace(),
          },
        };
      }
    }
  }

  if (metadata.founder_hard_recover === true) {
    return {
      text: SAFE_FALLBACK_TEXT,
      blocks: undefined,
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      trace: {
        surface_type: FounderSurfaceType.PARTNER_NATURAL,
        responder_kind: 'founder_kernel',
        passed_pipeline: true,
        passed_renderer: true,
        legacy_router_used: false,
        legacy_command_router_used: false,
        legacy_ai_router_used: false,
        founder_hard_recover: true,
        founder_hard_recover_mode: 'natural_fallback',
        founder_classifier_used: false,
        founder_keyword_route_used: false,
        founder_four_step: false,
        founder_direct_kernel: true,
        route_label: route_label || null,
        ...founderPreflightTrace(),
      },
    };
  }

  return runFounderNaturalChatOnly(normalized, metadata, route_label, threadKey, callText);
}
