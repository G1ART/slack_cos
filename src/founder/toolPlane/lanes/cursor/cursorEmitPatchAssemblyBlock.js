/**
 * Cursor emit_patch: cloud automation compile + early blocked return when assembly contract fails.
 */

import { appendExecutionArtifact } from '../../../executionLedger.js';
import {
  compileEmitPatchForCloudAutomation,
  describeEmitPatchAssemblyBlock,
  REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET,
} from '../../../cursorLivePatchDispatch.js';
import { recordCosPretriggerAudit } from '../../../pretriggerAudit.js';
import {
  EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD,
  TOOL_OUTCOME_CODES,
} from '../../toolLaneContract.js';

/**
 * @param {object} p
 * @returns {Promise<{ blocked: Record<string, unknown> | null, payload: Record<string, unknown>, emitPatchPrep: object | null, automationLaneActive: boolean, emitPatchCloudSkippedForContract: boolean }>}
 */
export async function tryEmitPatchCloudCompileOrReturnBlocked(p) {
  const {
    tool,
    action,
    automationLane,
    payload: payloadIn,
    threadKey,
    cosRunId,
    opsSmokeSessionId,
    opsAttemptSeq,
    emitPatchMergedFromDelegate,
    invocation_id,
    snap,
    runPacketId,
    envelopeArtifactPayload,
  } = p;

  let payload = payloadIn;
  let emitPatchPrep = null;
  let emitPatchCloudSkippedForContract = false;
  let automationLaneActive = automationLane;

  if (!(tool === 'cursor' && action === 'emit_patch' && automationLane)) {
    return {
      blocked: null,
      payload,
      emitPatchPrep,
      automationLaneActive,
      emitPatchCloudSkippedForContract,
    };
  }

  emitPatchPrep = compileEmitPatchForCloudAutomation(payload);
  payload = emitPatchPrep.payload;
  if (cosRunId && threadKey) {
    try {
      const { recordOpsSmokeEmitPatchCloudGate } = await import('../../../smokeOps.js');
      await recordOpsSmokeEmitPatchCloudGate({
        env: process.env,
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
  if (emitPatchPrep.cloud_ok) {
    return {
      blocked: null,
      payload,
      emitPatchPrep,
      automationLaneActive,
      emitPatchCloudSkippedForContract,
    };
  }

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
        env: process.env,
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
  return {
    blocked: blockedAssembly,
    payload,
    emitPatchPrep,
    automationLaneActive,
    emitPatchCloudSkippedForContract,
  };
}
