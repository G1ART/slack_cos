/**
 * Founder COS — record_execution_note / read_execution_context handlers (ledger + run store).
 */

import {
  appendExecutionArtifact,
  readExecutionSummary,
  readExecutionSummaryForRun,
  readRecentExecutionArtifacts,
  computeExecutionOutcomeCounts,
  readReviewQueue,
  summarizeParcelLedgerClosureMirrorPresence,
} from './executionLedger.js';
import {
  getActiveRunForThread,
  activeRunShellForCosExecutionContext,
} from './executionRunStore.js';
import { formatAdapterReadinessCompactLines } from './toolPlane/toolLaneReadiness.js';
import {
  cosRunTenancyMergeHintsFromRunRow,
  parcelDeploymentKeyFromEnv,
  tenancyKeysPresenceFromEnv,
} from './parcelDeploymentContext.js';
import { mergeLedgerExecutionRowPayload, distinctSpineKeysFromLedgerArtifacts } from './canonicalExecutionEnvelope.js';
import { formatPersonaContractRuntimeSnapshotLines } from './personaContractManifest.js';

/**
 * @param {Record<string, unknown>} args
 * @param {string} threadKey
 */
function parseExecutionNoteDetail(raw) {
  if (raw == null) return {};
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return {};
  const t = raw.trim();
  if (!t) return {};
  try {
    const j = JSON.parse(t);
    return j && typeof j === 'object' && !Array.isArray(j) ? j : {};
  } catch {
    return {};
  }
}

export async function handleRecordExecutionNote(args, threadKey) {
  if (!threadKey) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const note = String(args?.note || '').trim();
  if (!note) return { ok: false, blocked: true, reason: 'invalid_payload' };
  const detail = parseExecutionNoteDetail(args?.detail);
  const active = await getActiveRunForThread(threadKey);
  const rid = active?.id != null ? String(active.id).trim() : '';
  const hints = active ? cosRunTenancyMergeHintsFromRunRow(active) : {};
  const merged = mergeLedgerExecutionRowPayload(
    detail,
    {
      threadKey,
      ...(rid ? { runId: rid } : {}),
      ...(Object.keys(hints).length ? { runTenancy: hints } : {}),
    },
    process.env,
  );
  await appendExecutionArtifact(threadKey, {
    type: 'execution_note',
    summary: note.slice(0, 500),
    payload: merged,
    status: null,
  });
  return { ok: true, recorded: true, summary: note.slice(0, 500) };
}

/**
 * @param {Record<string, unknown>} args
 * @param {string} threadKey
 */
export async function handleReadExecutionContext(args, threadKey) {
  const limRaw = args?.limit;
  const limit = typeof limRaw === 'number' && limRaw >= 1 ? Math.min(20, limRaw) : 5;
  const activeRow = threadKey ? await getActiveRunForThread(threadKey) : null;
  const active_run_shell = activeRunShellForCosExecutionContext(activeRow);
  const artifacts = threadKey ? await readRecentExecutionArtifacts(threadKey, limit) : [];
  const summary_lines = threadKey ? await readExecutionSummary(threadKey, limit) : [];
  const adapter_readiness_lines = await formatAdapterReadinessCompactLines(process.env, 6, threadKey);
  const counts = threadKey
    ? await computeExecutionOutcomeCounts(threadKey)
    : {
        review_required_count: 0,
        degraded_count: 0,
        blocked_count: 0,
        failed_count: 0,
      };
  const review_queue = threadKey ? await readReviewQueue(threadKey, limit) : [];
  const recent_artifact_spine_distinct = distinctSpineKeysFromLedgerArtifacts(artifacts, 8);
  let execution_summary_active_run = null;
  if (activeRow && activeRow.id != null && String(activeRow.id).trim()) {
    execution_summary_active_run = await readExecutionSummaryForRun(activeRow, limit, {
      suppressStaleLiveOnlyCreateSpecLeak: true,
      suppressLiveOnlyEmitPatchFounderTechnicalLeak: true,
    });
  }
  const parcel_ledger_closure_mirror = threadKey
    ? await summarizeParcelLedgerClosureMirrorPresence(threadKey, Math.max(80, limit * 24))
    : { count: 0, latest_ts: null };
  return {
    ok: true,
    persona_contract_snapshot_lines: formatPersonaContractRuntimeSnapshotLines([], 12),
    summary_lines,
    execution_summary_active_run,
    parcel_ledger_closure_mirror,
    artifacts,
    adapter_readiness_lines,
    review_queue,
    recent_artifact_spine_distinct,
    active_run_shell,
    tenancy_keys_presence: tenancyKeysPresenceFromEnv(process.env),
    parcel_deployment_scoped_supervisor_lists: Boolean(parcelDeploymentKeyFromEnv(process.env)),
    review_required_count: counts.review_required_count,
    degraded_count: counts.degraded_count,
    blocked_count: counts.blocked_count,
    failed_count: counts.failed_count,
  };
}
