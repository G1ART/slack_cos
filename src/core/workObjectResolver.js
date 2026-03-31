/**
 * COS Constitution v1.1 — Work Object Resolver.
 * First step in the pipeline: "Which project/run/session does this founder turn belong to?"
 * Wraps existing projectSpaceResolver, projectIntakeSession, executionRun.
 * @see docs/architecture/COS_CONSTITUTION_v1.md §6
 */

// GREP_COS_CONSTITUTION_WORK_OBJECT_RESOLVER

import { resolveProjectSpaceForThread } from '../features/projectSpaceResolver.js';
import {
  getProjectIntakeSession,
  isActiveProjectIntake,
  hasOpenExecutionOwnership,
  isPreLockIntake,
} from '../features/projectIntakeSession.js';
import { getExecutionRunByThread } from '../features/executionRun.js';
import { buildSlackThreadKey } from '../features/slackConversationBuffer.js';

/**
 * @typedef {Object} WorkContext
 * @property {boolean} resolved - whether any work object was found
 * @property {'project_space'|'execution_run'|'intake_session'|'none'} primary_type
 * @property {object|null} project_space
 * @property {object|null} run
 * @property {object|null} intake_session
 * @property {string|null} project_id
 * @property {string|null} run_id
 * @property {string} phase_hint - hint for workPhaseResolver
 * @property {number} confidence
 */

/**
 * Resolve the work object context for a founder turn.
 * @param {string} text - normalized input text
 * @param {Record<string, unknown>} metadata - Slack metadata (channel, ts, thread_ts, user, etc.)
 * @returns {WorkContext}
 */
export function resolveWorkObject(text, metadata = {}) {
  const threadKey = buildSlackThreadKey(metadata);

  // 1. Check active intake session (highest priority — sticky thread ownership)
  const intake = getProjectIntakeSession(metadata);
  if (intake) {
    const run = intake.run_id ? (getExecutionRunByThread(threadKey) || null) : null;
    const spaceResult = resolveProjectSpaceForThread({ threadKey, text, metadata });
    const space = spaceResult?.space || null;

    let phaseHint = 'align';
    if (isPreLockIntake(metadata)) phaseHint = 'align';
    else if (hasOpenExecutionOwnership(metadata)) {
      if (intake.stage === 'execution_ready') phaseHint = 'seed';
      else if (intake.stage === 'approval_pending') phaseHint = 'approve';
      else if (intake.stage === 'execution_running') phaseHint = 'execute';
      else if (intake.stage === 'execution_reporting') phaseHint = 'review';
      else phaseHint = 'execute';
    }

    return {
      resolved: true,
      primary_type: run ? 'execution_run' : 'intake_session',
      project_space: space,
      run,
      intake_session: intake,
      project_id: space?.project_id || run?.project_id || null,
      run_id: run?.run_id || intake.run_id || null,
      phase_hint: phaseHint,
      confidence: 90,
    };
  }

  // 2. Check execution run by thread (no intake but thread has a run)
  const run = getExecutionRunByThread(threadKey);
  if (run) {
    const spaceResult = resolveProjectSpaceForThread({ threadKey, text, metadata });
    const space = spaceResult?.space || null;

    let phaseHint = 'execute';
    if (run.current_stage === 'deploy_ready' || run.current_stage === 'approved_for_deploy') phaseHint = 'deploy';
    else if (run.deploy_status === 'awaiting_founder_action') phaseHint = 'approve';
    else if (run.current_stage === 'deployment_confirmed') phaseHint = 'monitor';
    else if (run.status === 'completed' || run.status === 'cancelled') phaseHint = 'monitor';

    return {
      resolved: true,
      primary_type: 'execution_run',
      project_space: space,
      run,
      intake_session: null,
      project_id: run.project_id || space?.project_id || null,
      run_id: run.run_id,
      phase_hint: phaseHint,
      confidence: 85,
    };
  }

  // 3. Check project space by thread (no run but thread is linked to a space)
  const spaceResult = resolveProjectSpaceForThread({ threadKey, text, metadata });
  if (spaceResult?.resolved && spaceResult.space) {
    return {
      resolved: true,
      primary_type: 'project_space',
      project_space: spaceResult.space,
      run: null,
      intake_session: null,
      project_id: spaceResult.space.project_id,
      run_id: null,
      phase_hint: 'discover',
      confidence: spaceResult.confidence || 60,
    };
  }

  // 4. No work object found
  return {
    resolved: false,
    primary_type: 'none',
    project_space: null,
    run: null,
    intake_session: null,
    project_id: null,
    run_id: null,
    phase_hint: 'discover',
    confidence: 0,
  };
}
