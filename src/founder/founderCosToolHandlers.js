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

/**
 * @param {unknown} x
 * @returns {string[] | null}
 */
function normalizePersonaContractSnapshotArray(x) {
  if (!Array.isArray(x)) return null;
  const lines = x.map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
  return lines.length ? lines : null;
}

/**
 * 활성 런·요약·최근 ledger 아티팩트에서 페르소나 계약 스냅샷 줄을 역추적한다 (W2-A closeout).
 * @param {{
 *   active_run_shell: Record<string, unknown> | null,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 * }} ctx
 * @returns {string[]}
 */
function resolvePersonaContractSnapshotLinesFromExecutionContext(ctx) {
  const { active_run_shell, execution_summary_active_run, artifacts } = ctx;
  const maxArtifactScan =
    typeof ctx.maxArtifactScan === 'number' && ctx.maxArtifactScan >= 1 ? Math.min(48, ctx.maxArtifactScan) : 48;

  const s1 =
    active_run_shell && typeof active_run_shell === 'object'
      ? normalizePersonaContractSnapshotArray(
          /** @type {Record<string, unknown>} */ (active_run_shell).persona_contract_runtime_snapshot,
        )
      : null;
  if (s1) return s1;

  const es = execution_summary_active_run;
  if (es && typeof es === 'object' && !Array.isArray(es)) {
    const s2 = normalizePersonaContractSnapshotArray(
      /** @type {Record<string, unknown>} */ (es).persona_contract_runtime_snapshot,
    );
    if (s2) return s2;
  }

  const list = Array.isArray(artifacts) ? artifacts : [];
  const n = list.length;
  const cap = Math.min(maxArtifactScan, n);
  for (let k = 0; k < cap; k += 1) {
    const a = list[n - 1 - k];
    if (!a || typeof a !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (a);
    const t = String(row.type || '');
    if (t !== 'harness_dispatch' && t !== 'harness_packet') continue;
    const rawPayload = row.payload;
    const pl =
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? /** @type {Record<string, unknown>} */ (rawPayload)
        : null;
    if (!pl) continue;
    const s3 = normalizePersonaContractSnapshotArray(pl.persona_contract_runtime_snapshot);
    if (s3) return s3;
  }
  return [];
}

/**
 * @param {unknown} x
 * @returns {string[] | null}
 */
function normalizeWorkcellSummaryArray(x) {
  if (!Array.isArray(x)) return null;
  const lines = x.map((s) => String(s).trim()).filter(Boolean).slice(0, 12);
  return lines.length ? lines : null;
}

/**
 * @param {Record<string, unknown> | null} pl
 * @returns {string[] | null}
 */
function extractWorkcellSummaryFromPayload(pl) {
  if (!pl || typeof pl !== 'object') return null;
  const direct = normalizeWorkcellSummaryArray(pl.workcell_summary_lines);
  if (direct) return direct;
  const wr = pl.workcell_runtime;
  if (wr && typeof wr === 'object' && !Array.isArray(wr) && Array.isArray(wr.summary_lines)) {
    return normalizeWorkcellSummaryArray(wr.summary_lines);
  }
  return null;
}

/**
 * @param {{
 *   active_run_shell: Record<string, unknown> | null,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 * }} ctx
 * @returns {string[]}
 */
function resolveWorkcellSummaryLinesFromExecutionContext(ctx) {
  const { active_run_shell, execution_summary_active_run, artifacts } = ctx;
  const maxArtifactScan =
    typeof ctx.maxArtifactScan === 'number' && ctx.maxArtifactScan >= 1 ? Math.min(48, ctx.maxArtifactScan) : 48;

  const s1 =
    active_run_shell && typeof active_run_shell === 'object'
      ? normalizeWorkcellSummaryArray(
          /** @type {Record<string, unknown>} */ (active_run_shell).workcell_summary_lines,
        )
      : null;
  if (s1) return s1;

  const es = execution_summary_active_run;
  if (es && typeof es === 'object' && !Array.isArray(es)) {
    const s2 = normalizeWorkcellSummaryArray(
      /** @type {Record<string, unknown>} */ (es).workcell_summary_lines,
    );
    if (s2) return s2;
  }

  const list = Array.isArray(artifacts) ? artifacts : [];
  const n = list.length;
  const cap = Math.min(maxArtifactScan, n);
  for (let k = 0; k < cap; k += 1) {
    const a = list[n - 1 - k];
    if (!a || typeof a !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (a);
    const t = String(row.type || '');
    const rawPayload = row.payload;
    const pl =
      rawPayload && typeof rawPayload === 'object' && !Array.isArray(rawPayload)
        ? /** @type {Record<string, unknown>} */ (rawPayload)
        : null;
    if (!pl) continue;
    if (t === 'harness_dispatch') {
      const s3 = extractWorkcellSummaryFromPayload(pl);
      if (s3) return s3;
    }
    if (t === 'harness_packet') {
      const pid = String(pl.packet_id || '').trim();
      const owner = String(pl.owner_persona || '').trim();
      if (pid && owner) return [`packet ${pid} owner=${owner}`.slice(0, 400)];
    }
  }
  return [];
}

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
  const persona_contract_snapshot_lines = resolvePersonaContractSnapshotLinesFromExecutionContext({
    active_run_shell,
    execution_summary_active_run,
    artifacts,
    maxArtifactScan: artifactFetchLimit,
  });
  const workcell_summary_lines = resolveWorkcellSummaryLinesFromExecutionContext({
    active_run_shell,
    execution_summary_active_run,
    artifacts,
    maxArtifactScan: artifactFetchLimit,
  });
  return {
    ok: true,
    persona_contract_snapshot_lines,
    workcell_summary_lines,
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
