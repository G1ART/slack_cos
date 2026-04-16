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
import { buildExecutionContextReadModel } from './executionContextReadModel.js';
import { loadActiveProjectSpaceSlice } from './activeProjectSpaceSlice.js';
import { loadDeliveryReadiness } from './deliveryReadiness.js';
import { buildProactiveSignals } from './proactiveSignals.js';
import {
  buildHarnessProofScorecard,
  toHarnessProofCompactLines,
} from './harnessProofScorecard.js';
import { buildToolQualificationSummaryLines } from './toolPlane/toolLaneQualification.js';
import { formatAdapterReadinessCompactLines } from './toolPlane/toolLaneReadiness.js';
import {
  cosRunTenancyMergeHintsFromRunRow,
  parcelDeploymentKeyFromEnv,
  tenancyKeysPresenceFromEnv,
} from './parcelDeploymentContext.js';
import { mergeLedgerExecutionRowPayload, distinctSpineKeysFromLedgerArtifacts } from './canonicalExecutionEnvelope.js';

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
  const artifactFetchLimit = Math.min(48, Math.max(20, limit));
  const activeRow = threadKey ? await getActiveRunForThread(threadKey) : null;
  const active_run_shell = activeRunShellForCosExecutionContext(activeRow);
  const artifacts = threadKey ? await readRecentExecutionArtifacts(threadKey, artifactFetchLimit) : [];
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
  const rm = buildExecutionContextReadModel({
    active_run_shell,
    execution_summary_active_run,
    artifacts,
    maxArtifactScan: artifactFetchLimit,
    activeRow,
  });
  const active_project_space = await loadActiveProjectSpaceSlice(rm.project_space_key);
  const delivery_readiness = await loadDeliveryReadiness(rm.project_space_key);
  const { compact_lines: proactive_signals_compact_lines } = buildProactiveSignals({
    active_run_shell,
    workcell_runtime: active_run_shell && typeof active_run_shell === 'object'
      ? /** @type {Record<string, unknown>} */ (active_run_shell).workcell_runtime
      : null,
    active_project_space_slice: active_project_space,
    surface_model: null,
    recent_run_shells: [],
  });
  const harness_proof_scorecard = buildHarnessProofSessionScorecard(active_run_shell);
  const harness_proof_scorecard_lines = toHarnessProofCompactLines(harness_proof_scorecard);
  const tool_qualification_summary_lines = await buildToolQualificationSummaryLines({
    env: process.env,
    threadKey,
    latest_precheck_by_tool: {},
    surface_model: null,
    max: 8,
  });
  return {
    ok: true,
    persona_contract_snapshot_lines: rm.persona_contract_snapshot_lines,
    persona_contract_snapshot_source: rm.persona_contract_snapshot_source,
    workcell_summary_lines: rm.workcell_summary_lines,
    workcell_summary_source: rm.workcell_summary_source,
    workspace_key: rm.workspace_key,
    product_key: rm.product_key,
    project_space_key: rm.project_space_key,
    parcel_deployment_key: rm.parcel_deployment_key,
    tenancy_slice: rm.tenancy_slice,
    artifact_scan_scoped_by_tenancy: rm.artifact_scan_scoped_by_tenancy,
    active_run_truth_source: rm.active_run_truth_source,
    ...(rm.workcell_status ? { workcell_status: rm.workcell_status } : {}),
    harness_proof_snapshot_lines: rm.harness_proof_snapshot_lines || [],
    harness_proof_scorecard,
    harness_proof_scorecard_lines,
    proactive_signals_compact_lines,
    tool_qualification_summary_lines,
    ...(active_project_space ? { active_project_space } : {}),
    ...(delivery_readiness
      ? {
          delivery_readiness,
          delivery_readiness_compact_lines: delivery_readiness.delivery_readiness_compact_lines || [],
          unresolved_human_gates_compact_lines: delivery_readiness.unresolved_human_gates_compact_lines || [],
          last_propagation_failures_lines: delivery_readiness.last_propagation_failures_lines || [],
        }
      : {}),
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

/**
 * W10-B — active_run_shell 한 건에서도 의미 있는 scorecard 한 스냅샷을 낸다.
 * Supabase 에서 recent 세션을 모아 오는 건 audit-harness-proof CLI 가 담당하고,
 * read_execution_context 에서는 현재 활성 런 셸의 workcell_runtime 한 건을 session 1 로 반영한다.
 *
 * @param {unknown} activeRunShell
 */
function buildHarnessProofSessionScorecard(activeRunShell) {
  const wc = activeRunShell && typeof activeRunShell === 'object'
    ? /** @type {Record<string, unknown>} */ (activeRunShell).workcell_runtime
    : null;
  if (!wc || typeof wc !== 'object') return buildHarnessProofScorecard([]);
  return buildHarnessProofScorecard([
    /** @type {Record<string, unknown>} */ (wc),
  ]);
}
