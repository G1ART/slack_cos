/**
 * vNext.13.1 — 창업자–COS 단일 커널 (오퍼레이터 헌법 spine과 물리 분리).
 * 금지: founder intent classifier, work object/phase resolvers, policyEngine, packetAssembler, founderRenderer.
 */

import { FounderSurfaceType } from '../core/founderContracts.js';
import { normalizeFounderMetaCommandLine } from '../features/inboundFounderRoutingLock.js';
import { tryResolveFounderDeterministicUtility } from './founderDeterministicUtilityResolver.js';
import { maybeHandleFounderLaunchGate } from '../core/founderLaunchGate.js';
import { synthesizeFounderContext } from './founderContextSynthesizer.js';
import {
  buildProposalFromFounderInput,
  formatFullFounderProposalSurface,
} from './founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from './executionModeFromProposalPacket.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import { maybeGovernanceAdvisoryForFounder } from '../orchestration/cosGovernanceAdvisory.js';

function stripFounderStructuredCommandPrefixes(t) {
  return String(t || '')
    .replace(/^(업무등록|계획등록|조회|결정)\s*[:：]\s*/i, '')
    .trim();
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

function handleFounderDeterministicUtility(normalized, metadata, route_label, threadKey, du) {
  const workContext = founderMinimalWorkContext(metadata, threadKey);
  return {
    text: du.text,
    blocks: undefined,
    surface_type: FounderSurfaceType.RUNTIME_META,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: 'utility',
      phase_source: 'founder_deterministic_utility',
      intent_signal: 'runtime_meta',
      surface_type: FounderSurfaceType.RUNTIME_META,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'vNext.13.1',
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      legacy_ai_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      founder_deterministic_utility: du.kind,
      founder_direct_kernel: true,
    },
  };
}

async function founderDirectInboundFourStep(brainText, metadata, route_label, threadKey, callText) {
  const transcriptExcerpt = getConversationTranscript(threadKey);
  const transcript_ready = Boolean(transcriptExcerpt && String(transcriptExcerpt).trim().length > 0);

  const du = tryResolveFounderDeterministicUtility({ normalized: brainText, threadKey, metadata });
  if (du.handled) {
    const r = handleFounderDeterministicUtility(brainText, metadata, route_label, threadKey, du);
    return {
      ...r,
      trace: { ...r.trace, founder_four_step: true, founder_step: 'deterministic_utility', transcript_ready },
    };
  }

  const launchHandled = await maybeHandleFounderLaunchGate(brainText, metadata, route_label, threadKey);
  if (launchHandled) {
    return {
      ...launchHandled,
      trace: {
        ...launchHandled.trace,
        founder_four_step: true,
        founder_step: 'launch_gate',
        transcript_ready,
        founder_direct_kernel: true,
      },
    };
  }

  const r = await runFounderProposalKernelTurn(brainText, metadata, route_label, callText, threadKey);
  return {
    ...r,
    trace: { ...r.trace, founder_four_step: true, founder_step: 'proposal_kernel', transcript_ready },
  };
}

async function runFounderProposalKernelTurn(normalized, metadata, route_label, callText, threadKey) {
  const workContext = founderMinimalWorkContext(metadata, threadKey);
  const contextFrame = synthesizeFounderContext({ threadKey, metadata });
  const proposal = buildProposalFromFounderInput({ rawText: normalized, contextFrame });
  const execution_mode_selected = selectExecutionModeFromProposalPacket(proposal);
  let body = formatFullFounderProposalSurface(proposal);
  const gov = maybeGovernanceAdvisoryForFounder({ rawText: normalized, contextFrame });
  if (gov?.text) {
    body += `\n\n${gov.text}`;
  }
  let partner_output_sanitized = false;

  if (typeof callText === 'function') {
    try {
      const priorTranscript = getConversationTranscript(threadKey);
      const generated = await runCosNaturalPartner({
        callText,
        userText: normalized,
        channelContext: null,
        route: { primary_agent: 'founder_kernel', include_risk: false, urgency: 'normal' },
        priorTranscript,
      });
      const rawPlain = String(generated || '').trim();
      const { text: plain, stripped_to_empty: partnerCouncilShapeStripped } = rawPlain
        ? sanitizePartnerNaturalLlmOutput(rawPlain)
        : { text: '', stripped_to_empty: false };
      partner_output_sanitized = plain !== rawPlain || partnerCouncilShapeStripped;
      if (plain) {
        body += `\n\n—\n*대화형 보강*\n${plain}`;
      }
    } catch (e) {
      console.error('[FOUNDER_PROPOSAL_KERNEL_PARTNER]', e?.message || e);
    }
  }

  const ext = proposal.external_execution_tasks?.length > 0;
  return {
    text: body,
    blocks: undefined,
    surface_type: ext ? FounderSurfaceType.APPROVAL_PACKET : FounderSurfaceType.PROPOSAL_PACKET,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: 'proposal_synthesis',
      phase_source: 'founder_proposal_kernel',
      surface_type: ext ? FounderSurfaceType.APPROVAL_PACKET : FounderSurfaceType.PROPOSAL_PACKET,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'vNext.13.1',
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      legacy_ai_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      founder_proposal_kernel: true,
      founder_direct_kernel: true,
      execution_mode_selected,
      cos_governance_advisory: Boolean(gov?.text),
      governance_advisory_topics: gov?.topics || [],
      partner_natural: typeof callText === 'function',
      partner_output_sanitized,
      approval_required: proposal.approval_required === true || ext,
      approval_packet_attached: ext,
      intake_session_id: workContext.intake_session_id ?? null,
    },
  };
}

/**
 * 창업자 DM/멘션/라우트 라벨 전용. app.js · runInboundAiRouter만 호출.
 * @param {{ text: string, metadata?: Record<string, unknown>, route_label?: string }} input
 */
export async function runFounderDirectKernel({ text, metadata = {}, route_label } = {}) {
  const normalized = normalizeFounderMetaCommandLine(String(text || '').trim());
  const threadKey = buildSlackThreadKey(metadata);
  const callText = typeof metadata.callText === 'function' ? metadata.callText : null;

  if (metadata.founder_hard_recover === true) {
    const ctx0 = synthesizeFounderContext({ threadKey, metadata });
    const prop0 = buildProposalFromFounderInput({ rawText: normalized, contextFrame: ctx0 });
    const body0 = formatFullFounderProposalSurface(prop0);
    return {
      text: body0,
      blocks: undefined,
      surface_type: FounderSurfaceType.PROPOSAL_PACKET,
      trace: {
        surface_type: FounderSurfaceType.PROPOSAL_PACKET,
        responder_kind: 'founder_kernel',
        passed_pipeline: true,
        passed_renderer: true,
        legacy_router_used: false,
        founder_hard_recover: true,
        founder_classifier_used: false,
        founder_keyword_route_used: false,
        founder_direct_kernel: true,
        route_label: route_label || null,
      },
    };
  }

  const brainText = stripFounderStructuredCommandPrefixes(normalized);
  return founderDirectInboundFourStep(brainText, metadata, route_label, threadKey, callText);
}
