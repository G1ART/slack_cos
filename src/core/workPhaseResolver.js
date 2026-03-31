/**
 * COS Constitution v1.1 — Work Phase Resolver.
 * Maps IntakeStage + ExecutionRun.current_stage + deploy_status into unified WorkPhase.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_WORK_PHASE_RESOLVER

import { WorkPhase } from './founderContracts.js';

/**
 * @param {import('./workObjectResolver.js').WorkContext} workContext
 * @param {string} _text - normalized input (for future signal use)
 * @param {Record<string, unknown>} _metadata
 * @returns {{ phase: string, phase_source: string, confidence: number }}
 */
export function resolveWorkPhase(workContext, _text = '', _metadata = {}) {
  if (!workContext.resolved) {
    return { phase: WorkPhase.DISCOVER, phase_source: 'no_work_object', confidence: 0.3 };
  }

  const { intake_session: intake, run } = workContext;

  // Execution run present — derive from run state
  if (run) {
    return resolveFromRun(run, intake);
  }

  // Intake session present but no run yet — pre-execution phases
  if (intake) {
    return resolveFromIntake(intake);
  }

  // Project space only — discovery/status
  return { phase: WorkPhase.DISCOVER, phase_source: 'project_space_only', confidence: 0.4 };
}

function resolveFromRun(run, intake) {
  const stage = run.current_stage;
  const deployStatus = run.deploy_status;
  const status = run.status;

  if (status === 'completed') {
    return { phase: WorkPhase.MONITOR, phase_source: 'run_completed', confidence: 0.95 };
  }
  if (status === 'cancelled') {
    return { phase: WorkPhase.EXCEPTION, phase_source: 'run_cancelled', confidence: 0.95 };
  }

  if (run.outbound_dispatch_state === 'failed') {
    return { phase: WorkPhase.EXCEPTION, phase_source: 'dispatch_failed', confidence: 0.9 };
  }

  if (stage === 'deployment_confirmed' || stage === 'deployed_manual_confirmed') {
    return { phase: WorkPhase.MONITOR, phase_source: `run_stage_${stage}`, confidence: 0.95 };
  }

  if (stage === 'approved_for_deploy') {
    return { phase: WorkPhase.DEPLOY, phase_source: 'run_stage_approved_for_deploy', confidence: 0.9 };
  }

  if (stage === 'deploy_ready' || deployStatus === 'deploy_ready') {
    return { phase: WorkPhase.DEPLOY, phase_source: 'deploy_ready', confidence: 0.9 };
  }

  if (deployStatus === 'awaiting_founder_action' || stage === 'paused_for_founder') {
    return { phase: WorkPhase.APPROVE, phase_source: `deploy_awaiting_or_paused`, confidence: 0.9 };
  }

  if (stage === 'in_progress_rework') {
    return { phase: WorkPhase.EXECUTE, phase_source: 'rework', confidence: 0.85 };
  }

  if (stage === 'execution_running') {
    // Check intake for more granularity
    if (intake?.stage === 'execution_reporting') {
      return { phase: WorkPhase.REVIEW, phase_source: 'intake_reporting', confidence: 0.85 };
    }
    if (intake?.stage === 'approval_pending') {
      return { phase: WorkPhase.APPROVE, phase_source: 'intake_approval_pending', confidence: 0.85 };
    }
    return { phase: WorkPhase.EXECUTE, phase_source: 'run_stage_execution_running', confidence: 0.85 };
  }

  // Fallback for run with unknown stage
  return { phase: WorkPhase.EXECUTE, phase_source: `run_fallback_${stage}`, confidence: 0.5 };
}

function resolveFromIntake(intake) {
  switch (intake.stage) {
    case 'active':
      return { phase: WorkPhase.ALIGN, phase_source: 'intake_active', confidence: 0.9 };
    case 'execution_ready':
      return { phase: WorkPhase.SEED, phase_source: 'intake_execution_ready', confidence: 0.9 };
    case 'approval_pending':
      return { phase: WorkPhase.APPROVE, phase_source: 'intake_approval_pending', confidence: 0.9 };
    case 'execution_running':
      return { phase: WorkPhase.EXECUTE, phase_source: 'intake_execution_running', confidence: 0.85 };
    case 'execution_reporting':
      return { phase: WorkPhase.REVIEW, phase_source: 'intake_execution_reporting', confidence: 0.85 };
    case 'completed':
      return { phase: WorkPhase.MONITOR, phase_source: 'intake_completed', confidence: 0.9 };
    case 'cancelled':
      return { phase: WorkPhase.EXCEPTION, phase_source: 'intake_cancelled', confidence: 0.9 };
    default:
      return { phase: WorkPhase.ALIGN, phase_source: `intake_fallback_${intake.stage}`, confidence: 0.5 };
  }
}
