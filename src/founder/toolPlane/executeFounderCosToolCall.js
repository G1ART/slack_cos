/**
 * Single founder COS Responses function_call → result JSON (tool loop dispatch).
 */

import { runHarnessOrchestration } from '../harnessBridge.js';
import { dispatchExternalToolCall } from './dispatchExternalToolCall.js';
import {
  persistAcceptedRunShell,
  finalizeRunAfterStarterKickoff,
  persistRunAfterDelegate,
} from '../executionRunStore.js';
import { executeStarterKickoffIfEligible } from '../starterLadder.js';
import { stashDelegateEmitPatchContext } from '../delegateEmitPatchStash.js';
import { recordCosPretriggerAudit } from '../pretriggerAudit.js';
import { cosRunTenancyMergeHintsFromRunRow } from '../parcelDeploymentContext.js';
import { validateToolCallArgs } from './cosFounderToolValidation.js';
import { handleRecordExecutionNote, handleReadExecutionContext } from '../founderCosToolHandlers.js';

/**
 * @param {{
 *   call: { name: string, arguments?: string, call_id: string },
 *   args: Record<string, unknown>,
 *   threadKey: string,
 *   smTurn: string | null | undefined,
 *   auditRunId: string,
 *   activeRun: Record<string, unknown> | null | undefined,
 *   founderRequestSummary: string,
 * }} p
 * @returns {Promise<Record<string, unknown>>}
 */
export async function executeFounderCosToolCall(p) {
  const { call, args, threadKey: tk, smTurn, auditRunId, activeRun, founderRequestSummary } = p;
  const callName = String(call.name || '');

  if (smTurn && callName === 'delegate_harness_team') {
    try {
      await recordCosPretriggerAudit({
        env: process.env,
        threadKey: tk,
        runId: auditRunId,
        smoke_session_id: smTurn,
        call_name: callName,
        args,
        blocked: false,
      });
    } catch (e) {
      console.error('[pretrigger_audit]', e);
    }
  }

  const schema = validateToolCallArgs(callName, args);
  if (schema.blocked) {
    const result = {
      ok: false,
      blocked: true,
      reason: schema.reason,
      ...(schema.blocked_reason ? { blocked_reason: schema.blocked_reason } : {}),
      ...(schema.machine_hint ? { machine_hint: schema.machine_hint } : {}),
      ...(Array.isArray(schema.missing_required_fields)
        ? { missing_required_fields: schema.missing_required_fields }
        : {}),
      ...(Array.isArray(schema.invalid_enum_fields) ? { invalid_enum_fields: schema.invalid_enum_fields } : {}),
      ...(Array.isArray(schema.invalid_nested_fields)
        ? { invalid_nested_fields: schema.invalid_nested_fields }
        : {}),
      ...(Array.isArray(schema.delegate_schema_error_fields)
        ? { delegate_schema_error_fields: schema.delegate_schema_error_fields }
        : {}),
    };
    if (smTurn && (callName === 'delegate_harness_team' || callName === 'invoke_external_tool')) {
      try {
        await recordCosPretriggerAudit({
          env: process.env,
          threadKey: tk,
          runId: auditRunId,
          smoke_session_id: smTurn,
          call_name: callName,
          args,
          blocked: true,
          machine_hint: schema.machine_hint,
          blocked_reason: schema.blocked_reason || schema.reason,
          missing_required_fields: schema.missing_required_fields,
          invalid_enum_fields: schema.invalid_enum_fields,
          invalid_nested_fields: schema.invalid_nested_fields,
          delegate_schema_valid:
            schema.delegate_schema_valid === true || schema.delegate_schema_valid === false
              ? schema.delegate_schema_valid
              : false,
          delegate_schema_error_fields: schema.delegate_schema_error_fields,
        });
      } catch (e) {
        console.error('[pretrigger_audit]', e);
      }
    }
    return result;
  }

  if (callName === 'delegate_harness_team') {
    let result = await runHarnessOrchestration(args, {
      threadKey: tk,
      ...(auditRunId ? { runId: auditRunId } : {}),
      ...(activeRun ? { runTenancy: cosRunTenancyMergeHintsFromRunRow(activeRun) } : {}),
    });
    if (result && result.ok && String(result.status) === 'accepted' && tk) {
      stashDelegateEmitPatchContext(tk, /** @type {Record<string, unknown>} */ (result));
      const shell = await persistAcceptedRunShell({
        threadKey: tk,
        dispatch: result,
        founder_request_summary: founderRequestSummary,
      });
      const runId = shell?.id != null ? String(shell.id).trim() : '';
      let kick;
      if (runId) {
        kick = await executeStarterKickoffIfEligible({
          threadKey: tk,
          dispatch: result,
          env: process.env,
          cosRunId: runId,
        });
        result = { ...result, starter_kickoff: kick };
        await finalizeRunAfterStarterKickoff({
          runId,
          threadKey: tk,
          dispatch: result,
          starter_kickoff: kick,
          founder_request_summary: founderRequestSummary,
        });
      } else {
        kick = await executeStarterKickoffIfEligible({
          threadKey: tk,
          dispatch: result,
          env: process.env,
        });
        result = { ...result, starter_kickoff: kick };
        await persistRunAfterDelegate({
          threadKey: tk,
          dispatch: result,
          starter_kickoff: kick,
          founder_request_summary: founderRequestSummary,
        });
      }
    }
    return result;
  }

  if (callName === 'invoke_external_tool') {
    if (smTurn && auditRunId) {
      try {
        await recordCosPretriggerAudit({
          env: process.env,
          threadKey: tk,
          runId: auditRunId,
          smoke_session_id: smTurn,
          call_name: callName,
          args,
          blocked: false,
        });
      } catch (e) {
        console.error('[pretrigger_audit]', e);
      }
    }
    return dispatchExternalToolCall(args, {
      threadKey: tk,
      ...(smTurn ? { ops_smoke_session_id: smTurn } : {}),
      ...(auditRunId ? { cosRunId: auditRunId } : {}),
      ...(activeRun ? { runTenancy: cosRunTenancyMergeHintsFromRunRow(activeRun) } : {}),
    });
  }

  if (callName === 'record_execution_note') {
    return handleRecordExecutionNote(args, tk);
  }
  if (callName === 'read_execution_context') {
    return handleReadExecutionContext(args, tk);
  }

  return { ok: false, error: 'unknown_tool', name: callName };
}
