/**
 * Cursor lane: cloud automation trigger, callback orchestration, ledger bind/correlation,
 * and live/artifact fallbacks (including generic canLive path when cloud lane is inactive).
 */

import { appendExecutionArtifact } from '../../../executionLedger.js';
import { shouldSkipGithubRecoveryEnvelopeRegistration } from '../../../livePatchPayload.js';
import {
  triggerCursorAutomation,
  acceptanceResponseHasCallbackMetadataKeys,
  computeEmitPatchCursorAutomationTruth,
  isCursorAutomationSmokeMode,
} from '../../../cursorCloudAdapter.js';
import { TOOL_OUTCOME_CODES } from '../../toolLaneContract.js';
import { mapOrchestratorStatusToDeliveryState } from './cursorOrchestratorStatusMap.js';

/**
 * @param {object} ctx
 * @param {Record<string, unknown>} ctx.out — mutable dispatch outcome (execution_mode, status, …).
 * @returns {Promise<{ shortCircuit: Record<string, unknown> | null }>}
 */
export async function runCursorCloudAutomationExecutionBranch(ctx) {
  const {
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
  } = ctx;

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
      const { describeTriggerCallbackContractForOps } = await import('../../../cursorCloudAdapter.js');
      callbackContractSnapshot = describeTriggerCallbackContractForOps(env);
      callbackMetadataPresent = callbackContractSnapshot?.callback_contract_present === true;
      const { recordOpsSmokeTriggerCallbackContract } = await import('../../../smokeOps.js');
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
    const { bindCursorEmitPatchDispatchLedgerBeforeTrigger } = await import('../../../providerEventCorrelator.js');
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
        shortCircuit: {
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
        },
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
      const { recordOpsSmokeCursorTrigger } = await import('../../../smokeOps.js');
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

  if (automationLaneActive && tr) {
    const acceptanceEchoHasCallbackMetadata = acceptanceResponseHasCallbackMetadataKeys(tr, env);
    callbackMetadataPresent = callbackMetadataPresent || acceptanceEchoHasCallbackMetadata;
    if (callbackMetadataPresent) callbackCapabilityObserved = true;
    out.cursorAutomationAudit = {
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
    out.live_attempted = true;
    out.execution_lane = 'cloud_agent';
    try {
      const cloudRunId = String(tr.external_run_id || '').trim() || `cr_${invocation_id}`;
      let correlation_registered = false;
      if (threadKey) {
        const { recordCursorCloudCorrelation } = await import('../../../providerEventCorrelator.js');
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
            const { registerRecoveryEnvelopeFromEmitPatchAccept } = await import('../../../resultRecoveryBridge.js');
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
            '../../../cursorCallbackCompletionOrchestrator.js'
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
              const { recordOpsSmokePhase } = await import('../../../smokeOps.js');
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
      if (out.cursorAutomationAudit) {
        out.cursorAutomationAudit = {
          ...out.cursorAutomationAudit,
          callback_metadata_present: callbackMetadataPresent,
          callback_capability_observed: callbackCapabilityObserved,
          callback_metadata_unavailable: !callbackMetadataPresent,
          callback_delivery_state: callbackDeliveryState,
          callback_orchestrator_status: callbackOrchestratorStatus,
          callback_orchestrator_attempts: callbackOrchestratorAttempts,
          callback_orchestrator_synthetic_posts: callbackOrchestratorSyntheticPosts,
        };
      }
      out.execution_mode = 'live';
      out.status = 'running';
      out.outcome_code = TOOL_OUTCOME_CODES.CLOUD_AGENT_DISPATCH_ACCEPTED;
      out.result_summary = `running / cloud_agent / cursor:${action} — dispatch accepted (${cloudRunId}); webhook completes`;
      out.artifact_path = null;
      out.next_required_input = null;

      const emitPatchClosureOrchestratorRan =
        tool === 'cursor' &&
        action === 'emit_patch' &&
        callbackOrchestratorStatus != null &&
        callbackOrchestratorStatus !== 'skipped_policy_gate';
      if (emitPatchClosureOrchestratorRan) {
        if (callbackDeliveryState === 'timeout') {
          out.degraded_from = 'emit_patch_callback_timeout';
          out.error_code = 'emit_patch_callback_timeout';
        } else if (
          callbackDeliveryState === 'unavailable' &&
          ['skipped_no_contract', 'skipped_url_not_allowlisted', 'skipped_no_fetch'].includes(
            String(callbackOrchestratorStatus || ''),
          )
        ) {
          out.degraded_from = 'emit_patch_callback_contract_unsatisfied';
          out.error_code = 'emit_patch_callback_contract_unsatisfied';
        }
      }
      if (
        tool === 'cursor' &&
        action === 'emit_patch' &&
        callbackContractSnapshot &&
        callbackContractSnapshot.callback_contract_present !== true
      ) {
        out.degraded_from = 'emit_patch_cloud_requires_callback_contract';
        out.error_code = 'emit_patch_callback_contract_not_configured';
      }
    } catch (e) {
      out.fallback_reason = String(e?.message || e).slice(0, 300);
      out.execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      out.execution_mode = 'artifact';
      if (ar.ok) {
        out.status = 'degraded';
        out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        out.degraded_from = 'cloud_dispatch_exception';
        out.result_summary = `degraded / artifact / ${tool}:${action} (cloud dispatch exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        out.artifact_path = ar.artifact_path ?? null;
        out.next_required_input = ar.next_required_input ?? null;
        out.error_code = 'cloud_dispatch_exception';
      } else {
        out.status = 'failed';
        out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        out.result_summary = `failed / artifact / ${tool}:${action} — cloud dispatch exception + artifact failed`;
        out.error_code = 'cloud_dispatch_exception';
      }
    }
  } else if (automationLaneActive && tr && !tr.ok) {
    out.live_attempted = true;
    out.fallback_reason = String(
      tr.error_code || tr.trigger_response_preview || tr.trigger_status || 'cursor_automation_failed',
    ).slice(0, 300);
    if (action === 'create_spec' && canLive) {
      out.execution_lane = 'local_cli';
      try {
        const lr = await adapter.executeLive(action, payload, env);
        if (lr.ok) {
          out.execution_mode = 'live';
          out.status = 'completed';
          out.outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
          out.result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
          out.artifact_path = lr.artifact_path ?? null;
          out.next_required_input = lr.next_required_input ?? null;
          if (
            threadKey &&
            tool === 'github' &&
            (action === 'create_issue' || action === 'open_pr') &&
            lr.data &&
            typeof lr.data === 'object'
          ) {
            try {
              const { recordGithubInvocationCorrelation } = await import('../../../providerEventCorrelator.js');
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
          out.fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
          const ar = await runBuildArtifact();
          out.execution_mode = 'artifact';
          out.execution_lane = 'artifact';
          if (ar.ok) {
            out.status = 'degraded';
            out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
            out.degraded_from = 'live_failure';
            out.result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
            out.artifact_path = ar.artifact_path ?? null;
            out.next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
            out.error_code = lr.error_code ?? null;
          } else {
            out.status = 'failed';
            out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
            out.result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
            out.error_code = lr.error_code ?? 'artifact_failed';
          }
        }
      } catch (e) {
        out.fallback_reason = String(e?.message || e).slice(0, 300);
        const ar = await runBuildArtifact();
        out.execution_mode = 'artifact';
        out.execution_lane = 'artifact';
        if (ar.ok) {
          out.status = 'degraded';
          out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
          out.degraded_from = 'live_exception';
          out.result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
          out.artifact_path = ar.artifact_path ?? null;
          out.next_required_input = ar.next_required_input ?? null;
          out.error_code = 'live_exception';
        } else {
          out.status = 'failed';
          out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          out.result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
          out.error_code = 'live_exception';
        }
      }
    } else {
      out.execution_lane = 'artifact';
      const ar = await runBuildArtifact();
      out.execution_mode = 'artifact';
      if (ar.ok) {
        out.status = 'degraded';
        out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        out.degraded_from = 'cursor_automation_failed';
        out.result_summary = `degraded / artifact / ${tool}:${action} (cursor automation failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
        out.artifact_path = ar.artifact_path ?? null;
        out.next_required_input = ar.next_required_input ?? null;
        out.error_code = tr.error_code ?? 'cursor_automation_failed';
      } else {
        out.status = 'failed';
        out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        out.result_summary = `failed / artifact / ${tool}:${action} — automation failed + artifact failed`;
        out.error_code = tr.error_code ?? 'cursor_automation_failed';
      }
    }
  } else if (canLive) {
    out.live_attempted = true;
    out.execution_lane = 'local_cli';
    try {
      const lr = await adapter.executeLive(action, payload, env);
      if (lr.ok) {
        out.execution_mode = 'live';
        out.status = 'completed';
        out.outcome_code = TOOL_OUTCOME_CODES.LIVE_COMPLETED;
        out.result_summary = `completed / live / ${tool}:${action} — ${String(lr.result_summary || '').slice(0, 400)}`;
        out.artifact_path = lr.artifact_path ?? null;
        out.next_required_input = lr.next_required_input ?? null;
        if (
          threadKey &&
          tool === 'github' &&
          (action === 'create_issue' || action === 'open_pr') &&
          lr.data &&
          typeof lr.data === 'object'
        ) {
          try {
            const { recordGithubInvocationCorrelation } = await import('../../../providerEventCorrelator.js');
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
        out.fallback_reason = String(lr.result_summary || 'live failed').slice(0, 300);
        const ar = await runBuildArtifact();
        out.execution_mode = 'artifact';
        out.execution_lane = 'artifact';
        if (ar.ok) {
          out.status = 'degraded';
          out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
          out.degraded_from = 'live_failure';
          out.result_summary = `degraded / artifact / ${tool}:${action} (live failed) — ${String(ar.result_summary || '').slice(0, 200)}`;
          out.artifact_path = ar.artifact_path ?? null;
          out.next_required_input = ar.next_required_input ?? lr.next_required_input ?? null;
          out.error_code = lr.error_code ?? null;
        } else {
          out.status = 'failed';
          out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
          out.result_summary = `failed / artifact / ${tool}:${action} — live+artifact both failed`;
          out.error_code = lr.error_code ?? 'artifact_failed';
        }
      }
    } catch (e) {
      out.fallback_reason = String(e?.message || e).slice(0, 300);
      const ar = await runBuildArtifact();
      out.execution_mode = 'artifact';
      out.execution_lane = 'artifact';
      if (ar.ok) {
        out.status = 'degraded';
        out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_EXCEPTION;
        out.degraded_from = 'live_exception';
        out.result_summary = `degraded / artifact / ${tool}:${action} (live exception) — ${String(ar.result_summary || '').slice(0, 200)}`;
        out.artifact_path = ar.artifact_path ?? null;
        out.next_required_input = ar.next_required_input ?? null;
        out.error_code = 'live_exception';
      } else {
        out.status = 'failed';
        out.outcome_code = TOOL_OUTCOME_CODES.FAILED_LIVE_AND_ARTIFACT;
        out.result_summary = `failed / artifact / ${tool}:${action} — live exception + artifact failed`;
        out.error_code = 'live_exception';
      }
    }
  } else {
    out.live_attempted = false;
    out.execution_lane = 'artifact';
    const ar = await runBuildArtifact();
    if (ar.ok) {
      out.execution_mode = 'artifact';
      if (tool === 'cursor' && action === 'emit_patch' && emitPatchCloudSkippedForContract && emitPatchPrep) {
        const { formatEmitPatchCloudGateSummary } = await import('../../../livePatchPayload.js');
        out.status = 'degraded';
        out.outcome_code = TOOL_OUTCOME_CODES.DEGRADED_FROM_LIVE_FAILURE;
        out.degraded_from = 'emit_patch_cloud_contract_not_met';
        const mis = emitPatchPrep.validation.missing_required_fields || [];
        out.result_summary = `${formatEmitPatchCloudGateSummary(emitPatchPrep)} — ${String(ar.result_summary || '').slice(0, 220)}`;
        out.artifact_path = ar.artifact_path ?? null;
        out.next_required_input = mis.length ? mis.slice(0, 8).join(',') : ar.next_required_input ?? null;
      } else {
        out.status = 'completed';
        out.outcome_code = TOOL_OUTCOME_CODES.ARTIFACT_PREPARED;
        out.result_summary = `completed / artifact / ${tool}:${action} — ${String(ar.result_summary || '').slice(0, 300)}`;
        out.artifact_path = ar.artifact_path ?? null;
        out.next_required_input = ar.next_required_input ?? null;
      }
    } else {
      out.execution_mode = 'artifact';
      out.status = 'failed';
      out.outcome_code = TOOL_OUTCOME_CODES.FAILED_ARTIFACT_BUILD;
      out.result_summary = `failed / artifact / ${tool}:${action} — artifact build failed`;
    }
  }
  return { shortCircuit: null };
}
