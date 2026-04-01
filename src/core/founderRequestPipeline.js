/**
 * COS Constitution v1.1 — Single inbound pipeline (work-state-first).
 * Center of gravity: work_object → work_phase → policy → packet → surface.
 * Called before legacy routers. Returns null if the pipeline cannot fully handle the request.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_PIPELINE

import { WorkPhase, FounderIntent, FounderSurfaceType, SAFE_FALLBACK_TEXT, Actor } from './founderContracts.js';
import { resolveWorkObject } from './workObjectResolver.js';
import { resolveWorkPhase } from './workPhaseResolver.js';
import { classifyFounderIntent } from './founderIntentClassifier.js';
import { evaluatePolicy } from './policyEngine.js';
import { resolveSurfaceType } from './founderSurfaceRegistry.js';
import { assemblePacket, makeUtilityPacket } from './packetAssembler.js';
import { renderFounderSurface } from './founderRenderer.js';
import { validateDialogueContract, isForbiddenFounderFallbackIntent } from './founderConversationContracts.js';
import { FounderHardFailReason, buildFounderHardFail } from './founderHardFailRules.js';

import {
  classifyFounderRoutingLock,
  formatRuntimeMetaSurfaceText,
  formatMetaDebugSurfaceText,
  normalizeFounderMetaCommandLine,
} from '../features/inboundFounderRoutingLock.js';
import { formatExecutiveHelpText } from '../features/executiveSurfaceHelp.js';
import {
  classifyGoldContract,
  buildDialoguePacket,
  buildScopeLockPacket,
  buildStatusPacket,
  buildHandoffPacket,
} from './founderGoldContract.js';
import {
  openProjectIntakeSession,
  isActiveProjectIntake,
  transitionProjectIntakeStage,
  hasOpenExecutionOwnership,
} from '../features/projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun } from '../features/executionRun.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';

/**
 * Utility intents the pipeline handles regardless of work object state.
 */
const UTILITY_INTENTS = new Set([
  FounderIntent.RUNTIME_META,
  FounderIntent.META_DEBUG,
  FounderIntent.HELP,
]);

/**
 * Phases the pipeline delegates to existing executors (golden path).
 * Phases NOT in this set → null (legacy routers handle).
 */
const PIPELINE_HANDLED_PHASES = new Set([
  WorkPhase.DISCOVER,
  WorkPhase.ALIGN,
  WorkPhase.LOCK,
  WorkPhase.SEED,
  WorkPhase.EXECUTE,
  WorkPhase.REVIEW,
  WorkPhase.APPROVE,
  WorkPhase.DEPLOY,
  WorkPhase.MONITOR,
  WorkPhase.EXCEPTION,
]);

// ---------------------------------------------------------------------------
// Executor — delegates to existing code by phase
// ---------------------------------------------------------------------------

async function routeToExecutor(phase, policy, normalized, metadata, workContext) {
  switch (phase) {
    case WorkPhase.DISCOVER:
      return await executeDiscovery(normalized, metadata, workContext);

    case WorkPhase.ALIGN:
      return await executeAlign(normalized, metadata, workContext);

    case WorkPhase.LOCK:
      return await executeLock(normalized, metadata, workContext);

    case WorkPhase.SEED:
    case WorkPhase.EXECUTE:
    case WorkPhase.REVIEW:
      return await executeSpine(normalized, metadata, workContext);

    case WorkPhase.APPROVE:
      return await executeApproval(normalized, metadata, workContext);

    case WorkPhase.DEPLOY:
      return await executeDeploy(normalized, metadata, workContext);

    case WorkPhase.MONITOR:
      return { text: '*[모니터링]* 배포 완료 상태입니다. 추가 지시가 있으면 말씀해 주세요.' };

    case WorkPhase.EXCEPTION:
      return { text: SAFE_FALLBACK_TEXT, error_summary: '처리 중 예외가 발생했습니다.' };

    default:
      return null;
  }
}

async function executeDiscovery(normalized, metadata, workContext) {
  return { packet: buildDialoguePacket(normalized, 'kickoff') };
}

async function executeAlign(normalized, metadata, workContext) {
  return { packet: buildDialoguePacket(normalized, 'followup') };
}

async function executeLock(normalized, metadata, workContext) {
  try {
    const { tryStartProjectLockConfirmedResponse } = await import('../features/startProjectLockConfirmed.js');
    const result = await tryStartProjectLockConfirmedResponse(normalized, metadata);
    if (result) {
      return {
        text: result.text,
        blocks: result.blocks,
        packet_id: result.packet_id,
        run_id: result.run_id,
        goal_line: result.goal_line,
        locked_scope_summary: result.locked_scope_summary,
      };
    }
  } catch { /* fallthrough */ }
  return null;
}

async function executeSpine(normalized, metadata, workContext) {
  const run = workContext.run || null;
  return {
    packet: buildStatusPacket({
      current_stage: run?.current_stage || 'execute',
      completed: run ? ['scope lock 완료', 'run 생성'] : ['scope lock 후보 합의'],
      in_progress: ['workstream 실행 정렬'],
      blocker: run?.outbound_last_error || '없음',
      provider_truth: run
        ? ['github: live_or_bridge', 'cursor: live_or_bridge', 'supabase: optional']
        : ['github: 없음', 'cursor: 없음', 'supabase: 없음'],
      next_actions: ['핵심 실행 항목 3개 확정', '우선순위 지정', '승인/배포 전환 준비'],
      founder_action_required: '실행 우선순위 확인',
    }),
  };
}

async function executeApproval(normalized, metadata, workContext) {
  return { packet: buildHandoffPacket() };
}

async function executeDeploy(normalized, metadata, workContext) {
  return {
    packet: buildStatusPacket({
      current_stage: 'deploy',
      in_progress: ['배포 준비/검증'],
      next_actions: ['승인 패킷 확인', '배포 연결', '완료 보고'],
      founder_action_required: '배포 승인 여부 확인',
    }),
  };
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * @param {{ text: string, metadata?: Record<string, unknown>, route_label?: string }} input
 * @returns {Promise<{ text: string, blocks?: object[], trace: Record<string, unknown> } | null>}
 */
export async function founderRequestPipeline({ text, metadata = {}, route_label } = {}) {
  const normalized = normalizeFounderMetaCommandLine(String(text || '').trim());
  const founderRoute = metadata.source_type === 'direct_message' || metadata.source_type === 'channel_mention';
  const threadKey = buildSlackThreadKey(metadata);
  const gold = classifyGoldContract(normalized, metadata);

  // 1. Work Object Resolver — "which project/run/session does this turn belong to?"
  let workContext = resolveWorkObject(normalized, metadata);

  // 2. Intent classifier — supplementary signal
  const intentResult = classifyFounderIntent(normalized, metadata);
  if (gold.intent && (intentResult.intent === FounderIntent.UNKNOWN || intentResult.intent === FounderIntent.UNKNOWN_EXPLORATORY)) {
    intentResult.intent = gold.intent;
  }

  const routeLock = classifyFounderRoutingLock(normalized);
  if (routeLock?.kind === 'version') {
    intentResult.intent = FounderIntent.RUNTIME_META;
  } else if (routeLock?.kind === 'meta_debug') {
    intentResult.intent = FounderIntent.META_DEBUG;
  }

  // 3. Handle utility intents regardless of work object (version, meta, help)
  if (UTILITY_INTENTS.has(intentResult.intent)) {
    return handleUtilityIntent(intentResult, normalized, metadata, workContext, route_label);
  }

  // 구조화 조회·명령은 `runInboundCommandRouter` 전용 (파이프라인이 대화로 삼키지 않음)
  if (
    intentResult.intent === FounderIntent.QUERY_LOOKUP ||
    intentResult.intent === FounderIntent.STRUCTURED_COMMAND
  ) {
    return null;
  }

  if (founderRoute && gold.kind === 'kickoff' && !isActiveProjectIntake(metadata)) {
    openProjectIntakeSession(metadata, { goalLine: normalized });
    workContext = resolveWorkObject(normalized, metadata);
  }

  // 4. Work Phase Resolver
  const phaseResult = resolveWorkPhase(workContext, normalized, metadata);
  let phase = phaseResult.phase;
  if (gold.kind === 'scope_lock_request') phase = WorkPhase.LOCK;
  if (gold.kind === 'status') phase = hasOpenExecutionOwnership(metadata) ? WorkPhase.EXECUTE : WorkPhase.ALIGN;
  if (gold.kind === 'approval') phase = WorkPhase.APPROVE;
  if (gold.kind === 'deploy') phase = WorkPhase.DEPLOY;

  // 5. For phases we don't handle yet → founder는 대화 계약 폴백, 비대표만 레거시
  if (!PIPELINE_HANDLED_PHASES.has(phase)) {
    if (founderRoute) {
      return founderKernelHardFail(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        FounderHardFailReason.UNSUPPORTED_FOUNDER_INTENT,
        'founder_unhandled_phase',
      );
    }
    return null;
  }

  // 6. Policy Engine
  const policy = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_object_type: workContext.primary_type,
    work_phase: phase,
    intent_signal: intentResult.intent,
    metadata,
  });

  if (!policy.allow) {
    return founderKernelHardFail(
      normalized,
      metadata,
      workContext,
      intentResult,
      route_label,
      FounderHardFailReason.INVARIANT_BREACH,
      'policy_denied',
      { phaseResult }
    );
  }

  if (gold.kind === 'status') {
    const run = workContext.run;
    const rendered = renderFounderSurface('status_report_surface', buildStatusPacket({
      current_stage: run?.current_stage || (isActiveProjectIntake(metadata) ? 'align' : 'discover'),
      completed: run ? ['scope lock 완료', 'run 생성'] : ['문제 재정의'],
      in_progress: run ? ['workstream 실행'] : ['scope lock 논의'],
      blocker: run?.outbound_last_error || '없음',
      provider_truth: run
        ? [
            `github: ${run.git_trace?.repo ? 'live' : 'manual_bridge'}`,
            `cursor: ${run.cursor_trace?.length ? 'live' : 'manual_bridge'}`,
            `supabase: ${run.supabase_trace?.length ? 'live' : 'manual_bridge'}`,
          ]
        : ['github: 없음', 'cursor: 없음', 'supabase: 없음'],
      next_actions: run ? ['blocker 해소', '승인 패킷 업데이트', '배포 준비'] : ['핵심 결정 3개 확정', 'scope lock packet 생성'],
      founder_action_required: run ? '상태 확인 또는 우선순위 조정' : 'scope lock 확정',
    }));
    return buildResult(rendered, { workContext, phaseResult: { ...phaseResult, phase }, intentResult, policy, route_label });
  }

  if (gold.kind === 'approval' && !workContext.run) {
    const prelockPacket = {
      ...buildDialoguePacket(normalized, 'approval_prelock'),
      next_step: '아직 scope lock 전입니다. 먼저 범위를 잠그면 즉시 run/orchestration으로 넘기겠습니다.',
    };
    const quality = validateDialogueContract(prelockPacket);
    if (!quality.ok) {
      return founderKernelHardFail(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        FounderHardFailReason.INVARIANT_BREACH,
        'approval_prelock_dialogue_quality_fail',
      );
    }
    const rendered = renderFounderSurface('dialogue_surface', prelockPacket);
    return buildResult(rendered, { workContext, phaseResult: { ...phaseResult, phase: WorkPhase.ALIGN }, intentResult, policy, route_label });
  }

  if (gold.kind === 'scope_lock_request') {
    const scope = buildScopeLockPacket(normalized, metadata);
    const execPacket = createExecutionPacket({
      thread_key: threadKey,
      goal_line: scope.problem_definition,
      locked_scope_summary: scope.mvp_scope.join(', '),
      includes: scope.mvp_scope,
      excludes: scope.excluded_scope,
      deferred_items: [],
      approval_rules: ['founder_approval_required'],
      session_id: threadKey,
      requested_by: String(metadata.user || ''),
      project_label: scope.project_name,
      project_id: workContext.project_id || null,
    });
    const run = createExecutionRun({ packet: execPacket, metadata });
    transitionProjectIntakeStage(metadata, 'execution_ready', {
      packet_id: execPacket.packet_id,
      run_id: run.run_id,
    });
    const rendered = renderFounderSurface('scope_lock_packet_surface', {
      ...scope,
      packet_id: execPacket.packet_id,
      run_id: run.run_id,
      handoff: buildHandoffPacket({
        project_ref: scope.project_name,
        run_ref: run.run_id,
        provider_truth: ['github: manual_bridge', 'cursor: manual_bridge', 'supabase: manual_bridge'],
      }),
    });
    return buildResult(rendered, { workContext, phaseResult: { ...phaseResult, phase }, intentResult, policy, route_label });
  }

  // 7. Route to executor
  const executorResult = await routeToExecutor(phase, policy, normalized, metadata, workContext);
  if (executorResult === null) {
    if (founderRoute) {
      return founderKernelHardFail(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        FounderHardFailReason.UNSUPPORTED_FOUNDER_INTENT,
        'founder_executor_miss',
      );
    }
    return null;
  }

  // 8. Packet Assembler
  const packet = assemblePacket(executorResult, workContext, { ...phaseResult, phase });

  // 9. Surface type from policy
  const surfaceType = resolveSurfaceType(policy, phase);

  if (surfaceType === FounderSurfaceType.DIALOGUE) {
    const quality = validateDialogueContract(packet);
    if (!quality.ok) {
      return founderKernelHardFail(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        FounderHardFailReason.INVARIANT_BREACH,
        'dialogue_quality_fail',
      );
    }
  }

  // 10. Render
  const rendered = renderFounderSurface(surfaceType, packet);

  return buildResult(rendered, { workContext, phaseResult, intentResult, policy, route_label });
}

// ---------------------------------------------------------------------------
// Founder kernel fallback — reconstruction P0: never return null for natural-language founder turns
// ---------------------------------------------------------------------------

function founderKernelHardFail(
  normalized,
  metadata,
  workContext,
  intentResult,
  route_label,
  reason,
  phaseSource,
  extras = {},
) {
  const fallbackBlocked = isForbiddenFounderFallbackIntent(intentResult.intent);
  const fail = buildFounderHardFail(
    fallbackBlocked ? FounderHardFailReason.INVARIANT_BREACH : reason,
    { blocked_fallback: fallbackBlocked },
  );
  const policy = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_object_type: workContext.primary_type,
    work_phase: extras.phaseResult?.phase || WorkPhase.EXCEPTION,
    intent_signal: intentResult.intent,
    metadata,
  });
  const rendered = renderFounderSurface('safe_fallback_surface', { text: fail.text });
  return buildResult(
    rendered,
    {
      workContext,
      phaseResult: extras.phaseResult || { phase: WorkPhase.EXCEPTION, phase_source: phaseSource, confidence: 1 },
      intentResult,
      policy,
      route_label,
    },
    { hard_fail_reason: fail.reason, blocked_fallback: fallbackBlocked },
  );
}

// ---------------------------------------------------------------------------
// Utility intent handler
// ---------------------------------------------------------------------------

function handleUtilityIntent(intentResult, normalized, metadata, workContext, route_label) {
  let payload;
  switch (intentResult.intent) {
    case FounderIntent.RUNTIME_META:
      payload = { text: formatRuntimeMetaSurfaceText() };
      break;
    case FounderIntent.META_DEBUG:
      payload = { text: formatMetaDebugSurfaceText() };
      break;
    case FounderIntent.HELP:
      payload = { text: formatExecutiveHelpText() };
      break;
    default:
      payload = { text: SAFE_FALLBACK_TEXT };
  }

  const policy = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_phase: WorkPhase.UTILITY,
    intent_signal: intentResult.intent,
    metadata,
  });
  const surfaceType = resolveSurfaceType(policy, WorkPhase.UTILITY);
  const packet = makeUtilityPacket(payload, workContext);
  const rendered = renderFounderSurface(surfaceType, packet);

  return buildResult(rendered, {
    workContext,
    phaseResult: { phase: WorkPhase.UTILITY, phase_source: 'utility_intent', confidence: 1 },
    intentResult,
    policy,
    route_label,
  });
}

// ---------------------------------------------------------------------------
// Result builder
// ---------------------------------------------------------------------------

function buildResult(rendered, { workContext, phaseResult, intentResult, policy, route_label }, traceExtras = {}) {
  const intakeSession = workContext.intake_session_id || null;
  return {
    text: rendered.text,
    blocks: rendered.blocks,
    trace: {
      work_object: {
        type: workContext.primary_type,
        id: workContext.run_id || workContext.project_id || null,
      },
      work_phase: phaseResult.phase,
      phase_source: phaseResult.phase_source,
      intent_signal: intentResult.intent,
      intent_confidence: intentResult.confidence,
      surface_type: policy.required_surface_type,
      route_label: route_label || null,
      responder_kind: 'founder_kernel',
      pipeline_version: 'v1.1',
      input_text: rendered.text,
      intent: intentResult.intent,
      intake_session_id: intakeSession,
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      ...traceExtras,
    },
  };
}
