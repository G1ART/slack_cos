/**
 * vNext.13.1 — 오퍼레이터/채널 constitutional spine 전용.
 * 창업자 면은 `src/founder/founderDirectKernel.js` → `runFounderDirectKernel` 만 사용 (app.js / AI 라우터 가드).
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
  buildProviderTruthSnapshot,
  formatProviderTruthLines,
  formatProviderTruthFriendlyLines,
} from './providerTruthSnapshot.js';
import {
  openProjectIntakeSession,
  isActiveProjectIntake,
  getProjectIntakeSession,
  transitionProjectIntakeStage,
  hasOpenExecutionOwnership,
} from '../features/projectIntakeSession.js';
import {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunById,
  getExecutionRunByThread,
} from '../features/executionRun.js';
import { formatReconciliationLinesForFounder } from '../orchestration/truthReconciliation.js';
import { getProjectSpaceByThread } from '../features/projectSpaceRegistry.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import { evaluateExecutionRunCompletion } from '../features/executionDispatchLifecycle.js';
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

/**
 * work object 파서 없이 스레드·인테이크에서만 맥락 로드 (오퍼레이터 spine).
 */
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

// ---------------------------------------------------------------------------
// Executor — delegates to existing code by phase
// ---------------------------------------------------------------------------

async function routeToExecutor(phase, policy, normalized, metadata, workContext, callText) {
  switch (phase) {
    case WorkPhase.DISCOVER:
      return await executeDiscovery(normalized, metadata, workContext, callText);

    case WorkPhase.ALIGN:
      return await executeAlign(normalized, metadata, workContext, callText);

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

async function executeDiscovery(normalized, metadata, workContext, callText) {
  return { packet: await buildAdaptiveDialoguePacket(normalized, metadata, 'kickoff', callText) };
}

async function executeAlign(normalized, metadata, workContext, callText) {
  return { packet: await buildAdaptiveDialoguePacket(normalized, metadata, 'followup', callText) };
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
  const freshRun = run?.run_id ? getExecutionRunById(run.run_id) : null;
  const completion = run?.run_id ? evaluateExecutionRunCompletion(run.run_id) : null;
  const providerTruthPayload = () => {
    const snap = buildProviderTruthSnapshot({ space: workContext.project_space ?? null, run: freshRun || run });
    const recon = freshRun ? formatReconciliationLinesForFounder(freshRun) : [];
    const baseTruth = formatProviderTruthLines(snap);
    const baseFriendly = formatProviderTruthFriendlyLines(snap);
    return {
      provider_truth: [...baseTruth, ...recon],
      provider_truth_friendly: [...baseFriendly, ...recon],
    };
  };

  if (completion?.overall_status === 'completed') {
    return {
      packet: buildHandoffPacket({
        project_ref: run?.project_id || 'project_space_pending',
        run_ref: run?.run_id || 'run_pending',
        dispatched_workstreams: completion.completed_lanes?.length
          ? completion.completed_lanes
          : ['research_benchmark', 'fullstack_swe', 'uiux_design', 'qa_qc'],
        ...providerTruthPayload(),
        founder_next_action:
          '정본(reconciliation)상 전 경로 satisfied — 결과·배포 여부만 확인하면 됩니다.',
      }),
    };
  }
  if (completion?.overall_status === 'manual_blocked' || completion?.overall_status === 'failed') {
    return {
      packet: buildStatusPacket({
        current_stage: run?.current_stage || 'execute',
        completed: completion.completed_lanes?.length ? completion.completed_lanes : ['scope lock 완료', 'run 생성'],
        in_progress: [],
        blocker: completion.next_actions?.join(' | ') || run?.outbound_last_error || '수동 의사결정 필요',
        ...providerTruthPayload(),
        next_actions: completion.next_actions?.length ? completion.next_actions : ['블로커 해소 의사결정'],
        founder_action_required: '크리티컬 의사결정이 필요합니다. 우선순위/재시도/수동조치를 확정해 주세요.',
      }),
    };
  }
  if (
    completion?.overall_status === 'draft_only' ||
    completion?.overall_status === 'observe_only' ||
    completion?.overall_status === 'partial'
  ) {
    return {
      packet: buildStatusPacket({
        current_stage: run?.current_stage || 'execute',
        completed: completion.completed_lanes?.length ? completion.completed_lanes : [],
        in_progress:
          completion.overall_status === 'partial' ? ['일부 경로 대기'] : ['draft/관측 단계'],
        blocker: completion.next_actions?.join(' | ') || completion.overall_status,
        ...providerTruthPayload(),
        next_actions: completion.next_actions?.length
          ? completion.next_actions
          : ['부족한 툴 ref를 채우면 정본이 completed로 올라갑니다.'],
        founder_action_required: `실행 정본 상태: ${completion.overall_status} — lane 휴리스틱이 아니라 reconciliation만 참고했습니다.`,
      }),
    };
  }

  const authSt = freshRun?.external_execution_authorization?.state;
  if (run?.run_id && authSt !== 'authorized') {
    return {
      packet: buildStatusPacket({
        current_stage: 'awaiting_founder_approval',
        completed: run ? ['범위·실행 패킷 준비(해당 시)'] : [],
        in_progress: ['승인 대기 — 외부 mutation 보류', 'COS·내부 초안 단계만'],
        blocker: '대표 승인 전: GitHub/Cursor/Supabase/배포로의 자동 디스패치 없음',
        ...providerTruthPayload(),
        next_actions: [
          '승인 패킷에서 범위 확정',
          freshRun?.outbound_dispatch_state === 'not_started'
            ? '승인 후에만 오케스트레이션 디스패치가 시작됩니다'
            : '승인·디스패치 상태를 확인해 주세요',
        ],
        founder_action_required:
          '지금 단계: *승인 대기* — "곧 외부 실행"이 아니라, 승인·범위 확정 전까지 내부 준비만 진행됩니다.',
      }),
    };
  }

  return {
    packet: buildStatusPacket({
      current_stage: run?.current_stage || 'execute',
      completed: run ? ['scope lock 완료', 'run 생성'] : ['scope lock 후보 합의'],
      in_progress: ['workstream 실행 정렬'],
      blocker: run?.outbound_last_error || '없음',
      ...providerTruthPayload(),
      next_actions: ['오케스트레이션 실행 중'],
      founder_action_required: '승인 완료 후 오케스트레이션 진행 중입니다. 크리티컬 결정/완료 시점에만 확인하면 됩니다.',
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
// Pipeline entry point (operator / channel only)
// ---------------------------------------------------------------------------

/**
 * @param {{ text: string, metadata?: Record<string, unknown>, route_label?: string }} input
 * @returns {Promise<{ text: string, blocks?: object[], trace: Record<string, unknown> } | null>}
 */
export async function founderRequestPipeline({ text, metadata = {}, route_label } = {}) {
  const normalized = normalizeFounderMetaCommandLine(String(text || '').trim());
  const callText = typeof metadata.callText === 'function' ? metadata.callText : null;
  const threadKey = buildSlackThreadKey(metadata);

  // 1. Work Object Resolver — 오퍼레이터/채널 전용 (창업자는 runFounderDirectKernel)
  let gold = classifyGoldContract(normalized, metadata);
  let workContext = resolveWorkObject(normalized, metadata);

  // 2. Intent classifier — supplementary signal (창업자 면은 위에서 자연어 단일 경로로 이미 처리됨)
  const intentResult = classifyFounderIntent(normalized, metadata);
  if (
    gold.intent != null &&
    (intentResult.intent === FounderIntent.UNKNOWN || intentResult.intent === FounderIntent.UNKNOWN_EXPLORATORY)
  ) {
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

  if (
    intentResult.intent === FounderIntent.QUERY_LOOKUP ||
    intentResult.intent === FounderIntent.STRUCTURED_COMMAND
  ) {
    return null;
  }

  if (gold.kind === 'kickoff' && !isActiveProjectIntake(metadata)) {
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

  // 5. For phases we don't handle yet → 레거시 라우터로 위임
  if (!PIPELINE_HANDLED_PHASES.has(phase)) {
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
    const freshRun = run?.run_id ? getExecutionRunById(run.run_id) : null;
    const r = freshRun || run;
    const authSt = r?.external_execution_authorization?.state;
    const pendingExternal = Boolean(run && authSt !== 'authorized');
    const statusSnap = buildProviderTruthSnapshot({ space: workContext.project_space ?? null, run: r ?? null });
    const statusTruth = formatProviderTruthLines(statusSnap);
    const statusFriendly = formatProviderTruthFriendlyLines(statusSnap);
    const reconLines = freshRun ? formatReconciliationLinesForFounder(freshRun) : [];
    const completion = run?.run_id ? evaluateExecutionRunCompletion(run.run_id) : null;
    const reconBit =
      completion?.completion_source === 'truth_reconciliation'
        ? `실행 정본(reconciliation): ${completion.overall_status}`
        : '';
    const rendered = renderFounderSurface('status_report_surface', buildStatusPacket({
      current_stage: pendingExternal ? 'awaiting_founder_approval' : run?.current_stage || (isActiveProjectIntake(metadata) ? 'align' : 'discover'),
      completed: run ? ['scope lock 완료', 'run 생성'] : ['문제 재정의'],
      in_progress: pendingExternal
        ? ['승인 대기 — 외부 디스패치 보류', 'COS·내부 준비만']
        : run
          ? ['workstream 실행']
          : ['scope lock 논의'],
      blocker: pendingExternal
        ? '대표 승인 전까지 GitHub/Cursor/Supabase/배포 자동 실행 없음'
        : run?.outbound_last_error || '없음',
      provider_truth: [...statusTruth, ...reconLines],
      provider_truth_friendly: [...statusFriendly, ...reconLines],
      next_actions: run ? ['blocker 해소', '승인 패킷 업데이트', '배포 준비'] : ['핵심 결정 3개 확정', 'scope lock packet 생성'],
      founder_action_required: pendingExternal
        ? `*승인 대기* — 외부 mutation은 명시 승인 후에만 진행됩니다.${reconBit ? ` ${reconBit}` : ''}`
        : completion?.completion_source === 'truth_reconciliation'
          ? reconBit || '상태 확인'
          : run
            ? '상태 확인 또는 우선순위 조정'
            : 'scope lock 확정',
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
        provider_truth: [
          'github: 대표 승인 전 외부 디스패치 없음 (pending_approval)',
          'cursor: 승인 후 ensureExecutionRunDispatched',
          'supabase: 승인 후에만 적용 경로',
        ],
      }),
    });
    return buildResult(rendered, { workContext, phaseResult: { ...phaseResult, phase }, intentResult, policy, route_label });
  }

  // 7. Route to executor
  const executorResult = await routeToExecutor(phase, policy, normalized, metadata, workContext, callText);
  if (executorResult === null) {
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

async function buildAdaptiveDialoguePacket(normalized, metadata, mode, callText) {
  const basePacket = buildDialoguePacket(normalized, mode);
  if (typeof callText !== 'function') return basePacket;

  try {
    const threadKey = buildSlackThreadKey(metadata);
    const priorTranscript = getConversationTranscript(threadKey);
    const generated = await runCosNaturalPartner({
      callText,
      userText: normalized,
      channelContext: null,
      route: { primary_agent: 'founder_kernel', include_risk: true, urgency: 'normal' },
      priorTranscript,
    });
    const text = String(generated || '').trim();
    if (!text) return basePacket;

    const lines = text
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(0, 8);
    const firstLine = lines[0] || '';
    const riskLine =
      lines.find((line) => /리스크|우선|주의|트레이드오프|가정/.test(line)) ||
      lines[1] ||
      '';
    const questionLine = lines.find((line) => line.includes('?')) || '';

    return {
      ...basePacket,
      reframed_problem: firstLine || basePacket.reframed_problem,
      pushback_point: riskLine || basePacket.pushback_point,
      next_step: questionLine
        ? `${questionLine} 이 1개만 확정되면 scope lock 후보안을 제시하겠습니다.`
        : basePacket.next_step,
    };
  } catch {
    return basePacket;
  }
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
  const { surface_type: surfaceOverride, ...restTraceExtras } = traceExtras;
  const surface_type = surfaceOverride ?? policy.required_surface_type;
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
      intake_session_id: intakeSession,
      responder: 'founder_kernel',
      passed_pipeline: true,
      passed_renderer: true,
      legacy_router_used: false,
      legacy_command_router_used: false,
      ...restTraceExtras,
    },
  };
}
