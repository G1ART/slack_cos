/**
 * W3-B — COS `read_execution_context` truth read-model (고정 우선순위·출처 표기·테넄시 스코프 아티팩트).
 */

import {
  extractValidPersonaContractLinesFromSummaryTruthObject,
  extractValidWorkcellSummaryLinesFromSummaryTruthObject,
} from './executionContextShell.js';
import { filterArtifactsForReadModelTenancy } from './executionRunStore.js';
import { formatHarnessProofSnapshotLines } from './harnessWorkcellRuntime.js';

export const TRUTH_SOURCES = /** @type {const} */ ({
  ACTIVE_RUN_SHELL: 'active_run_shell',
  EXECUTION_SUMMARY_ACTIVE_RUN: 'execution_summary_active_run',
  RECENT_ARTIFACT_SCAN: 'recent_artifact_scan',
  NONE: 'none',
});

/** @typedef {'active_run_shell' | 'execution_summary_active_run' | 'recent_artifact_scan' | 'none'} ExecutionContextTruthSource */

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
 * @param {unknown} shell
 * @returns {string[] | null}
 */
function shellPersonaLines(shell) {
  if (!shell || typeof shell !== 'object') return null;
  return normalizePersonaContractSnapshotArray(
    /** @type {Record<string, unknown>} */ (shell).persona_contract_runtime_snapshot,
  );
}

/**
 * @param {unknown} shell
 * @returns {string[] | null}
 */
function shellWorkcellLines(shell) {
  if (!shell || typeof shell !== 'object') return null;
  const sh = /** @type {Record<string, unknown>} */ (shell);
  const direct = normalizeWorkcellSummaryArray(sh.workcell_summary_lines);
  if (direct) return direct;
  const wr = sh.workcell_runtime;
  if (wr && typeof wr === 'object' && !Array.isArray(wr) && Array.isArray(wr.summary_lines)) {
    return normalizeWorkcellSummaryArray(wr.summary_lines);
  }
  return null;
}

/**
 * @param {unknown} shell
 * @returns {string | null}
 */
function workcellStatusFromShell(shell) {
  if (!shell || typeof shell !== 'object') return null;
  const wr = /** @type {Record<string, unknown>} */ (shell).workcell_runtime;
  if (wr && typeof wr === 'object' && !Array.isArray(wr) && wr.status != null) {
    const st = String(wr.status).trim();
    return st || null;
  }
  return null;
}

/**
 * @param {unknown[]} artifacts
 * @param {number} maxArtifactScan
 * @returns {string[] | null}
 */
function scanArtifactsPersona(artifacts, maxArtifactScan) {
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
  return null;
}

/**
 * @param {unknown[]} artifacts
 * @param {number} maxArtifactScan
 * @returns {string[] | null}
 */
function scanArtifactsWorkcell(artifacts, maxArtifactScan) {
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
  return null;
}

/**
 * W6-B — resolve harness_proof_snapshot_lines (reviewer findings, rework cause, acceptance 등)
 * by looking at the same truth-source priority as the workcell summary.
 *
 * @param {{
 *   active_run_shell: unknown,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 * }} p
 * @returns {string[]}
 */
export function resolveHarnessProofSnapshotLines(p) {
  const { active_run_shell, execution_summary_active_run, artifacts } = p;
  const cap = typeof p.maxArtifactScan === 'number' && p.maxArtifactScan >= 1
    ? Math.min(48, p.maxArtifactScan)
    : 48;

  const shellRuntime = extractWorkcellRuntimeObject(active_run_shell);
  if (shellRuntime) return formatHarnessProofSnapshotLines(shellRuntime, 6);

  const summaryRuntime = extractWorkcellRuntimeObject(execution_summary_active_run);
  if (summaryRuntime) return formatHarnessProofSnapshotLines(summaryRuntime, 6);

  const list = Array.isArray(artifacts) ? artifacts : [];
  const n = list.length;
  const bound = Math.min(cap, n);
  for (let k = 0; k < bound; k += 1) {
    const a = list[n - 1 - k];
    if (!a || typeof a !== 'object') continue;
    const row = /** @type {Record<string, unknown>} */ (a);
    if (String(row.type || '') !== 'harness_dispatch') continue;
    const pl = row.payload && typeof row.payload === 'object' && !Array.isArray(row.payload)
      ? /** @type {Record<string, unknown>} */ (row.payload)
      : null;
    if (!pl) continue;
    const wr = pl.workcell_runtime;
    if (wr && typeof wr === 'object' && !Array.isArray(wr)) {
      return formatHarnessProofSnapshotLines(/** @type {Record<string, unknown>} */ (wr), 6);
    }
  }
  return [];
}

/** @param {unknown} shellOrSummary */
function extractWorkcellRuntimeObject(shellOrSummary) {
  if (!shellOrSummary || typeof shellOrSummary !== 'object') return null;
  const wr = /** @type {Record<string, unknown>} */ (shellOrSummary).workcell_runtime;
  if (wr && typeof wr === 'object' && !Array.isArray(wr)) {
    return /** @type {Record<string, unknown>} */ (wr);
  }
  return null;
}

/**
 * @param {unknown} active_run_shell
 * @param {unknown} activeRow
 */
export function buildExecutionContextTenancySlice(active_run_shell, activeRow) {
  const pick = (/** @type {string} */ k) => {
    const sh = active_run_shell && typeof active_run_shell === 'object' ? /** @type {Record<string, unknown>} */ (active_run_shell) : null;
    if (sh && sh[k] != null && String(sh[k]).trim()) return String(sh[k]).trim();
    const r = activeRow && typeof activeRow === 'object' ? /** @type {Record<string, unknown>} */ (activeRow) : null;
    if (r && r[k] != null && String(r[k]).trim()) return String(r[k]).trim();
    return null;
  };
  return {
    workspace_key: pick('workspace_key'),
    product_key: pick('product_key'),
    project_space_key: pick('project_space_key'),
    parcel_deployment_key: pick('parcel_deployment_key'),
  };
}

/**
 * @param {{
 *   active_run_shell: unknown,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 * }} p
 * @returns {{ lines: string[], source: string }}
 */
export function resolvePersonaContractSnapshotFromTruthSources(p) {
  const { active_run_shell, execution_summary_active_run, artifacts } = p;
  const maxArtifactScan =
    typeof p.maxArtifactScan === 'number' && p.maxArtifactScan >= 1 ? Math.min(48, p.maxArtifactScan) : 48;

  const s1 = shellPersonaLines(active_run_shell);
  if (s1) return { lines: s1, source: TRUTH_SOURCES.ACTIVE_RUN_SHELL };

  const s2 = extractValidPersonaContractLinesFromSummaryTruthObject(execution_summary_active_run);
  if (s2) return { lines: s2, source: TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN };

  const s3 = scanArtifactsPersona(artifacts, maxArtifactScan);
  if (s3) return { lines: s3, source: TRUTH_SOURCES.RECENT_ARTIFACT_SCAN };

  return { lines: [], source: TRUTH_SOURCES.NONE };
}

/**
 * @param {{
 *   active_run_shell: unknown,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 * }} p
 * @returns {{ lines: string[], source: string }}
 */
export function resolveWorkcellSummaryFromTruthSources(p) {
  const { active_run_shell, execution_summary_active_run, artifacts } = p;
  const maxArtifactScan =
    typeof p.maxArtifactScan === 'number' && p.maxArtifactScan >= 1 ? Math.min(48, p.maxArtifactScan) : 48;

  const s1 = shellWorkcellLines(active_run_shell);
  if (s1) return { lines: s1, source: TRUTH_SOURCES.ACTIVE_RUN_SHELL };

  const s2 = extractValidWorkcellSummaryLinesFromSummaryTruthObject(execution_summary_active_run);
  if (s2) return { lines: s2, source: TRUTH_SOURCES.EXECUTION_SUMMARY_ACTIVE_RUN };

  const s3 = scanArtifactsWorkcell(artifacts, maxArtifactScan);
  if (s3) return { lines: s3, source: TRUTH_SOURCES.RECENT_ARTIFACT_SCAN };

  return { lines: [], source: TRUTH_SOURCES.NONE };
}

/**
 * @param {{
 *   active_run_shell: unknown,
 *   execution_summary_active_run: unknown,
 *   artifacts: unknown[],
 *   maxArtifactScan: number,
 *   activeRow: unknown,
 * }} input
 */
export function buildExecutionContextReadModel(input) {
  const {
    active_run_shell,
    execution_summary_active_run,
    artifacts,
    maxArtifactScan,
    activeRow,
  } = input;
  const cap =
    typeof maxArtifactScan === 'number' && maxArtifactScan >= 1 ? Math.min(48, maxArtifactScan) : 48;

  const tenancy_slice = buildExecutionContextTenancySlice(active_run_shell, activeRow);
  const { artifacts: scopedArtifacts, artifact_scan_scoped_by_tenancy } = filterArtifactsForReadModelTenancy(
    Array.isArray(artifacts) ? artifacts : [],
    tenancy_slice,
  );

  const persona = resolvePersonaContractSnapshotFromTruthSources({
    active_run_shell,
    execution_summary_active_run,
    artifacts: scopedArtifacts,
    maxArtifactScan: cap,
  });
  const workcell = resolveWorkcellSummaryFromTruthSources({
    active_run_shell,
    execution_summary_active_run,
    artifacts: scopedArtifacts,
    maxArtifactScan: cap,
  });

  const workcell_status = workcellStatusFromShell(active_run_shell);
  const active_run_truth_source = active_run_shell ? TRUTH_SOURCES.ACTIVE_RUN_SHELL : TRUTH_SOURCES.NONE;

  const harness_proof_snapshot_lines = resolveHarnessProofSnapshotLines({
    active_run_shell,
    execution_summary_active_run,
    artifacts: scopedArtifacts,
    maxArtifactScan: cap,
  });

  return {
    persona_contract_snapshot_lines: persona.lines,
    persona_contract_snapshot_source: persona.source,
    workcell_summary_lines: workcell.lines,
    workcell_summary_source: workcell.source,
    ...(workcell_status ? { workcell_status } : {}),
    harness_proof_snapshot_lines,
    tenancy_slice,
    workspace_key: tenancy_slice.workspace_key,
    product_key: tenancy_slice.product_key,
    project_space_key: tenancy_slice.project_space_key,
    parcel_deployment_key: tenancy_slice.parcel_deployment_key,
    artifact_scan_scoped_by_tenancy,
    active_run_truth_source,
  };
}
