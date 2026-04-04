/**
 * Founder launch → execution spine 연결.
 * vNext.13.4+: 창업자 프로덕션 경로는 `tryArtifactGatedExecutionSpine` → 본 모듈의 `runFounderLaunchPipelineCore` 만.
 * Raw-text launch 회귀는 `src/legacy/founderRawTextLaunchRegression.js` (프로덕션 import 금지).
 */

import { buildProviderTruthSnapshot } from './providerTruthSnapshot.js';
import { evaluateLaunchReadiness } from './launchReadinessEvaluator.js';
import {
  buildExecutionLaunchRenderPayload,
  buildLaunchBlockedPayload,
} from './executionLaunchPacketBuilder.js';
import { FounderSurfaceType } from './founderContracts.js';
import {
  formatFounderLaunchBlockedSurface,
  formatFounderLaunchExecutionSurface,
} from '../founder/founderLaunchFormatter.js';
import {
  getProjectIntakeSession,
  transitionProjectIntakeStage,
  openProjectIntakeSession,
} from '../features/projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun, getExecutionRunByThread } from '../features/executionRun.js';
import { bootstrapProjectSpace } from '../features/projectSpaceBootstrap.js';
import {
  getProjectSpaceByThread,
  linkRunToProjectSpace,
  computeGoalFingerprint,
  countDistinctThreadsForSpace,
  getRelatedSpaceCandidatesForTrace,
} from '../features/projectSpaceRegistry.js';

/** vNext.13 — 창업자 launch gate: work_object 파서 없이 스레드·인테이크 기준 맥락만 */
function launchMinimalWorkContext(metadata, threadKey) {
  const run = getExecutionRunByThread(threadKey);
  let space = getProjectSpaceByThread(threadKey);
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
  };
}

function flattenSpaceResolutionForTrace(r) {
  if (!r) return {};
  return {
    project_space_resolution_mode: r.project_space_resolution_mode,
    reused_space_project_id: r.reused_space_project_id ?? null,
    reused_space_reason: r.reused_space_reason ?? null,
    related_space_candidates: r.related_space_candidates ?? [],
    goal_fingerprint: r.goal_fingerprint ?? null,
    resolution_confidence: r.resolution_confidence ?? null,
    active_thread_count: r.active_thread_count ?? null,
    possible_related_spaces: r.possible_related_spaces ?? undefined,
    label_match_kind: r.label_match_kind ?? undefined,
  };
}

function inferResolutionFromExistingSpace(space, threadKey, goalLineProbe) {
  const byThread = getProjectSpaceByThread(threadKey);
  const fp = computeGoalFingerprint(goalLineProbe);
  const related = getRelatedSpaceCandidatesForTrace(goalLineProbe, 5);
  if (byThread && byThread.project_id === space.project_id) {
    return {
      project_space_resolution_mode: 'thread_linked',
      reused_space_project_id: space.project_id,
      reused_space_reason: 'thread_index_hit',
      related_space_candidates: related,
      goal_fingerprint: fp,
      resolution_confidence: 1,
      active_thread_count: countDistinctThreadsForSpace(space),
    };
  }
  return {
    project_space_resolution_mode: 'pre_existing_context',
    reused_space_project_id: space.project_id,
    reused_space_reason: 'work_object_or_registry_without_thread_index',
    related_space_candidates: related,
    goal_fingerprint: fp,
    resolution_confidence: 0.75,
    active_thread_count: countDistinctThreadsForSpace(space),
  };
}

function buildLaunchPipelineResult(rendered, workContext, phaseResult, intentResult, route_label, traceExtras) {
  const surface_type = traceExtras.surface_type;
  return {
    text: rendered.text,
    blocks: rendered.blocks,
    surface_type,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: phaseResult.phase,
      phase_source: phaseResult.phase_source,
      intent_signal: intentResult.intent,
      intent_confidence: intentResult.confidence,
      surface_type,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'v1.1',
      input_text: rendered.text,
      intent: intentResult.intent,
      intake_session_id: workContext.intake_session_id ?? null,
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      founder_classifier_used: false,
      founder_keyword_route_used: false,
      ...traceExtras,
    },
  };
}

/**
 * goal_line / locked_scope 는 **구조화 아티팩트 또는 인테이크**에서만 온다 (founder 원문 폴백 없음).
 * @param {{
 *   threadKey: string,
 *   metadata: Record<string, unknown>,
 *   route_label?: string | null,
 *   goal_line_source: string,
 *   locked_scope_summary_source?: string | null,
 *   trace_tags?: { artifact_gated?: boolean, launch_signal?: string | null },
 * }} args
 */
export async function runFounderLaunchPipelineCore(args) {
  const {
    threadKey,
    metadata,
    route_label,
    goal_line_source,
    locked_scope_summary_source = null,
    trace_tags = {},
  } = args;

  const artifactGated = trace_tags.artifact_gated === true;
  const workContext = launchMinimalWorkContext(metadata, threadKey);
  let space = workContext.project_space || getProjectSpaceByThread(threadKey);
  const runPre = getExecutionRunByThread(threadKey);

  const goalLineProbe = String(goal_line_source || getProjectIntakeSession(metadata)?.goalLine || '').slice(0, 500);
  let spaceResolution = space ? inferResolutionFromExistingSpace(space, threadKey, goalLineProbe) : null;

  const providerTruth = buildProviderTruthSnapshot({ space, run: runPre });
  const readiness = evaluateLaunchReadiness({
    workContext,
    threadKey,
    providerSnapshot: providerTruth,
    metadata,
  });

  const phaseProbe = { phase: 'launch_gate', phase_source: 'founder_launch_gate', confidence: 1 };
  const legacyRaw = trace_tags.legacy_raw_text_launch === true;
  const intentResult = {
    intent: artifactGated ? 'artifact_gated_launch' : legacyRaw ? 'legacy_raw_text_launch_regression' : 'launch_continue',
    confidence: 1,
    signals: artifactGated
      ? ['founder_artifact_gate']
      : legacyRaw
        ? ['legacy_raw_text_launch_regression_only']
        : ['founder_launch_gate', trace_tags.launch_signal].filter(Boolean),
  };

  const live_actions = (providerTruth.providers || [])
    .filter((p) => p.status === 'live')
    .flatMap((p) => (p.actions || []).map((a) => `${p.provider}:${a}`));

  const manual_bridge_actions = [...(providerTruth.manual_bridge_actions || [])];

  if (readiness.readiness.startsWith('launch_blocked')) {
    const blockedPayload = buildLaunchBlockedPayload({
      blockers: readiness.blockers,
      readiness: readiness.readiness,
    });
    const rendered = formatFounderLaunchBlockedSurface(blockedPayload);
    return buildLaunchPipelineResult(
      rendered,
      workContext,
      { ...phaseProbe, phase_source: 'founder_launch_gate_blocked' },
      intentResult,
      route_label,
      {
        surface_type: FounderSurfaceType.LAUNCH_BLOCKED,
        launch_intent_detected: !artifactGated && !legacyRaw,
        launch_intent_signal: artifactGated || legacyRaw ? null : trace_tags.launch_signal,
        founder_artifact_gated_launch: artifactGated,
        legacy_raw_text_launch_regression: legacyRaw,
        launch_readiness: readiness.readiness,
        provider_truth_snapshot: providerTruth,
        manual_bridge_actions,
        live_actions,
        defaults_applied: readiness.defaults_applied,
        launch_packet_id: null,
        launch_gate_taken: true,
        launch_blocked: true,
        ...flattenSpaceResolutionForTrace(spaceResolution),
      },
    );
  }

  if (!space) {
    const intake = getProjectIntakeSession(metadata);
    const goalSeed =
      String(intake?.goalLine || goal_line_source).slice(0, 500).trim() || 'COS Launch';
    const { space: sp, resolution } = bootstrapProjectSpace({
      label: goalSeed,
      threadKey,
      metadata,
    });
    space = sp;
    spaceResolution = resolution;
    if (!getProjectIntakeSession(metadata)) {
      openProjectIntakeSession(metadata, { goalLine: goalSeed });
    }
  } else if (!getProjectIntakeSession(metadata)) {
    openProjectIntakeSession(metadata, {
      goalLine: String(space.human_label || goal_line_source).slice(0, 500) || 'COS Launch',
    });
  }

  let run = getExecutionRunByThread(threadKey);
  let launchPacketId = run?.packet_id || null;

  if (!run || run.status !== 'active') {
    const intake = getProjectIntakeSession(metadata);
    const goalLine = String(intake?.goalLine || space?.human_label || goal_line_source).slice(0, 500);
    const locked =
      locked_scope_summary_source?.trim()
        ? String(locked_scope_summary_source).trim().slice(0, 2000)
        : `MVP 실행 개시 — 기본값 적용: ${readiness.defaults_applied.slice(0, 2).join('; ')}`;
    const execPacket = createExecutionPacket({
      thread_key: threadKey,
      goal_line: goalLine,
      locked_scope_summary: locked,
      includes: ['모바일 반응형 웹 MVP', '외부 예약 request-first', '이메일 알림 우선'],
      excludes: ['결제 연동', 'MVP 외 필수 연동'],
      deferred_items: [],
      approval_rules: artifactGated
        ? ['founder_execution_artifact_gate']
        : legacyRaw
          ? ['founder_launch_gate_legacy_regression']
          : ['founder_launch_gate'],
      session_id: threadKey,
      requested_by: String(metadata.user || ''),
      project_id: space.project_id,
      project_label: space.human_label,
    });
    launchPacketId = execPacket.packet_id;
    run = createExecutionRun({
      packet: execPacket,
      metadata: {
        ...metadata,
        founder_origin_execution: true,
        founder_launch_via_artifact: artifactGated,
      },
    });
    linkRunToProjectSpace(space.project_id, run.run_id);
    transitionProjectIntakeStage(metadata, 'execution_running', {
      packet_id: execPacket.packet_id,
      run_id: run.run_id,
    });
  } else {
    launchPacketId = run.packet_id || launchPacketId;
  }

  const workContextFresh = launchMinimalWorkContext(metadata, threadKey);
  run = getExecutionRunByThread(threadKey) || run;
  space = getProjectSpaceByThread(threadKey) || space || workContextFresh.project_space;

  const truthAfter = buildProviderTruthSnapshot({ space, run });
  const payload = buildExecutionLaunchRenderPayload({
    run,
    space,
    providerTruth: truthAfter,
    readiness,
    manualBridgeActions: truthAfter.manual_bridge_actions,
    projectSpaceResolution: spaceResolution,
  });

  const rendered = formatFounderLaunchExecutionSurface(payload);

  const live_actions2 = (truthAfter.providers || [])
    .filter((p) => p.status === 'live')
    .flatMap((p) => (p.actions || []).map((a) => `${p.provider}:${a}`));

  return buildLaunchPipelineResult(
    rendered,
    workContextFresh,
    { ...phaseProbe, phase_source: 'founder_launch_gate' },
    intentResult,
    route_label,
    {
      surface_type: FounderSurfaceType.EXECUTION_PACKET,
      launch_intent_detected: !artifactGated && !legacyRaw,
      launch_intent_signal: artifactGated || legacyRaw ? null : trace_tags.launch_signal,
      founder_artifact_gated_launch: artifactGated,
      legacy_raw_text_launch_regression: legacyRaw,
      launch_readiness: readiness.readiness,
      provider_truth_snapshot: truthAfter,
      manual_bridge_actions: truthAfter.manual_bridge_actions,
      live_actions: live_actions2,
      defaults_applied: readiness.defaults_applied,
      launch_packet_id: launchPacketId,
      launch_gate_taken: true,
      partner_natural: false,
      ...flattenSpaceResolutionForTrace(spaceResolution),
    },
  );
}
