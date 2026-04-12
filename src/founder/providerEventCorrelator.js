/**
 * Record external object ↔ run correlation after successful adapter calls.
 * Cursor callbacks resolve via `object_type: cloud_agent_run` + `object_id` (= Automation 응답 run id).
 * v13.75: explicit `runId` binds correlation to the dispatch target run (not thread-active latest).
 */

import { getActiveRunForThread, getRunById, patchRunById } from './executionRunStore.js';
import { upsertExternalCorrelation } from './correlationStore.js';
import { appendCosRunEvent, appendCosRunEventForRun } from './runCosEvents.js';
import {
  computeEmitPatchPayloadPathFingerprint,
  listNormalizedEmitPatchPathsForAnchor,
} from './cursorCallbackGate.js';
import { resolveCursorAutomationRequestId } from './cursorCloudAdapter.js';
import { packetIdIfEmitPatchOnRun } from './canonicalExternalEvent.js';

/**
 * @param {{ threadKey: string, runId?: string | null }} ctx
 */
async function resolveRunForCursorCorrelation(ctx) {
  const threadKey = String(ctx.threadKey || '').trim();
  const explicit = ctx.runId != null && String(ctx.runId).trim() ? String(ctx.runId).trim() : '';
  if (explicit) {
    const run = await getRunById(explicit);
    if (!run?.id) return null;
    if (String(run.thread_key || '').trim() !== threadKey) return null;
    return run;
  }
  return getActiveRunForThread(threadKey);
}

/**
 * v13.75 — Before Cursor HTTP trigger: durable correlation rows + run ledger for exact run_id/packet_id.
 * @param {{
 *   threadKey: string,
 *   runId: string,
 *   packetId: string,
 *   invocation_id: string,
 *   payload: Record<string, unknown>,
 * }} ctx
 * @returns {Promise<{ ok: true, request_id: string } | { ok: false, code: string }>}
 */
export async function bindCursorEmitPatchDispatchLedgerBeforeTrigger(ctx) {
  const threadKey = String(ctx.threadKey || '').trim();
  const runId = String(ctx.runId || '').trim();
  const packetId = String(ctx.packetId || '').trim();
  const invocation_id = String(ctx.invocation_id || '').trim();
  const payload = ctx.payload && typeof ctx.payload === 'object' && !Array.isArray(ctx.payload) ? ctx.payload : {};
  if (!threadKey || !runId || !packetId || !invocation_id) {
    return { ok: false, code: 'missing_bind_inputs' };
  }
  const run = await getRunById(runId);
  if (!run?.id) return { ok: false, code: 'run_not_found' };
  if (String(run.thread_key || '').trim() !== threadKey) return { ok: false, code: 'thread_key_mismatch' };
  const req = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String) : [];
  if (!req.includes(packetId)) return { ok: false, code: 'packet_not_in_required_graph' };
  if (!packetIdIfEmitPatchOnRun(run, packetId)) return { ok: false, code: 'packet_not_emit_patch_target' };

  const request_id = resolveCursorAutomationRequestId(invocation_id);
  const emitFp = computeEmitPatchPayloadPathFingerprint(payload);

  const okAcc = await upsertExternalCorrelation({
    run_id: runId,
    thread_key: threadKey,
    packet_id: packetId,
    provider: 'cursor',
    object_type: 'accepted_external_id',
    object_id: request_id,
  });
  if (!okAcc) return { ok: false, code: 'correlation_upsert_failed' };

  if (emitFp) {
    const okFp = await upsertExternalCorrelation({
      run_id: runId,
      thread_key: threadKey,
      packet_id: packetId,
      provider: 'cursor',
      object_type: 'automation_request_path_fp',
      object_id: `${request_id}|${emitFp}`,
    });
    if (!okFp) return { ok: false, code: 'correlation_fp_upsert_failed' };
  }

  const prevAnchor =
    run.cursor_callback_anchor && typeof run.cursor_callback_anchor === 'object'
      ? /** @type {Record<string, unknown>} */ (run.cursor_callback_anchor)
      : {};
  const now = new Date().toISOString();
  await patchRunById(runId, {
    cursor_dispatch_ledger: {
      bound_at: now,
      automation_request_id: request_id,
      target_packet_id: packetId,
      pending_provider_callback: true,
      selected_tool: 'cursor',
      selected_action: 'emit_patch',
    },
    cursor_callback_anchor: {
      ...prevAnchor,
      packet_id: packetId,
      action: 'emit_patch',
      pre_dispatch_bound_at: now,
    },
  });

  await appendCosRunEventForRun(
    runId,
    'cursor_dispatch_ledger_bound',
    {
      automation_request_id: request_id,
      target_packet_id: packetId,
    },
    {},
  );

  return { ok: true, request_id };
}

/**
 * @param {{
 *   threadKey: string,
 *   packetId?: string,
 *   action: string,
 *   apiData: Record<string, unknown>,
 * }} ctx
 */
export async function recordGithubInvocationCorrelation(ctx) {
  const threadKey = String(ctx.threadKey || '').trim();
  if (!threadKey) return false;
  const run = await getActiveRunForThread(threadKey);
  if (!run?.id) return false;
  const data = ctx.apiData && typeof ctx.apiData === 'object' ? ctx.apiData : {};
  const number = data.number;
  if (number == null) return false;
  const action = String(ctx.action || '');
  const object_type = action === 'open_pr' ? 'pull_request' : 'issue';
  const object_id = String(number);
  const packetId = ctx.packetId != null ? String(ctx.packetId).trim() : '';

  const ok = await upsertExternalCorrelation({
    run_id: String(run.id),
    thread_key: threadKey,
    packet_id: packetId || null,
    provider: 'github',
    object_type,
    object_id,
  });
  if (!ok) return false;

  await appendCosRunEvent(threadKey, 'tool_invoked', {
    tool: 'github',
    action,
    object_type,
    object_id,
    correlation_registered: true,
  });
  return true;
}

/**
 * @param {{
 *   threadKey: string,
 *   runId?: string | null,
 *   packetId?: string,
 *   cloudRunId: string,
 *   action?: string,
 *   acceptedExternalId?: string | null,
 *   automationRequestId?: string | null,
 *   emitPatchPathFingerprint?: string | null,
 *   payload?: Record<string, unknown>,
 *   automationBranchRaw?: string | null,
 * }} ctx
 */
export async function recordCursorCloudCorrelation(ctx) {
  const threadKey = String(ctx.threadKey || '').trim();
  const cloudRunId = String(ctx.cloudRunId || '').trim();
  const cursorAction = String(ctx.action || 'create_spec').trim() || 'create_spec';
  const acceptedExternalId = String(ctx.acceptedExternalId || '').trim();
  const automationRequestId = String(ctx.automationRequestId || '').trim();
  let emitFp = String(ctx.emitPatchPathFingerprint || '').trim();
  if (!emitFp && ctx.payload && typeof ctx.payload === 'object' && cursorAction === 'emit_patch') {
    emitFp = computeEmitPatchPayloadPathFingerprint(ctx.payload);
  }

  if (!threadKey) return false;
  if (!cloudRunId && !acceptedExternalId && !(automationRequestId && emitFp) && !automationRequestId) return false;

  const run = await resolveRunForCursorCorrelation({ threadKey, runId: ctx.runId });
  if (!run?.id) return false;
  const rid = String(run.id);
  const packetId = ctx.packetId != null ? String(ctx.packetId).trim() : '';

  let anyOk = false;
  if (cloudRunId) {
    const ok = await upsertExternalCorrelation({
      run_id: rid,
      thread_key: threadKey,
      packet_id: packetId || null,
      provider: 'cursor',
      object_type: 'cloud_agent_run',
      object_id: cloudRunId,
    });
    if (ok) anyOk = true;
  }
  /** Bind-time tool_* id — authoritative for webhook intake; reaffirm after trigger accept (v13.82). */
  if (automationRequestId) {
    const ok = await upsertExternalCorrelation({
      run_id: rid,
      thread_key: threadKey,
      packet_id: packetId || null,
      provider: 'cursor',
      object_type: 'accepted_external_id',
      object_id: automationRequestId,
    });
    if (ok) anyOk = true;
  }
  if (acceptedExternalId && acceptedExternalId !== automationRequestId) {
    const ok = await upsertExternalCorrelation({
      run_id: rid,
      thread_key: threadKey,
      packet_id: packetId || null,
      provider: 'cursor',
      object_type: 'accepted_external_id',
      object_id: acceptedExternalId,
    });
    if (ok) anyOk = true;
  }
  if (automationRequestId && emitFp) {
    const ok = await upsertExternalCorrelation({
      run_id: rid,
      thread_key: threadKey,
      packet_id: packetId || null,
      provider: 'cursor',
      object_type: 'automation_request_path_fp',
      object_id: `${automationRequestId}|${emitFp}`,
    });
    if (ok) anyOk = true;
  }
  if (!anyOk) return false;

  /** @type {string[]} */
  const anchorParts = [];
  if (cloudRunId) anchorParts.push('cloud_agent_run');
  if (automationRequestId || acceptedExternalId) anchorParts.push('accepted_external_id');
  if (automationRequestId && emitFp) anchorParts.push('automation_request_path_fp');
  const anchorKind =
    anchorParts.length === 0 ? 'none' : anchorParts.length === 1 ? anchorParts[0] : 'mixed';

  const emitPaths =
    cursorAction === 'emit_patch' && ctx.payload && typeof ctx.payload === 'object'
      ? listNormalizedEmitPatchPathsForAnchor(ctx.payload).slice(0, 48)
      : [];
  const automationBranchRaw =
    ctx.automationBranchRaw != null && String(ctx.automationBranchRaw).trim()
      ? String(ctx.automationBranchRaw).trim().slice(0, 200)
      : null;

  const prevCbAnchor =
    run.cursor_callback_anchor && typeof run.cursor_callback_anchor === 'object'
      ? /** @type {Record<string, unknown>} */ ({ ...run.cursor_callback_anchor })
      : {};
  const anchor = {
    ...prevCbAnchor,
    captured_at: new Date().toISOString(),
    cloud_run_id: cloudRunId || null,
    accepted_external_id: acceptedExternalId || null,
    accepted_anchor_kind: anchorKind,
    automation_request_id: automationRequestId || null,
    emit_patch_path_fingerprint: emitFp || null,
    emit_patch_requested_paths: emitPaths.length ? emitPaths : null,
    automation_branch_raw: automationBranchRaw,
    action: cursorAction,
    packet_id: packetId || null,
  };
  try {
    await patchRunById(rid, { cursor_callback_anchor: anchor });
  } catch (e) {
    console.error('[record_cursor_cloud_correlation]', e);
  }

  await appendCosRunEventForRun(rid, 'tool_invoked', {
    tool: 'cursor',
    action: cursorAction,
    object_type: 'cloud_agent_run',
    object_id: cloudRunId || acceptedExternalId || `${automationRequestId}|${emitFp}`,
    correlation_registered: true,
    execution_lane: 'cloud_agent',
    cursor_correlation_anchors: {
      has_cloud_agent_run: Boolean(cloudRunId),
      has_accepted_external_id: Boolean(acceptedExternalId || automationRequestId),
      has_request_path_fp: Boolean(automationRequestId && emitFp),
    },
  });
  return true;
}
