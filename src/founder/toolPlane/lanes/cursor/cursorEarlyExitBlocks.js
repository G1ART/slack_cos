/**
 * Cursor-only early exits in external dispatch: delegate contract for emit_patch, execution profile policy.
 */

import { appendExecutionArtifact } from '../../../executionLedger.js';
import { emitPatchHasCloudContractSource } from '../../../livePatchPayload.js';
import { getExecutionProfileForThread, evaluateCursorActionAgainstProfile } from '../../../executionProfile.js';
import { recordCosPretriggerAudit } from '../../../pretriggerAudit.js';
import {
  DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
  DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
  TOOL_OUTCOME_CODES,
  __invokeToolTestHooks,
} from '../../toolLaneContract.js';
import {
  REJECTION_KIND_EXECUTION_PROFILE,
  REJECTION_KIND_MISSING_CONTRACT_SOURCE,
  EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
} from '../../../cursorLivePatchDispatch.js';
import { isCursorCloudAgentLaneReady } from '../../../cursorCloudAdapter.js';

/**
 * @param {object} p
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function tryEmitPatchDelegateContractEarlyExit(p) {
  const {
    tool,
    action,
    threadKey,
    payload,
    env,
    delegateEmitPatchModule,
    opsSmokeSessionId,
    cosRunId,
    opsAttemptSeq,
    invocation_id,
    snap,
    runPacketId,
    envelopeArtifactPayload,
  } = p;

  const automationLanePrecheck =
    tool === 'cursor' &&
    (action === 'create_spec' || action === 'emit_patch') &&
    isCursorCloudAgentLaneReady(env) &&
    __invokeToolTestHooks.failArtifactForTool !== tool;

  const liveOnlyNoFallbackEmitThread =
    Boolean(threadKey) &&
    Boolean(delegateEmitPatchModule) &&
    delegateEmitPatchModule.isThreadLiveOnlyNoFallbackSmoke(threadKey);
  const missingEmitPatchCloudContract = !emitPatchHasCloudContractSource(payload);
  const needsDelegateFirstEmitPatchBlock =
    tool === 'cursor' &&
    action === 'emit_patch' &&
    automationLanePrecheck &&
    missingEmitPatchCloudContract &&
    (liveOnlyNoFallbackEmitThread || !runPacketId);

  if (!needsDelegateFirstEmitPatchBlock) return null;

  const blockedEmitReason = liveOnlyNoFallbackEmitThread
    ? DELEGATE_REQUIRED_BEFORE_EMIT_PATCH
    : DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH;
  const blockedEmitMachineHint = liveOnlyNoFallbackEmitThread
    ? 'live_only_emit_patch_requires_delegate_packets'
    : 'emit_patch_requires_delegate_merge_or_packet_scope';
  const profileForContract = threadKey ? getExecutionProfileForThread(threadKey) : getExecutionProfileForThread('');
  if (opsSmokeSessionId && cosRunId) {
    try {
      await recordCosPretriggerAudit({
        env,
        threadKey,
        runId: cosRunId,
        smoke_session_id: opsSmokeSessionId,
        call_name: 'invoke_external_tool',
        args: { tool, action, payload },
        blocked: true,
        blocked_reason: blockedEmitReason,
        machine_hint: blockedEmitMachineHint,
        missing_required_fields: ['packets', 'live_patch'],
        exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[pretrigger_audit]', e);
    }
  }
  const status = 'blocked';
  const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
  const needs_review = true;
  const execution_mode = 'artifact';
  const result_summary = `blocked / contract_source / ${tool}:${action} — ${blockedEmitReason} (${EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE})`;
  const ledgerPayload = {
    invocation_id,
    tool,
    action,
    execution_mode,
    execution_lane: 'artifact',
    status,
    artifact_path: null,
    next_required_input: null,
    error_code: 'missing_contract_source',
    result_summary,
    outcome_code,
    live_attempted: false,
    readiness_snapshot: snap,
    fallback_reason: null,
    blocked_reason: blockedEmitReason,
    degraded_from: null,
    needs_review,
    rejection_kind: REJECTION_KIND_MISSING_CONTRACT_SOURCE,
    exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
    execution_profile_id: profileForContract.id,
    ...(runPacketId ? { run_packet_id: runPacketId } : {}),
    ...(cosRunId ? { cos_run_id: cosRunId } : {}),
  };
  const blockedEarly = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    execution_lane: 'artifact',
    status,
    outcome_code,
    payload,
    result_summary,
    artifact_path: null,
    next_required_input: null,
    needs_review,
    error_code: 'missing_contract_source',
    blocked_reason: blockedEmitReason,
    machine_hint: blockedEmitMachineHint,
    missing_required_fields: ['packets', 'live_patch'],
    rejection_kind: REJECTION_KIND_MISSING_CONTRACT_SOURCE,
    exact_failure_code: EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
    execution_profile_id: profileForContract.id,
    ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
  };
  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_invocation',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: envelopeArtifactPayload(ledgerPayload),
    });
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: envelopeArtifactPayload(ledgerPayload),
    });
  }
  return blockedEarly;
}

/**
 * @param {object} p
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function tryCursorExecutionProfileEarlyExit(p) {
  const {
    tool,
    action,
    payload,
    threadKey,
    invocation_id,
    snap,
    runPacketId,
    cosRunId,
    opsSmokeSessionId,
    opsAttemptSeq,
    envelopeArtifactPayload,
  } = p;
  if (tool !== 'cursor') return null;

  const executionProfile = getExecutionProfileForThread(threadKey);
  const pol = evaluateCursorActionAgainstProfile(executionProfile, action);
  if (pol.ok) return null;

  if (opsSmokeSessionId && cosRunId) {
    try {
      await recordCosPretriggerAudit({
        env: process.env,
        threadKey,
        runId: cosRunId,
        smoke_session_id: opsSmokeSessionId,
        call_name: 'invoke_external_tool',
        args: { tool, action, payload },
        blocked: true,
        blocked_reason: String(pol.code || 'execution_profile_policy'),
        machine_hint: String(pol.detail || '').slice(0, 300),
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[pretrigger_audit]', e);
    }
  }
  const status = 'blocked';
  const outcome_code = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
  const needs_review = true;
  const execution_mode = 'artifact';
  const code = String(pol.code || 'execution_profile_policy');
  const result_summary = `blocked / execution_profile / ${tool}:${action} — ${code}`;
  const ledgerPayload = {
    invocation_id,
    tool,
    action,
    execution_mode,
    execution_lane: 'artifact',
    status,
    artifact_path: null,
    next_required_input: null,
    error_code: 'execution_profile_policy',
    result_summary,
    outcome_code,
    live_attempted: false,
    readiness_snapshot: snap,
    fallback_reason: null,
    blocked_reason: code,
    degraded_from: null,
    needs_review,
    rejection_kind: REJECTION_KIND_EXECUTION_PROFILE,
    execution_profile_id: executionProfile.id,
    ...(runPacketId ? { run_packet_id: runPacketId } : {}),
    ...(cosRunId ? { cos_run_id: cosRunId } : {}),
  };
  const blockedProfile = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    execution_lane: 'artifact',
    status,
    outcome_code,
    payload,
    result_summary,
    artifact_path: null,
    next_required_input: null,
    needs_review,
    error_code: 'execution_profile_policy',
    blocked_reason: code,
    rejection_kind: REJECTION_KIND_EXECUTION_PROFILE,
    execution_profile_id: executionProfile.id,
    ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
  };
  if (threadKey) {
    await appendExecutionArtifact(threadKey, {
      type: 'tool_invocation',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: envelopeArtifactPayload(ledgerPayload),
    });
    await appendExecutionArtifact(threadKey, {
      type: 'tool_result',
      summary: result_summary.slice(0, 500),
      status,
      needs_review,
      payload: envelopeArtifactPayload(ledgerPayload),
    });
  }
  return blockedProfile;
}
