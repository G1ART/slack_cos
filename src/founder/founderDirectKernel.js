/**
 * vNext.13.10 — Founder natural surface subtraction (작업지시서 SSOT).
 * Slack 창업자 기본 경로: 플래너·아티팩트 게이트·제안 패킷 조립 없이 **단일 LLM 자연어**만.
 * 회귀 전용(실행 lineage·mock 플래너): `runFounderArtifactConversationPipeline`.
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
import { synthesizeFounderContext } from './founderContextSynthesizer.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import {
  getFounderConversationState,
  mergeFounderConversationState,
  founderStateToSnapshot,
} from './founderConversationState.js';
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
    project_space: space,
    run: run || null,
    intake_session: intake || null,
    intake_session_id: intake?.session_id ?? intake?.id ?? null,
    project_id: run?.project_id ?? space?.project_id ?? null,
    run_id: run?.run_id ?? null,
    phase_hint: 'discover',
    confidence: 1,
  };
}

/**
 * Slack 창업자 면 — 대표 원문 + (성공한) 첨부 요약 + 스레드 transcript → COS 1회.
 * failure_notes 는 user 본문에 붙이지 않음(작업지시서 C4). 인제스트·trace 는 기존 핸들러 유지.
 */
async function runFounderNaturalChatOnly(brainText, metadata, route_label, threadKey, callText) {
  const transcript_ready = Boolean(String(getConversationTranscript(threadKey) || '').trim());

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
        transcript_ready,
        ...founderPreflightTrace(),
      },
    };
  }

  const convState = await getFounderConversationState(threadKey);
  const snap = founderStateToSnapshot(convState);
  const frame = synthesizeFounderContext({
    threadKey,
    metadata,
    conversationStateSnapshot: snap,
  });

  const fileLines = [];
  for (const x of frame.recent_file_contexts || []) {
    const sum = String(x?.summary || '').trim();
    if (sum && x?.extract_status !== 'failed') {
      fileLines.push(`- ${x.filename || '첨부'}: ${sum.slice(0, 2000)}`);
    }
  }

  let userPayload = String(brainText || '').trim();
  if (fileLines.length) {
    userPayload += `\n\n(첨부에서 읽은 요약)\n${fileLines.join('\n')}`;
  }

  let raw = '';
  try {
    raw = await runCosNaturalPartner({
      callText,
      userText: userPayload,
      channelContext: null,
      route: null,
      priorTranscript: String(getConversationTranscript(threadKey) || ''),
    });
  } catch {
    raw = '';
  }

  const body = thinFounderSlackSurface(String(raw || ''));
  const space = getProjectSpaceByThread(threadKey);
  await mergeFounderConversationState(threadKey, {}, {
    last_cos_summary: body.slice(0, 800),
    project_id: space?.project_id ?? convState.project_id ?? null,
  });

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
      pipeline_version: 'vNext.13.10.subtraction',
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      legacy_ai_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      founder_four_step: false,
      founder_direct_kernel: true,
      founder_conversation_path: true,
      founder_path: 'natural_chat_only',
      founder_step: 'cos_single_turn',
      transcript_ready,
      partner_natural: true,
      partner_output_sanitized: String(raw || '').trim() !== body.trim(),
      founder_surface_source: 'direct_cos_chat',
      intake_session_id: workContext.intake_session_id ?? null,
      cos_governance_advisory: false,
      governance_advisory_topics: [],
      approval_required: false,
      approval_packet_attached: false,
      external_dispatch_candidate: false,
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
