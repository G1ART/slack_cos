/**
 * 실행/승인 아티팩트·구조화 플래너 파이프라인 — Slack 창업자 기본 경로에서는 사용하지 않음.
 * 회귀 전용: `runFounderArtifactConversationPipeline` (`npm test` 중 launch/lineage 스크립트).
 */

import { FounderSurfaceType, SAFE_FALLBACK_TEXT } from '../core/founderContracts.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import { synthesizeFounderContext } from './founderContextSynthesizer.js';
import { buildProposalPacketFromSidecar } from './founderProposalKernel.js';
import { selectExecutionModeFromProposalPacket } from './executionModeFromProposalPacket.js';
import { getProjectIntakeSession } from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { getConversationTranscript } from '../features/slackConversationBuffer.js';
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
      route: null,
      priorTranscript: String(getConversationTranscript(threadKey) || ''),
    });
  } catch {
    raw = '';
  }

  const partnerTrim = String(raw || '').trim();
  const sanitized = sanitizePartnerNaturalLlmOutput(partnerTrim);
  let body = sanitized.text || '';
  const hasMock = metadata.mockFounderPlannerRow != null;
  // 빈 파트너 응답은 sanitize 단계에서 이미 SAFE_FALLBACK_TEXT가 되어 !body.trim() 분기에 못 들어감 —
  // 회귀 mock(sidecar) 자연어는 그 경우에도 덮어쓴다.
  const partnerMissing = !partnerTrim || body === SAFE_FALLBACK_TEXT;
  if (partnerMissing && hasMock) {
    const fb = sanitizePartnerNaturalLlmOutput(String(sidecar?.natural_language_reply || ''));
    if (fb.text?.trim()) body = fb.text;
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
export async function runFounderArtifactConversationPipeline(
  brainText,
  metadata,
  route_label,
  threadKey,
  callText,
  callJSON,
) {
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
    useStructuredPlanner: true,
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
        founder_pipeline: 'artifact_regression_only',
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
      phase_source: 'founder_artifact_conversation_pipeline',
      surface_type: FounderSurfaceType.PARTNER_NATURAL,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'artifact_regression',
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
      founder_structured_planner: true,
      founder_step: 'conversation_turn',
      transcript_ready,
      execution_mode_selected,
      cos_governance_advisory: false,
      governance_advisory_topics: [],
      proposal_execution_contract: proposal.proposal_execution_contract ?? null,
      proposal_contract_trace: proposal.proposal_contract_trace ?? null,
      partner_natural: surface.partner_natural === true,
      partner_output_sanitized,
      structured_output_sanitized: false,
      founder_surface_source: 'artifact_pipeline_regression',
      approval_required: proposal.approval_required === true || ext,
      approval_packet_attached: ext,
      external_dispatch_candidate: ext,
      intake_session_id: workContext.intake_session_id ?? null,
      conversation_status: sidecar.conversation_status ?? null,
      founder_pipeline: 'artifact_regression_only',
      ...spineRejectTrace,
      ...founderPreflightTrace(),
    },
  };
}
