/**
 * Record external object ↔ run correlation after successful adapter calls.
 * Cursor callbacks resolve via `object_type: cloud_agent_run` + `object_id` (= Automation 응답 run id).
 */

import { getActiveRunForThread, patchRunById } from './executionRunStore.js';
import { upsertExternalCorrelation } from './correlationStore.js';
import { appendCosRunEvent } from './runCosEvents.js';
import {
  computeEmitPatchPayloadPathFingerprint,
  listNormalizedEmitPatchPathsForAnchor,
} from './cursorCallbackGate.js';

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
  if (!cloudRunId && !acceptedExternalId && !(automationRequestId && emitFp)) return false;

  const run = await getActiveRunForThread(threadKey);
  if (!run?.id) return false;
  const packetId = ctx.packetId != null ? String(ctx.packetId).trim() : '';

  let anyOk = false;
  if (cloudRunId) {
    const ok = await upsertExternalCorrelation({
      run_id: String(run.id),
      thread_key: threadKey,
      packet_id: packetId || null,
      provider: 'cursor',
      object_type: 'cloud_agent_run',
      object_id: cloudRunId,
    });
    if (ok) anyOk = true;
  }
  if (acceptedExternalId) {
    const ok = await upsertExternalCorrelation({
      run_id: String(run.id),
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
      run_id: String(run.id),
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
  if (acceptedExternalId) anchorParts.push('accepted_external_id');
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

  const anchor = {
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
    await patchRunById(String(run.id), { cursor_callback_anchor: anchor });
  } catch (e) {
    console.error('[record_cursor_cloud_correlation]', e);
  }

  await appendCosRunEvent(threadKey, 'tool_invoked', {
    tool: 'cursor',
    action: cursorAction,
    object_type: 'cloud_agent_run',
    object_id: cloudRunId || acceptedExternalId || `${automationRequestId}|${emitFp}`,
    correlation_registered: true,
    execution_lane: 'cloud_agent',
    cursor_correlation_anchors: {
      has_cloud_agent_run: Boolean(cloudRunId),
      has_accepted_external_id: Boolean(acceptedExternalId),
      has_request_path_fp: Boolean(automationRequestId && emitFp),
    },
  });
  return true;
}
