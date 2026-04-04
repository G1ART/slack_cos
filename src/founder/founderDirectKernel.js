/**
 * vNext.13.1 — 창업자–COS 단일 커널.
 * vNext.13.4 — pre-reasoning gate 제거: context hydrate → COS planner 턴 → state persist → artifact gate → render.
 */

import { FounderSurfaceType } from '../core/founderContracts.js';
import {
  normalizeFounderMetaCommandLine,
  classifyFounderRoutingLock,
  classifyFounderOperationalProbe,
} from '../features/inboundFounderRoutingLock.js';
import { tryResolveFounderDeterministicUtility } from './founderDeterministicUtilityResolver.js';
import { synthesizeFounderContext } from './founderContextSynthesizer.js';
import {
  buildProposalFromFounderInput,
  buildProposalPacketFromSidecar,
  formatFullFounderProposalSurface,
} from './founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from './executionModeFromProposalPacket.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import { maybeGovernanceAdvisoryForFounder } from '../orchestration/cosGovernanceAdvisory.js';
import {
  getFounderConversationState,
  mergeFounderConversationState,
  founderStateToSnapshot,
} from './founderConversationState.js';
import { planFounderConversationTurn } from './founderConversationPlanner.js';
import { tryArtifactGatedExecutionSpine, isFounderStagingModeEnabled } from './founderArtifactGate.js';
import { mergeStateDeltaWithSidecarArtifactIds } from './founderArtifactSchemas.js';

function stripFounderStructuredCommandPrefixes(t) {
  return String(t || '')
    .replace(/^(업무등록|계획등록|조회|결정)\s*[:：]\s*/i, '')
    .trim();
}

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
 * @param {string} brainText
 * @param {Record<string, unknown>} metadata
 * @param {string | null | undefined} route_label
 * @param {string} threadKey
 * @param {((a: { instructions: string, input: string }) => Promise<string>) | null} callText
 * @param {((a: { instructions: string, input: string, schemaName: string, schema: object }) => Promise<unknown>) | null} callJSON
 */
async function runFounderConversationPipeline(brainText, metadata, route_label, threadKey, callText, callJSON) {
  const transcript_ready = Boolean(String(getConversationTranscript(threadKey) || '').trim());
  const convState = await getFounderConversationState(threadKey);
  const snap = founderStateToSnapshot(convState);
  const contextFrame = synthesizeFounderContext({ threadKey, metadata, conversationStateSnapshot: snap });

  const contextJson = JSON.stringify(
    { contextFrame, durable_state: convState },
    null,
    0,
  ).slice(0, 14000);

  const plan = await planFounderConversationTurn({
    userText: brainText,
    contextJson,
    priorTranscript: String(getConversationTranscript(threadKey) || ''),
    callText,
    callJSON,
    mockPlannerRow: metadata.mockFounderPlannerRow ?? null,
  });
  const sidecar = plan.sidecar;
  const mergedDelta = mergeStateDeltaWithSidecarArtifactIds(sidecar.state_delta || {}, sidecar);
  const sidecarForGate = { ...sidecar, state_delta: mergedDelta };

  const launchFromArtifact = await tryArtifactGatedExecutionSpine({
    execution_artifact: sidecar.execution_artifact,
    threadKey,
    metadata,
    route_label,
    convStateBeforeTurn: convState,
    sidecar: sidecarForGate,
  });

  const space = getProjectSpaceByThread(threadKey);
  await mergeFounderConversationState(threadKey, mergedDelta, {
    last_cos_summary: sidecar.natural_language_reply?.slice(0, 800) || null,
    project_id: space?.project_id ?? convState.project_id ?? null,
  });

  if (launchFromArtifact) {
    return {
      ...launchFromArtifact,
      trace: {
        ...launchFromArtifact.trace,
        ...founderPreflightTrace(),
        founder_conversation_path: true,
        founder_planner_source: plan.source,
        founder_step: 'artifact_gated_launch',
        transcript_ready,
        founder_four_step: false,
        founder_direct_kernel: true,
      },
    };
  }

  const convState2 = await getFounderConversationState(threadKey);
  const contextAfter = synthesizeFounderContext({
    threadKey,
    metadata,
    conversationStateSnapshot: founderStateToSnapshot(convState2),
  });

  const proposal = buildProposalPacketFromSidecar(sidecar, contextAfter, brainText, { source: plan.source });
  const execution_mode_selected = selectExecutionModeFromProposalPacket(proposal);

  let body = String(sidecar.natural_language_reply || '').trim();
  const packetBlock = formatFullFounderProposalSurface(proposal);
  body = body ? `${body}\n\n${packetBlock}` : packetBlock;

  const ext0 = proposal.external_execution_tasks?.length > 0;
  const gov = maybeGovernanceAdvisoryForFounder({
    rawText: brainText,
    contextFrame: contextAfter,
    founderSurface: ext0 ? FounderSurfaceType.APPROVAL_PACKET : FounderSurfaceType.PROPOSAL_PACKET,
  });
  if (gov?.text && gov.text.length < body.length) {
    body += `\n\n${gov.text}`;
  }

  const partner_output_sanitized =
    plan.source === 'partner_fallback_no_sidecar' && plan.partner_output_sanitized === true;

  const workContext = founderMinimalWorkContext(metadata, threadKey);
  const ext = proposal.external_execution_tasks?.length > 0;
  return {
    text: body || formatFullFounderProposalSurface(proposal),
    blocks: undefined,
    surface_type: ext ? FounderSurfaceType.APPROVAL_PACKET : FounderSurfaceType.PROPOSAL_PACKET,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: 'founder_conversation',
      phase_source: 'founder_conversation_pipeline',
      surface_type: ext ? FounderSurfaceType.APPROVAL_PACKET : FounderSurfaceType.PROPOSAL_PACKET,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'vNext.13.5',
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      legacy_ai_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      founder_four_step: true,
      founder_direct_kernel: true,
      founder_conversation_path: true,
      founder_planner_source: plan.source,
      founder_step: 'conversation_turn',
      transcript_ready,
      execution_mode_selected,
      cos_governance_advisory: Boolean(gov?.text),
      governance_advisory_topics: gov?.topics || [],
      proposal_execution_contract: proposal.proposal_execution_contract ?? null,
      proposal_contract_trace: proposal.proposal_contract_trace ?? null,
      partner_natural: plan.source === 'partner_fallback_no_sidecar' && typeof callText === 'function',
      partner_output_sanitized,
      approval_required: proposal.approval_required === true || ext,
      approval_packet_attached: ext,
      intake_session_id: workContext.intake_session_id ?? null,
      conversation_status: sidecar.conversation_status ?? null,
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
  const callJSON = typeof metadata.callJSON === 'function' ? metadata.callJSON : null;

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
            founder_four_step: true,
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
    const convState = await getFounderConversationState(threadKey);
    const ctx0 = synthesizeFounderContext({
      threadKey,
      metadata,
      conversationStateSnapshot: founderStateToSnapshot(convState),
    });
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
        legacy_command_router_used: false,
        legacy_ai_router_used: false,
        founder_hard_recover: true,
        founder_classifier_used: false,
        founder_keyword_route_used: false,
        founder_four_step: true,
        founder_direct_kernel: true,
        route_label: route_label || null,
        ...founderPreflightTrace(),
      },
    };
  }

  const brainText = stripFounderStructuredCommandPrefixes(normalized);
  return runFounderConversationPipeline(brainText, metadata, route_label, threadKey, callText, callJSON);
}
