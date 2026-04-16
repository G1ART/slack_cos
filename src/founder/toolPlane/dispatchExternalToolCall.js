/**
 * Runtime external tool dispatch (W1 SSOT). Founder path calls this module;
 * toolsBridge re-exports as invokeExternalTool for compatibility.
 */

import crypto from 'node:crypto';
import { appendExecutionArtifact } from '../executionLedger.js';
import { mergeLedgerExecutionRowPayload } from '../canonicalExecutionEnvelope.js';
import { isOpsSmokeEnabled, resolveSmokeSessionId } from '../smokeOps.js';
import { recordCosPretriggerAudit } from '../pretriggerAudit.js';
import { ALL_EXTERNAL_TOOLS, isValidToolAction } from './toolLaneActions.js';
import { getAdapterReadiness } from './toolLaneReadiness.js';
import { toolInvocationBlocked } from './toolInvocationPrecheck.js';
import { getLaneAdapter } from './externalToolLaneRegistry.js';
import { TOOL_OUTCOME_CODES, __invokeToolTestHooks } from './toolLaneContract.js';
import { isCursorCloudAgentLaneReady } from '../cursorCloudAdapter.js';
import { prepareEmitPatchPayloadWithDelegate } from './lanes/cursor/cursorDelegateMerge.js';
import {
  tryEmitPatchDelegateContractEarlyExit,
  tryCursorExecutionProfileEarlyExit,
} from './lanes/cursor/cursorEarlyExitBlocks.js';
import { tryEmitPatchCloudCompileOrReturnBlocked } from './lanes/cursor/cursorEmitPatchAssemblyBlock.js';
import { runCursorCloudAutomationExecutionBranch } from './lanes/cursor/cursorCloudAutomationPath.js';

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


  const prep = await prepareEmitPatchPayloadWithDelegate(threadKey, tool, action, payload);
  payload = prep.payload;
  const emitPatchMergedFromDelegate = prep.emitPatchMergedFromDelegate;
  const delegateEmitPatchModule = prep.delegateEmitPatchModule;

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

  const earlyDelegate = await tryEmitPatchDelegateContractEarlyExit({
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
  });
  if (earlyDelegate) return earlyDelegate;

  const earlyProfile = await tryCursorExecutionProfileEarlyExit({
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
  });
  if (earlyProfile) return earlyProfile;

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

  const out = {
    execution_mode: 'artifact',
    status: 'failed',
    outcome_code: TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD,
    result_summary: '',
    artifact_path: null,
    next_required_input: null,
    error_code: null,
    live_attempted: false,
    fallback_reason: null,
    degraded_from: null,
    execution_lane: 'artifact',
    cursorAutomationAudit: /** @type {Record<string, unknown> | null} */ (null),
  };

  const automationLane =
    tool === 'cursor' &&
    (action === 'create_spec' || action === 'emit_patch') &&
    isCursorCloudAgentLaneReady(env) &&
    __invokeToolTestHooks.failArtifactForTool !== tool;

  let automationLaneActive = automationLane;
  let emitPatchPrep = null;
  let emitPatchCloudSkippedForContract = false;

  const asm = await tryEmitPatchCloudCompileOrReturnBlocked({
    tool,
    action,
    automationLane,
    payload,
    threadKey,
    cosRunId,
    opsSmokeSessionId,
    opsAttemptSeq,
    emitPatchMergedFromDelegate,
    invocation_id,
    snap,
    runPacketId,
    envelopeArtifactPayload,
  });
  if (asm.blocked) return asm.blocked;
  payload = asm.payload;
  emitPatchPrep = asm.emitPatchPrep;
  automationLaneActive = asm.automationLaneActive;
  emitPatchCloudSkippedForContract = asm.emitPatchCloudSkippedForContract;

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

  const branch = await runCursorCloudAutomationExecutionBranch({
    env,
    tool,
    action,
    payload,
    adapter,
    invocation_id,
    threadKey,
    runPacketId,
    cosRunId,
    opsSmokeSessionId,
    opsAttemptSeq,
    snap,
    automationLaneActive,
    emitPatchPrep,
    emitPatchCloudSkippedForContract,
    emitPatchMergedFromDelegate,
    canLive,
    envelopeArtifactPayload,
    runBuildArtifact,
    out,
  });
  if (branch.shortCircuit) return branch.shortCircuit;

  let execution_mode = out.execution_mode;
  let status = out.status;
  let outcome_code = out.outcome_code;
  let result_summary = out.result_summary;
  let artifact_path = out.artifact_path;
  let next_required_input = out.next_required_input;
  let error_code = out.error_code;
  let live_attempted = out.live_attempted;
  let fallback_reason = out.fallback_reason;
  const blocked_reason = null;
  let degraded_from = out.degraded_from;
  let execution_lane = out.execution_lane;
  let cursorAutomationAudit = out.cursorAutomationAudit;

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
