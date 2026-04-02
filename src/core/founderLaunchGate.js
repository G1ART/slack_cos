/**
 * Founder direct chat 직전 결정론적 launch gate → execution spine 연결.
 */

import { detectFounderLaunchIntent } from './founderLaunchIntent.js';
import { buildProviderTruthSnapshot } from './providerTruthSnapshot.js';
import { evaluateLaunchReadiness } from './launchReadinessEvaluator.js';
import {
  buildExecutionLaunchRenderPayload,
  buildLaunchBlockedPayload,
} from './executionLaunchPacketBuilder.js';
import { resolveWorkObject } from './workObjectResolver.js';
import { resolveWorkPhase } from './workPhaseResolver.js';
import { evaluatePolicy } from './policyEngine.js';
import { Actor, FounderIntent, FounderSurfaceType, WorkPhase } from './founderContracts.js';
import { renderFounderSurface } from './founderRenderer.js';
import {
  getProjectIntakeSession,
  transitionProjectIntakeStage,
  openProjectIntakeSession,
} from '../features/projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun, getExecutionRunByThread } from '../features/executionRun.js';
import { ensureExecutionRunDispatched } from '../features/executionDispatchLifecycle.js';
import { bootstrapProjectSpace } from '../features/projectSpaceBootstrap.js';
import { getProjectSpaceByThread, linkRunToProjectSpace } from '../features/projectSpaceRegistry.js';

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
      ...traceExtras,
    },
  };
}

/**
 * @returns {Promise<null | { text: string, blocks?: object[], surface_type: string, trace: object }>}
 */
export async function maybeHandleFounderLaunchGate(normalized, metadata, route_label, threadKey) {
  const probe = detectFounderLaunchIntent(normalized, metadata, threadKey);
  if (!probe.detected) return null;

  const workContext = resolveWorkObject(normalized, metadata);
  let space = workContext.project_space || getProjectSpaceByThread(threadKey);
  const runPre = getExecutionRunByThread(threadKey);

  const providerTruth = buildProviderTruthSnapshot({ space, run: runPre });
  const readiness = evaluateLaunchReadiness({
    workContext,
    threadKey,
    providerSnapshot: providerTruth,
    metadata,
  });

  const phaseProbe = resolveWorkPhase(workContext, normalized, metadata);
  const intentResult = {
    intent: FounderIntent.EXECUTION_DECISION,
    confidence: 1,
    signals: ['founder_launch_gate', probe.signal].filter(Boolean),
  };
  const policy = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_object_type: workContext.primary_type,
    work_phase: WorkPhase.SEED,
    intent_signal: intentResult.intent,
    metadata,
  });

  const live_actions = (providerTruth.providers || [])
    .filter((p) => p.status === 'live')
    .flatMap((p) => (p.actions || []).map((a) => `${p.provider}:${a}`));

  const manual_bridge_actions = [...(providerTruth.manual_bridge_actions || [])];

  if (readiness.readiness.startsWith('launch_blocked')) {
    const blockedPayload = buildLaunchBlockedPayload({
      blockers: readiness.blockers,
      readiness: readiness.readiness,
    });
    const rendered = renderFounderSurface(FounderSurfaceType.LAUNCH_BLOCKED, blockedPayload);
    return buildLaunchPipelineResult(
      rendered,
      workContext,
      { ...phaseProbe, phase_source: 'founder_launch_gate_blocked' },
      intentResult,
      route_label,
      {
        surface_type: FounderSurfaceType.LAUNCH_BLOCKED,
        launch_intent_detected: true,
        launch_intent_signal: probe.signal,
        launch_readiness: readiness.readiness,
        provider_truth_snapshot: providerTruth,
        manual_bridge_actions,
        live_actions,
        defaults_applied: readiness.defaults_applied,
        launch_packet_id: null,
        launch_gate_taken: true,
        launch_blocked: true,
      },
    );
  }

  if (!space) {
    const intake = getProjectIntakeSession(metadata);
    const goalSeed = String(intake?.goalLine || normalized).slice(0, 500).trim() || 'COS Launch';
    const { space: sp } = bootstrapProjectSpace({
      label: goalSeed,
      threadKey,
      metadata,
    });
    space = sp;
    if (!getProjectIntakeSession(metadata)) {
      openProjectIntakeSession(metadata, { goalLine: goalSeed });
    }
  } else if (!getProjectIntakeSession(metadata)) {
    openProjectIntakeSession(metadata, {
      goalLine: String(space.human_label || normalized).slice(0, 500) || 'COS Launch',
    });
  }

  let run = getExecutionRunByThread(threadKey);
  let launchPacketId = run?.packet_id || null;

  if (!run || run.status !== 'active') {
    const intake = getProjectIntakeSession(metadata);
    const goalLine = String(intake?.goalLine || space?.human_label || normalized).slice(0, 500);
    const locked = `MVP 실행 개시 — 기본값 적용: ${readiness.defaults_applied.slice(0, 2).join('; ')}`;
    const execPacket = createExecutionPacket({
      thread_key: threadKey,
      goal_line: goalLine,
      locked_scope_summary: locked,
      includes: ['모바일 반응형 웹 MVP', '외부 예약 request-first', '이메일 알림 우선'],
      excludes: ['결제 연동', 'MVP 외 필수 연동'],
      deferred_items: [],
      approval_rules: ['founder_launch_gate'],
      session_id: threadKey,
      requested_by: String(metadata.user || ''),
      project_id: space.project_id,
      project_label: space.human_label,
    });
    launchPacketId = execPacket.packet_id;
    run = createExecutionRun({ packet: execPacket, metadata });
    linkRunToProjectSpace(space.project_id, run.run_id);
    ensureExecutionRunDispatched(run, metadata);
    transitionProjectIntakeStage(metadata, 'execution_running', {
      packet_id: execPacket.packet_id,
      run_id: run.run_id,
    });
  } else if (run.outbound_dispatch_state === 'not_started') {
    ensureExecutionRunDispatched(run, metadata);
    launchPacketId = run.packet_id;
  }

  const workContextFresh = resolveWorkObject(normalized, metadata);
  const truthAfter = buildProviderTruthSnapshot({ space, run });
  const payload = buildExecutionLaunchRenderPayload({
    run,
    space,
    providerTruth: truthAfter,
    readiness,
    manualBridgeActions: truthAfter.manual_bridge_actions,
  });

  const rendered = renderFounderSurface(FounderSurfaceType.EXECUTION_PACKET, payload);

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
      launch_intent_detected: true,
      launch_intent_signal: probe.signal,
      launch_readiness: readiness.readiness,
      provider_truth_snapshot: truthAfter,
      manual_bridge_actions: truthAfter.manual_bridge_actions,
      live_actions: live_actions2,
      defaults_applied: readiness.defaults_applied,
      launch_packet_id: launchPacketId,
      launch_gate_taken: true,
      partner_natural: false,
    },
  );
}
