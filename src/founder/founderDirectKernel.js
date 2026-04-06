/**
 * vNext.13.1 — 창업자–COS 단일 커널.
 * vNext.13.4 — pre-reasoning gate 제거: context hydrate → COS planner 턴 → state persist → artifact gate → render.
 * vNext.13.8 — 모델 호출 전 내용 해석(접두 제거·패킷 표면 병합·hard_recover 패킷) 제거. 표면은 natural_language_reply 단일.
 * vNext.13.10 — 슬랙 표면은 structured planner NL 금지; 항상 단일 COS 대화 모델(`runCosNaturalPartner`)만.
 */

import { FounderSurfaceType, SAFE_FALLBACK_TEXT } from '../core/founderContracts.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import {
  normalizeFounderMetaCommandLine,
  classifyFounderRoutingLock,
  classifyFounderOperationalProbe,
} from '../features/inboundFounderRoutingLock.js';
import { tryResolveFounderDeterministicUtility } from './founderDeterministicUtilityResolver.js';
import { synthesizeFounderContext } from './founderContextSynthesizer.js';
import { buildProposalPacketFromSidecar } from './founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from './executionModeFromProposalPacket.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import {
  getFounderConversationState,
  mergeFounderConversationState,
  founderStateToSnapshot,
} from './founderConversationState.js';
import { planFounderConversationTurn } from './founderConversationPlanner.js';
import { tryArtifactGatedExecutionSpine, isFounderStagingModeEnabled } from './founderArtifactGate.js';
import { mergeStateDeltaWithSidecarArtifactIds } from './founderArtifactSchemas.js';

function founderPreflightTrace() {
  return {
    founder_staging_mode: isFounderStagingModeEnabled(),
    founder_preflight_boundary: true,
  };
}

/**
 * @param {{
 *   brainText: string,
 *   metadata: Record<string, unknown>,
 *   threadKey: string,
 *   callText: ((a: { instructions: string, input: string }) => Promise<string>) | null,
 *   plan: { source: string },
 *   sidecar: { natural_language_reply?: string },
 * }} a
 */
async function resolveFounderSlackSurfaceText(a) {
  const { brainText, metadata, threadKey, callText, plan, sidecar } = a;

  if (plan.source === 'partner_fallback_no_sidecar') {
    const t = String(sidecar?.natural_language_reply || '').trim();
    const { text, stripped_to_empty } = sanitizePartnerNaturalLlmOutput(t);
    const body = text || SAFE_FALLBACK_TEXT;
    return {
      body,
      partner_natural: true,
      partner_output_sanitized:
        t !== body || stripped_to_empty || plan.partner_output_sanitized === true,
    };
  }

  if (typeof callText !== 'function') {
    return { body: SAFE_FALLBACK_TEXT, partner_natural: false, partner_output_sanitized: false };
  }

  const convStateMid = await getFounderConversationState(threadKey);
  const snap = founderStateToSnapshot(convStateMid);
  const metaNoFail = { ...metadata, failure_notes: [] };
  const frame = synthesizeFounderContext({
    threadKey,
    metadata: metaNoFail,
    conversationStateSnapshot: snap,
  });
  const fileLines = [];
  for (const x of frame.recent_file_contexts || []) {
    const sum = String(x?.summary || '').trim();
    if (sum && x?.extract_status !== 'failed') {
      fileLines.push(`- ${x.filename || '첨부'}: ${sum.slice(0, 2000)}`);
    }
  }
  const hasFail = Array.isArray(metadata.failure_notes) && metadata.failure_notes.length > 0;
  let partnerUser = String(brainText || '').trim();
  if (hasFail) {
    partnerUser += `\n\n참고: 이 턴에는 첨부 파일 내용을 시스템에서 열지 못했을 수 있다. JSON·API 원문은 답에 넣지 말고 짧은 평문 한국어로만 안내하라.`;
  }
  if (fileLines.length) {
    partnerUser += `\n\n아래는 최근 첨부에서 읽은 요약이다. 필요하면 대화에 자연스럽게 반영하라.\n${fileLines.join('\n')}`;
  }

  let raw = '';
  try {
    raw = await runCosNaturalPartner({
      callText,
      userText: partnerUser,
      channelContext: null,
      route: { primary_agent: 'founder_kernel', include_risk: false, urgency: 'normal' },
      priorTranscript: String(getConversationTranscript(threadKey) || ''),
    });
  } catch {
    raw = '';
  }

  const sanitized = sanitizePartnerNaturalLlmOutput(String(raw || '').trim());
  let body = sanitized.text || '';
  const hasMock = metadata.mockFounderPlannerRow != null;
  if (!body.trim() && hasMock) {
    const fb = sanitizePartnerNaturalLlmOutput(String(sidecar?.natural_language_reply || ''));
    body = fb.text || '';
  }
  if (!body.trim()) body = SAFE_FALLBACK_TEXT;

  return {
    body,
    partner_natural: true,
    partner_output_sanitized: String(raw || '').trim() !== body.trim(),
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

  const gateResult = await tryArtifactGatedExecutionSpine({
    execution_artifact: sidecar.execution_artifact,
    threadKey,
    metadata,
    route_label,
    convStateBeforeTurn: convState,
    sidecar: sidecarForGate,
  });

  const space = getProjectSpaceByThread(threadKey);
  await mergeFounderConversationState(threadKey, mergedDelta, {
    project_id: space?.project_id ?? convState.project_id ?? null,
  });

  if (gateResult?.launch_succeeded) {
    const { launch_succeeded: _ls, ...launchPayload } = gateResult;
    return {
      ...launchPayload,
      trace: {
        ...launchPayload.trace,
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

  const spineRejectTrace =
    gateResult?.spine_eligibility_failed === true
      ? {
          founder_spine_eligibility_failed: true,
          founder_spine_eligibility_reason: gateResult.eligibility_reason,
        }
      : {};

  const convState2 = await getFounderConversationState(threadKey);
  const contextAfter = synthesizeFounderContext({
    threadKey,
    metadata,
    conversationStateSnapshot: founderStateToSnapshot(convState2),
  });

  const proposal = buildProposalPacketFromSidecar(sidecar, contextAfter, brainText, { source: plan.source });
  const execution_mode_selected = selectExecutionModeFromProposalPacket(proposal);

  const ext = proposal.external_execution_tasks?.length > 0;
  const surface = await resolveFounderSlackSurfaceText({
    brainText,
    metadata,
    threadKey,
    callText,
    plan,
    sidecar,
  });
  const body = surface.body;

  await mergeFounderConversationState(threadKey, {}, {
    last_cos_summary: body.slice(0, 800),
    project_id: space?.project_id ?? convState.project_id ?? null,
  });

  const partner_output_sanitized = surface.partner_output_sanitized === true;
  const structured_output_sanitized = false;

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
      phase_source: 'founder_conversation_pipeline',
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'vNext.13.10',
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
      founder_planner_source: plan.source,
      founder_step: 'conversation_turn',
      transcript_ready,
      execution_mode_selected,
      cos_governance_advisory: false,
      governance_advisory_topics: [],
      proposal_execution_contract: proposal.proposal_execution_contract ?? null,
      proposal_contract_trace: proposal.proposal_contract_trace ?? null,
      partner_natural: surface.partner_natural === true,
      partner_output_sanitized,
      structured_output_sanitized,
      founder_surface_source: 'cos_natural_partner_only',
      approval_required: proposal.approval_required === true || ext,
      approval_packet_attached: ext,
      external_dispatch_candidate: ext,
      intake_session_id: workContext.intake_session_id ?? null,
      conversation_status: sidecar.conversation_status ?? null,
      ...spineRejectTrace,
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

  return runFounderConversationPipeline(normalized, metadata, route_label, threadKey, callText, callJSON);
}
