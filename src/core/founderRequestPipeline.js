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
  classifyFounderOperationalProbe,
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
  PROVIDER_STATUS_KO,
} from './providerTruthSnapshot.js';
import {
  openProjectIntakeSession,
  isActiveProjectIntake,
  transitionProjectIntakeStage,
  hasOpenExecutionOwnership,
} from '../features/projectIntakeSession.js';
import { createExecutionPacket, createExecutionRun } from '../features/executionRun.js';
import { buildSlackThreadKey, getConversationTranscript } from '../features/slackConversationBuffer.js';
import { runCosNaturalPartner } from '../features/cosNaturalPartner.js';
import { sanitizePartnerNaturalLlmOutput } from '../features/founderSurfaceGuard.js';
import { ensureExecutionRunDispatched, evaluateExecutionRunCompletion } from '../features/executionDispatchLifecycle.js';
/**
 * Founder direct natural 경로 직전 launch gate (LLM 이전, 결정론).
 * 구현 본문: `founderLaunchGate.js` → `detectFounderLaunchIntent` · `buildProviderTruthSnapshot` ·
 * `evaluateLaunchReadiness` · `buildExecutionLaunchRenderPayload` / `buildLaunchBlockedPayload` ·
 * `bootstrapProjectSpace` / `getProjectSpaceByThread` · `createExecutionPacket` · `createExecutionRun` ·
 * `ensureExecutionRunDispatched`(단일 디스패치 진입점; `dispatchOutboundActionsForRun` 직접 호출 없음) ·
 * `renderFounderSurface(EXECUTION_PACKET|LAUNCH_BLOCKED)`.
 * trace: `launch_gate_taken`, `launch_intent_detected`, `launch_intent_signal`, `launch_readiness`,
 * `provider_truth_snapshot`, `manual_bridge_actions`, `defaults_applied`, `launch_packet_id`.
 */
import { maybeHandleFounderLaunchGate } from './founderLaunchGate.js';
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

/** `COS_FOUNDER_DIRECT_CHAT=0` 이면 3b 직답 경로 비활성(레거시 패킷·대화 계약 경로로 복귀) */
function isFounderDirectNaturalChatEnabled() {
  const v = String(process.env.COS_FOUNDER_DIRECT_CHAT ?? '1').trim().toLowerCase();
  return v !== '0' && v !== 'false' && v !== 'no' && v !== 'off';
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
  const completion = run?.run_id ? evaluateExecutionRunCompletion(run.run_id) : null;
  const providerTruthPayload = () => {
    const snap = buildProviderTruthSnapshot({ space: workContext.project_space ?? null, run });
    return {
      provider_truth: formatProviderTruthLines(snap),
      provider_truth_friendly: formatProviderTruthFriendlyLines(snap),
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
        founder_next_action: '완료 결과를 확인하고 배포/확장 여부를 결정해 주세요.',
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
  return {
    packet: buildStatusPacket({
      current_stage: run?.current_stage || 'execute',
      completed: run ? ['scope lock 완료', 'run 생성'] : ['scope lock 후보 합의'],
      in_progress: ['workstream 실행 정렬'],
      blocker: run?.outbound_last_error || '없음',
      ...providerTruthPayload(),
      next_actions: ['오케스트레이션 실행 중'],
      founder_action_required: '현재 오케스트레이션 진행 중입니다. 크리티컬 결정/완료 시점에만 확인하면 됩니다.',
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

/**
 * 창업자 면(DM/멘션) + LLM 호출 가능 시 **유일한** 표면: 키워드·골드·접두·의도 분류 없이 자연어 1패스.
 * (테스트·가드 경로는 `callText` 없음 또는 `COS_FOUNDER_DIRECT_CHAT=0` 일 때만 아래 헌법 파이프라인으로 내려감)
 */
function formatFounderProviderProbeSurfaceText(probeKind, snap) {
  const cursor = snap.providers.find((p) => p.provider === 'cursor_cloud');
  const sb = snap.providers.find((p) => p.provider === 'supabase');
  if (probeKind === 'provider_cursor') {
    const ko = cursor ? (PROVIDER_STATUS_KO[cursor.status] || cursor.status) : '?';
    return [
      `*[COS에 연결된 Cursor Cloud 브리지]*`,
      cursor
        ? `- COS 판정: \`${cursor.status}\` (${ko})`
        : '- provider 스냅샷 없음',
      cursor?.note ? `- 상세: ${cursor.note}` : null,
      '',
      '_참고: AI 코딩 툴 “Cursor”의 시장·제품 평가가 아니라, 이 런타임의 **launch URL·핸드오프·디스패치 트레이스** 기준 연동 상태입니다._',
    ]
      .filter(Boolean)
      .join('\n');
  }
  if (probeKind === 'provider_supabase') {
    const ko = sb ? (PROVIDER_STATUS_KO[sb.status] || sb.status) : '?';
    return [
      `*[COS에 연결된 Supabase]*`,
      sb ? `- COS 판정: \`${sb.status}\` (${ko})` : '- provider 스냅샷 없음',
      sb?.note ? `- 상세: ${sb.note}` : null,
      '',
      '_참고: 실제 DB ping은 배포 환경의 `SUPABASE_URL`/키·네트워크에 달립니다. COS는 프로젝트 연결·드래프트·live dispatch 준비도를 위와 같이 표시합니다._',
    ]
      .filter(Boolean)
      .join('\n');
  }
  return SAFE_FALLBACK_TEXT;
}

/**
 * 창업자 direct chat에서 Council/파트너 LLM 대신 결정론 응답 (SHA, Cursor/Supabase 브리지 truth).
 */
function handleFounderOperationalProbe(normalized, metadata, route_label, probe) {
  const workContext = resolveWorkObject(normalized, metadata);
  const phaseProbe = resolveWorkPhase(workContext, normalized, metadata);
  const intentResult = {
    intent: FounderIntent.RUNTIME_META,
    confidence: 1,
    signals: ['founder_operational_probe', probe.kind],
  };
  const policy = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_object_type: workContext.primary_type,
    work_phase: phaseProbe.phase,
    intent_signal: intentResult.intent,
    metadata,
  });
  const text =
    probe.kind === 'runtime_sha'
      ? formatRuntimeMetaSurfaceText()
      : formatFounderProviderProbeSurfaceText(
          probe.kind,
          buildProviderTruthSnapshot({ space: workContext.project_space ?? null, run: workContext.run ?? null }),
        );
  const rendered = renderFounderSurface(FounderSurfaceType.RUNTIME_META, { text });
  return buildResult(
    rendered,
    {
      workContext,
      phaseResult: { ...phaseProbe, phase_source: 'founder_operational_probe', confidence: 1 },
      intentResult,
      policy,
      route_label,
    },
    { surface_type: FounderSurfaceType.RUNTIME_META, founder_operational_probe: probe.kind },
  );
}

async function runFounderNaturalPartnerTurn(normalized, metadata, route_label, callText, threadKey) {
  const workContext = resolveWorkObject(normalized, metadata);
  const phaseProbe = resolveWorkPhase(workContext, normalized, metadata);
  const intentResult = {
    intent: FounderIntent.UNKNOWN_EXPLORATORY,
    confidence: 0,
    signals: ['founder_natural_only'],
  };
  const policyChat = evaluatePolicy({
    actor: Actor.FOUNDER,
    work_object_type: workContext.primary_type,
    work_phase: phaseProbe.phase,
    intent_signal: intentResult.intent,
    metadata,
  });
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
    /** Council 메모 포맷 흉내 제거(LLM은 Council을 호출하지 않아도 형식만 복제할 수 있음). */
    const { text: plain, stripped_to_empty: partnerCouncilShapeStripped } = rawPlain
      ? sanitizePartnerNaturalLlmOutput(rawPlain)
      : { text: '', stripped_to_empty: false };
    if (plain) {
      const rendered = renderFounderSurface(FounderSurfaceType.PARTNER_NATURAL, { text: plain });
      return buildResult(
        rendered,
        {
          workContext,
          phaseResult: { ...phaseProbe, phase_source: 'founder_natural_only_surface' },
          intentResult,
          policy: policyChat,
          route_label,
        },
        {
          surface_type: FounderSurfaceType.PARTNER_NATURAL,
          partner_natural: true,
          partner_output_sanitized: plain !== rawPlain || partnerCouncilShapeStripped,
        },
      );
    }
  } catch (e) {
    console.error('[FOUNDER_NATURAL_ONLY]', e?.message || e);
  }
  const fallback = renderFounderSurface(FounderSurfaceType.PARTNER_NATURAL, {
    text: '[COS] 지금은 응답을 생성하지 못했습니다. 잠시 후 다시 보내 주세요.',
  });
  return buildResult(
    fallback,
    {
      workContext,
      phaseResult: { ...phaseProbe, phase_source: 'founder_natural_only_error' },
      intentResult,
      policy: policyChat,
      route_label,
    },
    { surface_type: FounderSurfaceType.PARTNER_NATURAL, partner_natural: true },
  );
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
  const sourceType = String(metadata.source_type || '').toLowerCase();
  const routeLabelNorm = String(metadata.slack_route_label || route_label || '').toLowerCase();
  const channel = String(metadata.channel || '');
  const founderRoute =
    sourceType === 'direct_message' ||
    sourceType === 'channel_mention' ||
    routeLabelNorm === 'dm_ai_router' ||
    routeLabelNorm === 'mention_ai_router' ||
    channel.startsWith('D');
  const callText = typeof metadata.callText === 'function' ? metadata.callText : null;
  const threadKey = buildSlackThreadKey(metadata);

  if (metadata.founder_hard_recover === true) {
    const recoveredPacket = buildDialoguePacket(normalized, isActiveProjectIntake(metadata) ? 'followup' : 'kickoff');
    const recoveredQuality = validateDialogueContract(recoveredPacket);
    if (!recoveredQuality.ok) {
      const fallback = buildFounderHardFail(FounderHardFailReason.INVARIANT_BREACH);
      return {
        text: fallback.text,
        trace: {
          surface_type: FounderSurfaceType.SAFE_FALLBACK,
          responder_kind: 'founder_kernel',
          passed_pipeline: true,
          passed_renderer: true,
          legacy_router_used: false,
          hard_fail_reason: fallback.reason,
          route_label: route_label || null,
        },
      };
    }
    const rendered = renderFounderSurface(FounderSurfaceType.DIALOGUE, recoveredPacket);
    return {
      text: rendered.text,
      blocks: rendered.blocks,
      trace: {
        surface_type: FounderSurfaceType.DIALOGUE,
        responder_kind: 'founder_kernel',
        passed_pipeline: true,
        passed_renderer: true,
        legacy_router_used: false,
        hard_fail_reason: null,
        route_label: route_label || null,
      },
    };
  }

  if (
    founderRoute &&
    isFounderDirectNaturalChatEnabled() &&
    typeof callText === 'function'
  ) {
    const launchHandled = await maybeHandleFounderLaunchGate(normalized, metadata, route_label, threadKey);
    if (launchHandled) return launchHandled;
    const opProbe = classifyFounderOperationalProbe(normalized);
    if (opProbe) {
      return handleFounderOperationalProbe(normalized, metadata, route_label, opProbe);
    }
    return await runFounderNaturalPartnerTurn(normalized, metadata, route_label, callText, threadKey);
  }

  // 1. Work Object Resolver — "which project/run/session does this turn belong to?"
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
    if (founderRoute) {
      return renderScopeLockOnlyDialogue(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        '이 창에서는 특정 문법으로 맞출 필요 없습니다. 평문으로 이어가 주시면 COS가 맞춰 응답합니다.',
      );
    }
    return null;
  }

  if (founderRoute && gold.kind === 'kickoff' && !isActiveProjectIntake(metadata)) {
    openProjectIntakeSession(metadata, { goalLine: normalized });
    workContext = resolveWorkObject(normalized, metadata);
  }

  if (founderRoute && shouldAskSeparateProductConfirmation(gold, workContext, normalized)) {
    const clarifyPacket = buildSeparateProductClarificationPacket(workContext, normalized);
    const quality = validateDialogueContract(clarifyPacket);
    if (!quality.ok) {
      return founderKernelHardFail(
        normalized,
        metadata,
        workContext,
        intentResult,
        route_label,
        FounderHardFailReason.INVARIANT_BREACH,
        'separate_product_clarification_quality_fail',
      );
    }
    const rendered = renderFounderSurface(FounderSurfaceType.DIALOGUE, clarifyPacket);
    return buildResult(rendered, {
      workContext,
      phaseResult: { phase: WorkPhase.ALIGN, phase_source: 'separate_product_clarification', confidence: 1 },
      intentResult,
      policy: evaluatePolicy({
        actor: Actor.FOUNDER,
        work_object_type: workContext.primary_type,
        work_phase: WorkPhase.ALIGN,
        intent_signal: intentResult.intent,
        metadata,
      }),
      route_label,
    });
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
    const statusSnap = buildProviderTruthSnapshot({ space: workContext.project_space ?? null, run: run ?? null });
    const statusTruth = formatProviderTruthLines(statusSnap);
    const statusFriendly = formatProviderTruthFriendlyLines(statusSnap);
    const rendered = renderFounderSurface('status_report_surface', buildStatusPacket({
      current_stage: run?.current_stage || (isActiveProjectIntake(metadata) ? 'align' : 'discover'),
      completed: run ? ['scope lock 완료', 'run 생성'] : ['문제 재정의'],
      in_progress: run ? ['workstream 실행'] : ['scope lock 논의'],
      blocker: run?.outbound_last_error || '없음',
      provider_truth: statusTruth,
      provider_truth_friendly: statusFriendly,
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
    ensureExecutionRunDispatched(run, metadata);
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
  const executorResult = await routeToExecutor(phase, policy, normalized, metadata, workContext, callText);
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

/** 스레드 제품 분기 확인용 최소 힌트(숨은 계약 추출기·Council 스캔과 무관) */
function roughProductDomainHint(text) {
  const t = String(text || '');
  if (/(캘린더|스케줄|일정|예약)/u.test(t)) return 'calendar';
  if (/(crm|리드|세일즈)/i.test(t)) return 'crm';
  return 'generic';
}

function shouldAskSeparateProductConfirmation(gold, workContext, normalized) {
  if (gold?.kind !== 'kickoff') return false;
  const intakeGoal = String(workContext?.intake_session?.goalLine || '').trim();
  if (!intakeGoal) return false;
  const prevDomain = roughProductDomainHint(intakeGoal);
  const nowDomain = roughProductDomainHint(normalized);
  if (prevDomain === 'generic' || nowDomain === 'generic') return false;
  return prevDomain !== nowDomain;
}

function buildSeparateProductClarificationPacket(workContext, normalized) {
  const base = buildDialoguePacket(normalized, 'followup');
  const priorGoal = String(workContext?.intake_session?.goalLine || '').trim();
  return {
    ...base,
    reframed_problem:
      '현재 스레드에는 이미 진행 중인 제품 맥락이 있습니다. 새 요청이 별도 프로덕트인지 먼저 확인한 뒤 분기하겠습니다.',
    pushback_point:
      '같은 스레드에서 서로 다른 제품을 병행하면 의사결정 로그와 스코프가 섞여 품질이 떨어집니다.',
    key_questions: [
      '지금 요청은 기존 스레드의 같은 프로덕트 연장인가요, 아니면 별도 프로덕트인가요?',
      `기존 맥락 유지 시 기준 목표: "${priorGoal.slice(0, 120)}${priorGoal.length > 120 ? '…' : ''}"`,
      ...base.key_questions,
    ].slice(0, 5),
    next_step:
      '“같은 프로덕트” 또는 “별도 프로덕트”로만 답해주시면, 같은 스레드 유지/새 스레드 분리 중 하나로 즉시 정렬하겠습니다.',
  };
}

function renderScopeLockOnlyDialogue(normalized, metadata, workContext, intentResult, route_label, message) {
  const packet = {
    ...buildDialoguePacket(normalized, 'followup'),
    reframed_problem: message,
    next_step: '요청을 스코프 락인 질문(포함/제외/성공기준/제약)으로 바꿔주시면 즉시 이어서 잠그겠습니다.',
  };
  const quality = validateDialogueContract(packet);
  if (!quality.ok) {
    return founderKernelHardFail(
      normalized,
      metadata,
      workContext,
      intentResult,
      route_label,
      FounderHardFailReason.INVARIANT_BREACH,
      'scope_lock_only_dialogue_quality_fail',
    );
  }
  const rendered = renderFounderSurface(FounderSurfaceType.DIALOGUE, packet);
  return buildResult(rendered, {
    workContext,
    phaseResult: { phase: WorkPhase.ALIGN, phase_source: 'scope_lock_only_dialogue', confidence: 1 },
    intentResult,
    policy: evaluatePolicy({
      actor: Actor.FOUNDER,
      work_object_type: workContext.primary_type,
      work_phase: WorkPhase.ALIGN,
      intent_signal: intentResult.intent,
      metadata,
    }),
    route_label,
  });
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
      ...restTraceExtras,
    },
  };
}
