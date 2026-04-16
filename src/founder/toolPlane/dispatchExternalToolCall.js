/**
 * Runtime external tool dispatch (W1 SSOT). Founder path calls this module;
 * toolsBridge re-exports as invokeExternalTool for compatibility.
 */

import crypto from 'node:crypto';
import {
  appendExecutionArtifact,
} from '../executionLedger.js';
import { mergeLedgerExecutionRowPayload } from '../canonicalExecutionEnvelope.js';
import { emitPatchHasCloudContractSource, shouldSkipGithubRecoveryEnvelopeRegistration } from '../livePatchPayload.js';
import { getExecutionProfileForThread, evaluateCursorActionAgainstProfile } from '../executionProfile.js';
import {
  mergeEmitPatchPayloadForDispatch,
  compileEmitPatchForCloudAutomation,
  describeEmitPatchAssemblyBlock,
  REJECTION_KIND_EXECUTION_PROFILE,
  REJECTION_KIND_MISSING_CONTRACT_SOURCE,
  REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
  EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE,
} from '../cursorLivePatchDispatch.js';
import {
  isCursorCloudAgentLaneReady,
  triggerCursorAutomation,
  acceptanceResponseHasCallbackMetadataKeys,
  computeEmitPatchCursorAutomationTruth,
  isCursorAutomationSmokeMode,
} from '../cursorCloudAdapter.js';
import { isOpsSmokeEnabled, resolveSmokeSessionId } from '../smokeOps.js';
import { recordCosPretriggerAudit } from '../pretriggerAudit.js';
import { ALL_EXTERNAL_TOOLS, isValidToolAction } from './toolLaneActions.js';
import { getAdapterReadiness } from './toolLaneReadiness.js';
import { toolInvocationBlocked } from './toolInvocationPrecheck.js';
import { getLaneAdapter } from './externalToolLaneRegistry.js';
import {
  EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
  DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH,
  DELEGATE_REQUIRED_BEFORE_EMIT_PATCH,
  TOOL_OUTCOME_CODES,
  __invokeToolTestHooks,
} from './toolLaneContract.js';

/** @type {Promise<typeof import('../delegateEmitPatchStash.js')> | null} */
let delegateEmitPatchStashLoad = null;
function loadDelegateEmitPatchStash() {
  if (!delegateEmitPatchStashLoad) delegateEmitPatchStashLoad = import('../delegateEmitPatchStash.js');
  return delegateEmitPatchStashLoad;
}

/**
 * @param {string} status
 * @returns {'delivered'|'pending'|'timeout'|'unavailable'|'unknown'}
 */
function mapOrchestratorStatusToDeliveryState(status) {
  const s = String(status || '').trim();
  if (!s) return 'unknown';
  if (s === 'provider_callback_matched' || s === 'manual_probe_closure_observed') {
    return 'delivered';
  }
  if (s === 'callback_timeout') return 'timeout';
  if (
    s === 'skipped_no_contract' ||
    s === 'skipped_url_not_allowlisted' ||
    s === 'skipped_no_fetch' ||
    s === 'skipped_missing_inputs'
  ) {
    return 'unavailable';
  }
  if (s === 'skipped_idempotent') return 'delivered';
  return 'pending';
}

export async function dispatchExternalToolCall(spec, ctx = {}) {
  const s = spec && typeof spec === 'object' ? spec : {};
  const threadKey = ctx.threadKey ? String(ctx.threadKey) : '';
  const runPacketId = ctx.packetId != null ? String(ctx.packetId).trim() : '';
  const cosRunId = ctx.cosRunId != null ? String(ctx.cosRunId).trim() : '';
  const runTenancy =
    ctx.runTenancy && typeof ctx.runTenancy === 'object' && !Array.isArray(ctx.runTenancy) ? ctx.runTenancy : null;
  const tool = s.tool;
  const action = String(s.action || '').trim();
  let payload = s.payload && typeof s.payload === 'object' && !Array.isArray(s.payload) ? s.payload : {};

  if (!ALL_EXTERNAL_TOOLS.has(tool)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_tool',
      mode: 'external_tool_invocation',
    };
  }
  if (!isValidToolAction(tool, action)) {
    return {
      ok: false,
      blocked: true,
      reason: 'unsupported_action',
      mode: 'external_tool_invocation',
    };
  }

  let delegateEmitPatchModule = null;
  let emitPatchMergedFromDelegate = false;
  if (tool === 'cursor' && action === 'emit_patch' && threadKey) {
    delegateEmitPatchModule = await loadDelegateEmitPatchStash();
    const merged = await mergeEmitPatchPayloadForDispatch(threadKey, payload);
    payload = merged.payload;
    emitPatchMergedFromDelegate = merged.mergedFromDelegate;
  }

  const invocation_id = `tool_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
  const adapter = getLaneAdapter(tool);
  const env = process.env;
  /** @param {Record<string, unknown>} pl */
  const envelopeArtifactPayload = (pl) =>
    threadKey
      ? mergeLedgerExecutionRowPayload(
          pl,
          {
            threadKey,
            ...(cosRunId ? { runId: cosRunId } : {}),
            ...(runPacketId ? { packetId: runPacketId } : {}),
            ...(runTenancy ? { runTenancy } : {}),
          },
          env,
        )
      : pl;
  const opsSmokeSessionId =
    String(ctx.ops_smoke_session_id || '').trim() ||
    (isOpsSmokeEnabled(env) ? resolveSmokeSessionId(env) : null) ||
    (cosRunId && threadKey && isOpsSmokeEnabled(env) ? `smoke_inv_${invocation_id}` : null);

  let opsAttemptSeq = null;
  if (
    isOpsSmokeEnabled(env) &&
    opsSmokeSessionId &&
    cosRunId &&
    tool === 'cursor' &&
    (action === 'emit_patch' || action === 'create_spec')
  ) {
    const { bumpOpsSmokeAttemptSeq } = await import('../opsSmokeAttemptSeq.js');
    opsAttemptSeq = bumpOpsSmokeAttemptSeq(opsSmokeSessionId);
  }

  const readiness_snapshot = await getAdapterReadiness(tool, env, { threadKey });
  const snap = {
    tool: readiness_snapshot.tool,
    declared: readiness_snapshot.declared,
    live_capable: readiness_snapshot.live_capable,
    configured: readiness_snapshot.configured,
    details: readiness_snapshot.details,
  };

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

  if (needsDelegateFirstEmitPatchBlock) {
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

  const executionProfile = getExecutionProfileForThread(threadKey);
  if (tool === 'cursor') {
    const pol = evaluateCursorActionAgainstProfile(executionProfile, action);
    if (!pol.ok) {
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
  }

  if (opsSmokeSessionId && cosRunId) {
    try {
      await recordCosPretriggerAudit({
        env,
        threadKey,
        runId: cosRunId,
        smoke_session_id: opsSmokeSessionId,
        call_name: 'invoke_external_tool',
        args: { tool, action, payload },
        blocked: false,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[pretrigger_audit]', e);
    }
  }

  const block = toolInvocationBlocked(tool, action, payload, env);
  if (block.blocked) {
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
          blocked_reason: 'tool_invocation_blocked',
          machine_hint: String(block.blocked_reason || '').slice(0, 300),
          missing_required_fields: block.next_required_input ? [String(block.next_required_input)] : null,
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
    const result_summary = `blocked / artifact / ${tool}:${action} — ${String(block.blocked_reason || '').slice(0, 160)}`;
    const ledgerPayload = {
      invocation_id,
      tool,
      action,
      execution_mode,
      execution_lane: 'artifact',
      status,
      artifact_path: null,
      next_required_input: block.next_required_input ?? null,
      error_code: 'blocked_missing_input',
      result_summary,
      outcome_code,
      live_attempted: false,
      readiness_snapshot: snap,
      fallback_reason: null,
      blocked_reason: block.blocked_reason,
      degraded_from: null,
      needs_review,
      ...(runPacketId ? { run_packet_id: runPacketId } : {}),
      ...(cosRunId ? { cos_run_id: cosRunId } : {}),
    };
    const result = {
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
      next_required_input: block.next_required_input ?? null,
      needs_review,
      error_code: 'blocked_missing_input',
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
    return result;
  }

  let execution_mode = 'artifact';
  /** @type {'completed'|'degraded'|'blocked'|'failed'|'running'} */
  let status = 'failed';
  let outcome_code = TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD;
  let result_summary = '';
  let artifact_path = null;
  let next_required_input = null;
  let error_code = null;
  let live_attempted = false;
  let fallback_reason = null;
  const blocked_reason = null;
  let degraded_from = null;
  /** @type {'cloud_agent'|'local_cli'|'artifact'} */
  let execution_lane = 'artifact';

  const automationLane =
    tool === 'cursor' &&
    (action === 'create_spec' || action === 'emit_patch') &&
    isCursorCloudAgentLaneReady(env) &&
    __invokeToolTestHooks.failArtifactForTool !== tool;

  let automationLaneActive = automationLane;
  /** @type {null | ReturnType<import('../livePatchPayload.js').prepareEmitPatchForCloudAutomation>} */
  let emitPatchPrep = null;
  let emitPatchCloudSkippedForContract = false;

  if (tool === 'cursor' && action === 'emit_patch' && automationLane) {
    emitPatchPrep = compileEmitPatchForCloudAutomation(payload);
    payload = emitPatchPrep.payload;
    if (cosRunId && threadKey) {
      try {
        const { recordOpsSmokeEmitPatchCloudGate } = await import('../smokeOps.js');
        await recordOpsSmokeEmitPatchCloudGate({
          env,
          runId: cosRunId,
          threadKey,
          smoke_session_id: opsSmokeSessionId,
          prep: emitPatchPrep,
          merge_from_delegate: emitPatchMergedFromDelegate,
          ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
        });
      } catch (e) {
        console.error('[ops_smoke]', e);
      }
    }
    if (!emitPatchPrep.cloud_ok) {
      automationLaneActive = false;
      emitPatchCloudSkippedForContract = true;
      const asm = describeEmitPatchAssemblyBlock(emitPatchPrep, emitPatchMergedFromDelegate);
      const exactFailureCode = asm.exact_failure_code;
      const builderStage = asm.builder_stage_last_reached;
      const payloadProvenance = asm.payload_provenance;
      const machineHints = asm.machine_hints;
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
            blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
            exact_failure_code: exactFailureCode,
            payload_provenance: payloadProvenance,
            builder_stage_last_reached: builderStage,
            machine_hint: machineHints[0] || exactFailureCode,
            missing_required_fields: emitPatchPrep.validation.missing_required_fields,
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
      const result_summary = `blocked / assembly / ${tool}:${action} — ${EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD} (${exactFailureCode})`;
      const ledgerPayload = {
        invocation_id,
        tool,
        action,
        execution_mode,
        execution_lane: 'artifact',
        status,
        artifact_path: null,
        next_required_input: null,
        error_code: 'assembly_contract_not_met',
        result_summary,
        outcome_code,
        live_attempted: false,
        readiness_snapshot: snap,
        fallback_reason: null,
        blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
        exact_failure_code: exactFailureCode,
        payload_provenance: payloadProvenance,
        builder_stage_last_reached: builderStage,
        degraded_from: null,
        needs_review,
        rejection_kind: REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
        emit_patch_machine_hints: machineHints,
        ...(runPacketId ? { run_packet_id: runPacketId } : {}),
        ...(cosRunId ? { cos_run_id: cosRunId } : {}),
      };
      const blockedAssembly = {
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
        error_code: 'assembly_contract_not_met',
        blocked_reason: EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
        exact_failure_code: exactFailureCode,
        payload_provenance: payloadProvenance,
        builder_stage_last_reached: builderStage,
        machine_hint: machineHints[0] || exactFailureCode,
        missing_required_fields: emitPatchPrep.validation.missing_required_fields,
        emit_patch_machine_hints: machineHints,
        rejection_kind: REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
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
      return blockedAssembly;
    }
  }

  const canLive =
    tool === 'cursor'
      ? await adapter.canExecuteLive(action, payload, env)
      : adapter.canExecuteLive(action, payload, env);

  async function runBuildArtifact() {
    if (__invokeToolTestHooks.failArtifactForTool === tool) {
      __invokeToolTestHooks.failArtifactForTool = null;
      return {
        ok: false,
        result_summary: 'artifact build failed (test hook)',
        artifact_path: null,
        next_required_input: null,
      };
    }
    return adapter.buildArtifact(action, payload, invocation_id);
  }

  /** @type {Record<string, unknown> | null} */
  let callbackContractSnapshot = null;
  let callbackMetadataPresent = false;
  /** @type {boolean | 'unknown'} */
  let callbackCapabilityObserved = 'unknown';
  let callbackOrchestratorStatus = null;
  let callbackOrchestratorAttempts = null;
  let callbackOrchestratorSyntheticPosts = null;
  let callbackDeliveryState = 'unknown';
  if (automationLaneActive && threadKey && cosRunId) {
    try {
      const { describeTriggerCallbackContractForOps } = await import('../cursorCloudAdapter.js');
      callbackContractSnapshot = describeTriggerCallbackContractForOps(env);
      callbackMetadataPresent = callbackContractSnapshot?.callback_contract_present === true;
      const { recordOpsSmokeTriggerCallbackContract } = await import('../smokeOps.js');
      await recordOpsSmokeTriggerCallbackContract({
        env,
        runId: cosRunId,
        threadKey,
        smoke_session_id: opsSmokeSessionId,
        invoked_tool: tool,
        invoked_action: action,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
  }

  if (
    automationLaneActive &&
    tool === 'cursor' &&
    action === 'emit_patch' &&
    cosRunId &&
    threadKey &&
    runPacketId != null &&
    String(runPacketId).trim()
  ) {
    const { bindCursorEmitPatchDispatchLedgerBeforeTrigger } = await import('../providerEventCorrelator.js');
    const bind = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
      threadKey,
      runId: cosRunId,
      packetId: String(runPacketId).trim(),
      invocation_id,
      payload,
    });
    if (!bind.ok) {
      const stBind = 'blocked';
      const ocBind = TOOL_OUTCOME_CODES.BLOCKED_MISSING_INPUT;
      const nrBind = false;
      const emBind = 'live';
      const elBind = 'cloud_agent';
      const rsBind = `blocked / ${tool}:${action}`;
      const lpBind = {
        invocation_id,
        tool,
        action,
        execution_mode: emBind,
        execution_lane: elBind,
        status: stBind,
        artifact_path: null,
        next_required_input: null,
        error_code: 'dispatch_ledger_bind_failed',
        result_summary: rsBind,
        outcome_code: ocBind,
        live_attempted: false,
        readiness_snapshot: snap,
        fallback_reason: null,
        blocked_reason: null,
        degraded_from: null,
        needs_review: nrBind,
        suppress_from_founder_execution_summary: true,
        suppress_from_founder_review_queue: true,
        internal_dispatch_ledger_bind_code: String(bind.code || 'dispatch_ledger_bind_failed'),
        ...(runPacketId ? { run_packet_id: runPacketId } : {}),
        ...(cosRunId ? { cos_run_id: cosRunId } : {}),
      };
      if (threadKey) {
        await appendExecutionArtifact(threadKey, {
          type: 'tool_invocation',
          summary: rsBind.slice(0, 500),
          status: stBind,
          needs_review: nrBind,
          payload: envelopeArtifactPayload(lpBind),
        });
        await appendExecutionArtifact(threadKey, {
          type: 'tool_result',
          summary: rsBind.slice(0, 500),
          status: stBind,
          needs_review: nrBind,
          payload: envelopeArtifactPayload(lpBind),
        });
      }
      return {
        ok: true,
        mode: 'external_tool_invocation',
        invocation_id,
        tool,
        action,
        accepted: true,
        execution_mode: emBind,
        execution_lane: elBind,
        status: stBind,
        outcome_code: ocBind,
        payload,
        result_summary: rsBind,
        artifact_path: null,
        next_required_input: null,
        needs_review: nrBind,
        error_code: 'dispatch_ledger_bind_failed',
        blocked_reason: null,
      };
    }
  }

  const tr = automationLaneActive
    ? await triggerCursorAutomation({
        action,
        payload,
        env,
        invocation_id,
        ...(tool === 'cursor' && action === 'emit_patch' && threadKey
          ? {
              completionContext: {
                thread_key: threadKey,
                packet_id: runPacketId != null && String(runPacketId).trim() ? String(runPacketId).trim() : null,
              },
            }
          : {}),
      })
    : null;

  if (automationLaneActive && tr && threadKey && cosRunId) {
    try {
      const { recordOpsSmokeCursorTrigger } = await import('../smokeOps.js');
      await recordOpsSmokeCursorTrigger({
        env,
        runId: cosRunId,
        threadKey,
        smoke_session_id: opsSmokeSessionId,
        tr: tr && typeof tr === 'object' ? /** @type {Record<string, unknown>} */ (tr) : null,
        invoked_tool: tool,
        invoked_action: action,
        callback_contract: callbackContractSnapshot,
        ...(opsAttemptSeq != null ? { attempt_seq: opsAttemptSeq } : {}),
      });
    } catch (e) {
      console.error('[ops_smoke]', e);
    }
  }

  /** @type {Record<string, unknown> | null} */
  let cursorAutomationAudit = null;
  if (automationLaneActive && tr) {
    const acceptanceEchoHasCallbackMetadata = acceptanceResponseHasCallbackMetadataKeys(tr, env);
    callbackMetadataPresent = callbackMetadataPresent || acceptanceEchoHasCallbackMetadata;
    if (callbackMetadataPresent) callbackCapabilityObserved = true;
    cursorAutomationAudit = {
      trigger_status: tr.trigger_status,
      trigger_response_preview: tr.trigger_response_preview,
      external_run_id: tr.external_run_id,
      external_url: tr.external_url,
      cursor_automation_request_id: tr.request_id,
      cursor_automation_http_status: tr.status,
      automation_status_raw: tr.automation_status_raw ?? null,
      automation_branch_raw: tr.automation_branch_raw ?? null,
      callback_metadata_present: callbackMetadataPresent,
      callback_capability_observed: callbackCapabilityObserved,
      ...(tool === 'cursor' && action === 'emit_patch'
        ? {
            emit_patch_cursor_automation_truth: computeEmitPatchCursorAutomationTruth(
              tr && typeof tr === 'object' ? /** @type {Record<string, unknown>} */ (tr) : {},
              payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
              env,
            ),
          }
        : {}),
    };
  }

  if (automationLaneActive && tr?.ok) {
    live_attempted = true;
    execution_lane = 'cloud_agent';
    try {
      const cloudRunId = String(tr.external_run_id || '').trim() || `cr_${invocation_id}`;
      let correlation_registered = false;
      if (threadKey) {
        const { recordCursorCloudCorrelation } = await import('../providerEventCorrelator.js');
        correlation_registered = await recordCursorCloudCorrelation({
          threadKey,
          ...(cosRunId ? { runId: cosRunId } : {}),
          packetId: runPacketId || undefined,
          cloudRunId,
          action,
          acceptedExternalId: String(tr.accepted_external_id || '').trim() || null,
          automationRequestId: String(tr.request_id || '').trim() || null,
          automationBranchRaw: tr.automation_branch_raw != null ? String(tr.automation_branch_raw) : null,
          payload: payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {},
        });
      }
      if (isCursorAutomationSmokeMode(env)) {
        console.info(
          JSON.stringify({
            event: 'cos_cursor_automation_smoke',
            action,
            correlation_registered,
            has_external_run_id: Boolean(String(tr.external_run_id || '').trim()),
            invocation_tail: String(invocation_id).slice(-12),
          }),
        );
      }
      if (tool === 'cursor' && action === 'emit_patch' && cosRunId && threadKey) {
        try {
          const plObj = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
          if (shouldSkipGithubRecoveryEnvelopeRegistration(env, plObj)) {
            console.info(
              JSON.stringify({
                event: 'cos_github_recovery_envelope_skipped',
                reason: 'strict_live_emit_patch_provider_only',
                run_id_tail: String(cosRunId).slice(-12),
              }),
            );
          } else {
            const { registerRecoveryEnvelopeFromEmitPatchAccept } = await import('../resultRecoveryBridge.js');
            await registerRecoveryEnvelopeFromEmitPatchAccept({
              env,
              runId: cosRunId,
              threadKey,
              packetId: runPacketId != null && String(runPacketId).trim() ? String(runPacketId).trim() : null,
              acceptedExternalId:
                String(tr.accepted_external_id || '').trim() ||
                String(tr.external_run_id || '').trim() ||
                null,
              smoke_session_id: opsSmokeSessionId != null && String(opsSmokeSessionId).trim()
                ? String(opsSmokeSessionId).trim()
                : null,
              payload,
            });
          }
        } catch (e) {
          console.error('[result_recovery_bridge]', e);
        }
      }
      if (tool === 'cursor' && cosRunId && threadKey) {
        try {
          const { awaitOrForceCallbackCompletion, shouldRunCallbackCompletionOrchestrator } = await import(
            '../cursorCallbackCompletionOrchestrator.js'
          );
          const plForOrch =
            payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
          const shouldRunByLegacyRule = shouldRunCallbackCompletionOrchestrator(tool, action, plForOrch, env);
          const shouldRunByPrimaryCallbackPolicy =
            tool === 'cursor' &&
            action === 'emit_patch' &&
            callbackMetadataPresent &&
            (String(tr.request_id || '').trim().length > 0 || String(tr.accepted_external_id || '').trim().length > 0);
          if (shouldRunByLegacyRule || shouldRunByPrimaryCallbackPolicy) {
            const orch = await awaitOrForceCallbackCompletion({
              runId: cosRunId,
              threadKey,
              packetId: runPacketId != null && String(runPacketId).trim() ? String(runPacketId).trim() : null,
              action,
              requestId: String(tr.request_id || '').trim(),
              acceptedExternalId: String(tr.accepted_external_id || '').trim() || null,
              externalRunId: String(tr.external_run_id || '').trim() || null,
              payload: plForOrch,
              env,
            });
            callbackOrchestratorStatus = String(orch.status || '').trim() || null;
            callbackOrchestratorAttempts = orch.attempts != null ? Number(orch.attempts) : null;
            callbackOrchestratorSyntheticPosts =
              orch.synthetic_posts != null ? Number(orch.synthetic_posts) : null;
            callbackDeliveryState = mapOrchestratorStatusToDeliveryState(callbackOrchestratorStatus || '');
            if (callbackDeliveryState === 'unavailable') callbackCapabilityObserved = false;
            else if (callbackMetadataPresent) callbackCapabilityObserved = true;
            console.info(
              JSON.stringify({
                event: 'cos_cursor_callback_orchestrator',
                status: orch.status,
                attempts: orch.attempts,
                waited_ms: orch.waited_ms,
                synthetic_posts: orch.synthetic_posts,
              }),
            );
            try {
              const { recordOpsSmokePhase } = await import('../smokeOps.js');
              await recordOpsSmokePhase({
                env,
                runId: cosRunId,
                threadKey,
                smoke_session_id: opsSmokeSessionId,
                attempt_seq: opsAttemptSeq,
                phase:
                  callbackDeliveryState === 'delivered'
                    ? 'callback_orchestrator_delivery_observed'
                    : callbackDeliveryState === 'timeout'
                      ? 'callback_orchestrator_timeout'
                      : callbackDeliveryState === 'unavailable'
                        ? 'callback_orchestrator_unavailable'
                        : 'callback_orchestrator_pending',
                detail: {
                  callback_orchestrator_status: callbackOrchestratorStatus,
                  callback_delivery_state: callbackDeliveryState,
                  callback_metadata_present: callbackMetadataPresent,
                  callback_capability_observed: callbackCapabilityObserved,
                  callback_attempts: callbackOrchestratorAttempts,
                  callback_synthetic_posts: callbackOrchestratorSyntheticPosts,
                },
              });
            } catch (e) {
              console.error('[ops_smoke]', e);
            }
          } else if (callbackMetadataPresent) {
            callbackOrchestratorStatus = 'skipped_policy_gate';
            callbackDeliveryState = 'pending';
          }
        } catch (e) {
          console.error('[cursor_callback_orchestrator]', e);
          callbackOrchestratorStatus = 'orchestrator_exception';
          callbackDeliveryState = 'unknown';
          if (callbackMetadataPresent) callbackCapabilityObserved = true;
        }
      }
      if (cursorAutomationAudit) {
        cursorAutomationAudit = {
          ...cursorAutomationAudit,
          callback_metadata_present: callbackMetadataPresent,
          callback_capability_observed: callbackCapabilityObserved,
          callback_metadata_unavailable: !callbackMetadataPresent,
          callback_delivery_state: callbackDeliveryState,
          callback_orchestrator_status: callbackOrchestratorStatus,
          callback_orchestrator_attempts: callbackOrchestratorAttempts,
          callback_orchestrator_synthetic_posts: callbackOrchestratorSyntheticPosts,
        };
      }
      execution_mode = 'live';
      status = 'running';
      outcome_code = TOOL_OUTCOME_CODES.CLOUD_AGENT_DISPATCH_ACCEPTED;
      result_summary = `running / cloud_agent / cursor:${action} — dispatch accepted (${cloudRunId}); webhook completes`;
      artifact_path = null;
      next_required_input = null;

      const emitPatchClosureOrchestratorRan =
        tool === 'cursor' &&
        action === 'emit_patch' &&
        callbackOrchestratorStatus != null &&
        callbackOrchestratorStatus !== 'skipped_policy_gate';
      if (emitPatchClosureOrchestratorRan) {
        if (callbackDeliveryState === 'timeout') {
          degraded_from = 'emit_patch_callback_timeout';
          error_code = 'emit_patch_callback_timeout';
        } else if (
          callbackDeliveryState === 'unavailable' &&
          ['skipped_no_contract', 'skipped_url_not_allowlisted', 'skipped_no_fetch'].includes(
            String(callbackOrchestratorStatus || ''),
          )
        ) {
          degraded_from = 'emit_patch_callback_contract_unsatisfied';
          error_code = 'emit_patch_callback_contract_unsatisfied';
        }
      }
      if (
        tool === 'cursor' &&
        action === 'emit_patch' &&
        callbackContractSnapshot &&
        callbackContractSnapshot.callback_contract_present !== true
      ) {
        degraded_from = 'emit_patch_cloud_requires_callback_contract';
        error_code = 'emit_patch_callback_contract_not_configured';
      }
    } catch (e) {
      fallback_reason = String(e?.message || e).slice(0, 300);
      execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        degraded_from = 'cloud_dispatch_exception';
        result_summary = `degraded / artifact / ${tool}:${action} (cloud dispatch exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = 'cloud_dispatch_exception';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — cloud dispatch exception + artifact failed`;
        error_code = 'cloud_dispatch_exception';
      }
    }
  } else if (automationLaneActive && tr && !tr.ok) {
    live_attempted = true;
    fallback_reason = String(
      tr.error_code || tr.trigger_response_preview || tr.trigger_status || 'cursor_automation_failed',
    ).slice(0, 300);
    if (action === 'create_spec' && canLive) {
      execution_lane = 'local_cli';
      try {
        const lr = await adapter.executeLive(action, payload, env);
        if (lr.ok) {
          execution_mode = 'live';
          status = 'completed';
          outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
          result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
          artifact_path = lr.artifact_path ?? null;
          next_required_input = lr.next_required_input ?? null;
          if (
            threadKey &&
            tool === 'github' &&
            (action === 'create_issue' || action === 'open_pr') &&
            lr.data &&
            typeof lr.data === 'object'
          ) {
            try {
              const { recordGithubInvocationCorrelation } = await import('../providerEventCorrelator.js');
              await recordGithubInvocationCorrelation({
                threadKey,
                packetId: runPacketId,
                action,
                apiData: /** @type {Record<string, unknown>} */ (lr.data),
              });
            } catch (e) {
              console.error('[cos_github_correlation]', e);
            }
          }
        } else {
          fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
          const ar = await runBuildArtifact();
          execution_mode = 'artifact';
          execution_lane = 'artifact';
          if (ar.ok) {
            status = 'degraded';
            outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
            degraded_from = 'live_failure';
            result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
            artifact_path = ar.artifact_path ?? null;
            next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
            error_code = lr.error_code ?? null;
          } else {
            status = 'failed';
            outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
            result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
            error_code = lr.error_code ?? 'artifact_failed';
          }
        }
      } catch (e) {
        fallback_reason = String(e?.message || e).slice(0, 300);
        const ar = await runBuildArtifact();
        execution_mode = 'artifact';
        execution_lane = 'artifact';
        if (ar.ok) {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
          degraded_from = 'live_exception';
          result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
          artifact_path = ar.artifact_path ?? null;
          next_required_input = ar.next_required_input ?? null;
          error_code = 'live_exception';
        } else {
          status = 'failed';
          outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
          error_code = 'live_exception';
        }
      }
    } else {
      execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        degraded_from = 'cursor_automation_failed';
        result_summary = `degraded / artifact / ${tool}:${action} (cursor automation failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = tr.error_code ?? 'cursor_automation_failed';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — automation failed + artifact failed`;
        error_code = tr.error_code ?? 'cursor_automation_failed';
      }
    }
  } else if (canLive) {
    live_attempted = true;
    execution_lane = 'local_cli';
    try {
      const lr = await adapter.executeLive(action, payload, env);
      if (lr.ok) {
        execution_mode = 'live';
        status = 'completed';
        outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
        result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
        artifact_path = lr.artifact_path ?? null;
        next_required_input = lr.next_required_input ?? null;
        if (
          threadKey &&
          tool === 'github' &&
          (action === 'create_issue' || action === 'open_pr') &&
          lr.data &&
          typeof lr.data === 'object'
        ) {
          try {
            const { recordGithubInvocationCorrelation } = await import('../providerEventCorrelator.js');
            await recordGithubInvocationCorrelation({
              threadKey,
              packetId: runPacketId,
              action,
              apiData: /** @type {Record<string, unknown>} */ (lr.data),
            });
          } catch (e) {
            console.error('[cos_github_correlation]', e);
          }
        }
      } else {
        fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
        const ar = await runBuildArtifact();
        execution_mode = 'artifact';
        execution_lane = 'artifact';
        if (ar.ok) {
          status = 'degraded';
          outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
          degraded_from = 'live_failure';
          result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
          artifact_path = ar.artifact_path ?? null;
          next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
          error_code = lr.error_code ?? null;
        } else {
          status = 'failed';
          outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
          error_code = lr.error_code ?? 'artifact_failed';
        }
      }
    } catch (e) {
      fallback_reason = String(e?.message || e).slice(0, 300);
      const ar = await runBuildArtifact();
      execution_mode = 'artifact';
      execution_lane = 'artifact';
      if (ar.ok) {
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        degraded_from = 'live_exception';
        result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
        error_code = 'live_exception';
      } else {
        status = 'failed';
        outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
        error_code = 'live_exception';
      }
    }
  } else {
    live_attempted = false;
    execution_lane = 'artifact';
    const ar = await runBuildArtifact();
    if (ar.ok) {
      execution_mode = 'artifact';
      if (tool === 'cursor' && action === 'emit_patch' && emitPatchCloudSkippedForContract && emitPatchPrep) {
        const { formatEmitPatchCloudGateSummary } = await import('../livePatchPayload.js');
        status = 'degraded';
        outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        degraded_from = 'emit_patch_cloud_contract_not_met';
        const mis = emitPatchPrep.validation.missing_required_fields || [];
        result_summary = `${formatEmitPatchCloudGateSummary(emitPatchPrep)} — ${String(ar.result_summary || '').slice(0, 220)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = mis.length ? mis.slice(0, 8).join(',') : ar.next_required_input ?? null;
      } else {
        status = 'completed';
        outcome_code = TOOL_OUTCOME_CODES.ARTIFACT_PREPARED;
        result_summary = `completed / artifact / ${tool}:${action} — ${String(ar.result_summary || '').slice(0, 300)}`;
        artifact_path = ar.artifact_path ?? null;
        next_required_input = ar.next_required_input ?? null;
      }
    } else {
      execution_mode = 'artifact';
      status = 'failed';
      outcome_code = TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD;
      result_summary = `failed / artifact / ${tool}:${action} — artifact build failed`;
    }
  }

  const needs_review = status === 'degraded' || status === 'failed';

  /** @type {{ missing_required_fields: string[], emit_patch_machine_hints: string[] } | null} */
  let emitPatchFounderExtras = null;
  if (tool === 'cursor' && action === 'emit_patch' && emitPatchPrep && emitPatchCloudSkippedForContract) {
    const { formatEmitPatchMachineBlockedHints } = await import('../livePatchPayload.js');
    emitPatchFounderExtras = {
      missing_required_fields: (emitPatchPrep.validation.missing_required_fields || []).map(String).slice(0, 24),
      emit_patch_machine_hints: formatEmitPatchMachineBlockedHints(emitPatchPrep).slice(0, 12),
    };
  }

  const ledgerPayload = {
    invocation_id,
    tool,
    action,
    execution_mode,
    execution_lane,
    status,
    artifact_path,
    next_required_input,
    error_code,
    result_summary,
    outcome_code,
    live_attempted,
    readiness_snapshot: snap,
    fallback_reason,
    blocked_reason,
    degraded_from,
    needs_review,
    ...(runPacketId ? { run_packet_id: runPacketId } : {}),
    ...(cosRunId ? { cos_run_id: cosRunId } : {}),
    ...(tool === 'cursor' &&
    action === 'emit_patch' &&
    execution_lane === 'cloud_agent' &&
    status === 'degraded'
      ? {
          suppress_from_founder_execution_summary: true,
          suppress_from_founder_review_queue: true,
        }
      : {}),
    ...(cursorAutomationAudit || {}),
  };

  const result = {
    ok: true,
    mode: 'external_tool_invocation',
    invocation_id,
    tool,
    action,
    accepted: true,
    execution_mode,
    execution_lane,
    status,
    outcome_code,
    payload,
    result_summary,
    artifact_path,
    next_required_input,
    needs_review,
    ...(error_code ? { error_code } : {}),
    ...(degraded_from ? { degraded_from } : {}),
    ...(emitPatchFounderExtras
      ? {
          missing_required_fields: emitPatchFounderExtras.missing_required_fields,
          emit_patch_machine_hints: emitPatchFounderExtras.emit_patch_machine_hints,
        }
      : {}),
    ...(cursorAutomationAudit
      ? {
          trigger_status: cursorAutomationAudit.trigger_status,
          external_run_id: cursorAutomationAudit.external_run_id,
          trigger_response_preview: cursorAutomationAudit.trigger_response_preview,
          cursor_automation_request_id: cursorAutomationAudit.cursor_automation_request_id,
          automation_status_raw: cursorAutomationAudit.automation_status_raw,
          automation_branch_raw: cursorAutomationAudit.automation_branch_raw,
          callback_metadata_present: cursorAutomationAudit.callback_metadata_present,
          callback_capability_observed: cursorAutomationAudit.callback_capability_observed,
          callback_metadata_unavailable: cursorAutomationAudit.callback_metadata_unavailable,
          callback_delivery_state: cursorAutomationAudit.callback_delivery_state,
          callback_orchestrator_status: cursorAutomationAudit.callback_orchestrator_status,
          callback_orchestrator_attempts: cursorAutomationAudit.callback_orchestrator_attempts,
          callback_orchestrator_synthetic_posts: cursorAutomationAudit.callback_orchestrator_synthetic_posts,
        }
      : {}),
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

  return result;
}

export { dispatchExternalToolCall as invokeExternalTool };