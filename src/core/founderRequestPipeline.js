/**
 * COS Constitution v1.1 — Single inbound pipeline (work-state-first).
 * Center of gravity: work_object → work_phase → policy → packet → surface.
 * Called before legacy routers. Returns null if the pipeline cannot fully handle the request.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_PIPELINE

import { WorkPhase, FounderIntent, SAFE_FALLBACK_TEXT, DISCOVERY_PROMPT_TEXT, Actor } from './founderContracts.js';
import { resolveWorkObject } from './workObjectResolver.js';
import { resolveWorkPhase } from './workPhaseResolver.js';
import { classifyFounderIntent } from './founderIntentClassifier.js';
import { evaluatePolicy } from './policyEngine.js';
import { resolveSurfaceType } from './founderSurfaceRegistry.js';
import { assemblePacket, makeUtilityPacket } from './packetAssembler.js';
import { renderFounderSurface } from './founderRenderer.js';

import { formatRuntimeMetaSurfaceText, formatMetaDebugSurfaceText } from '../features/inboundFounderRoutingLock.js';
import { formatExecutiveHelpText } from '../features/executiveSurfaceHelp.js';

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
  // If there's a project space but no intake, offer status or start
  if (workContext.project_space && !workContext.intake_session) {
    try {
      const { renderProjectSpaceStatusForSlack } = await import('../features/projectSpaceRegistry.js');
      return { text: renderProjectSpaceStatusForSlack(workContext.project_space) };
    } catch {
      return { text: DISCOVERY_PROMPT_TEXT };
    }
  }
  return { text: DISCOVERY_PROMPT_TEXT };
}

async function executeAlign(normalized, metadata, workContext) {
  // Delegate to existing intake continuation / refine / kickoff logic
  try {
    const { tryProjectIntakeExecutiveContinue } = await import('../features/startProjectLockConfirmed.js');
    const result = await tryProjectIntakeExecutiveContinue(normalized, metadata);
    if (result) return result;
  } catch { /* fallthrough */ }

  // Try kickoff if align but no intake response
  try {
    const { tryExecutiveSurfaceResponse } = await import('../features/tryExecutiveSurfaceResponse.js');
    const kickoffInput = `툴제작: ${normalized}`;
    const result = await tryExecutiveSurfaceResponse(kickoffInput, metadata, {});
    if (result?.response_type === 'start_project') {
      return {
        text: result.text,
        blocks: result.blocks,
        packet_id: result.packet_id,
        status_packet_id: result.status_packet_id,
      };
    }
  } catch { /* fallthrough */ }

  return null;
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
  try {
    const { tryFinalizeExecutionSpineTurn } = await import('../features/executionSpineRouter.js');
    const result = tryFinalizeExecutionSpineTurn({ trimmed: normalized, metadata });
    if (result && result !== 'council_defer' && result.text) {
      return result;
    }
  } catch { /* fallthrough */ }
  return null;
}

async function executeApproval(normalized, metadata, workContext) {
  // Approval decisions come through Slack buttons, not text.
  // Text in approval phase → show current approval state
  if (workContext.run) {
    return {
      text: `현재 승인 대기 중입니다. 버튼으로 승인/보류/반려를 결정해 주세요.`,
      founder_action_required: '승인/보류/반려를 결정해 주세요.',
    };
  }
  return null;
}

async function executeDeploy(normalized, metadata, workContext) {
  // Deploy-phase text → show deploy status
  try {
    const { tryFinalizeExecutionSpineTurn } = await import('../features/executionSpineRouter.js');
    const result = tryFinalizeExecutionSpineTurn({ trimmed: normalized, metadata });
    if (result && result !== 'council_defer' && result.text) return result;
  } catch { /* fallthrough */ }
  return null;
}

// ---------------------------------------------------------------------------
// Pipeline entry point
// ---------------------------------------------------------------------------

/**
 * @param {{ text: string, metadata?: Record<string, unknown>, route_label?: string }} input
 * @returns {Promise<{ text: string, blocks?: object[], trace: Record<string, unknown> } | null>}
 */
export async function founderRequestPipeline({ text, metadata = {}, route_label } = {}) {
  const normalized = String(text || '').trim();

  // 1. Work Object Resolver — "which project/run/session does this turn belong to?"
  const workContext = resolveWorkObject(normalized, metadata);

  // 2. Intent classifier — supplementary signal
  const intentResult = classifyFounderIntent(normalized, metadata);

  // 3. Handle utility intents regardless of work object (version, meta, help)
  if (UTILITY_INTENTS.has(intentResult.intent)) {
    return handleUtilityIntent(intentResult, normalized, metadata, workContext, route_label);
  }

  // 4. Work Phase Resolver
  const phaseResult = resolveWorkPhase(workContext, normalized, metadata);
  const phase = phaseResult.phase;

  // 5. For phases we don't handle yet → delegate to legacy routers
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
    return buildResult(
      renderFounderSurface(policy.required_surface_type, { text: SAFE_FALLBACK_TEXT }),
      { workContext, phaseResult, intentResult, policy, route_label }
    );
  }

  // 7. Route to executor
  const executorResult = await routeToExecutor(phase, policy, normalized, metadata, workContext);
  if (executorResult === null) {
    // Pipeline can't handle this → delegate to legacy
    return null;
  }

  // 8. Packet Assembler
  const packet = assemblePacket(executorResult, workContext, phaseResult);

  // 9. Surface type from policy
  const surfaceType = resolveSurfaceType(policy, phase);

  // 10. Render
  const rendered = renderFounderSurface(surfaceType, packet);

  return buildResult(rendered, { workContext, phaseResult, intentResult, policy, route_label });
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

function buildResult(rendered, { workContext, phaseResult, intentResult, policy, route_label }) {
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
      responder_kind: 'pipeline',
      pipeline_version: 'v1.1',
    },
  };
}
