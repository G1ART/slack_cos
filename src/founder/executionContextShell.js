/**
 * W3-A — `read_execution_context`용 활성 런 truth shell (기계 스냅샷만, 산문 없음).
 */

import { formatHarnessWorkcellSummaryLines } from './harnessWorkcellRuntime.js';

/**
 * @param {Record<string, unknown> | null | undefined} run `getActiveRunForThread` 결과 또는 동형
 * @returns {Record<string, unknown> | null}
 */
export function buildExecutionContextShellFromRun(run) {
  if (!run || typeof run !== 'object') return null;
  const id = run.id != null ? String(run.id).trim() : '';
  if (!id) return null;
  const run_id = String(run.run_id || run.external_run_id || '').trim();
  const thread_key = run.thread_key != null ? String(run.thread_key).trim() || null : null;
  const status = run.status != null ? String(run.status).trim() || null : null;
  const req = Array.isArray(run.required_packet_ids) ? run.required_packet_ids.map(String).filter(Boolean) : [];
  const dp =
    run.dispatch_payload && typeof run.dispatch_payload === 'object' && !Array.isArray(run.dispatch_payload)
      ? /** @type {Record<string, unknown>} */ (run.dispatch_payload)
      : null;
  /** @type {string[] | undefined} */
  let persona_contract_runtime_snapshot;
  if (dp && Array.isArray(dp.persona_contract_runtime_snapshot)) {
    const sn = dp.persona_contract_runtime_snapshot
      .map((x) => String(x).trim())
      .filter(Boolean)
      .slice(0, 12);
    if (sn.length) persona_contract_runtime_snapshot = sn;
  }
  /** @type {string[] | undefined} */
  let workcell_summary_lines;
  if (dp && Array.isArray(dp.workcell_summary_lines)) {
    const wl = dp.workcell_summary_lines.map((x) => String(x).trim()).filter(Boolean).slice(0, 12);
    if (wl.length) workcell_summary_lines = wl;
  }
  /** @type {Record<string, unknown> | undefined} */
  let workcell_runtime;
  if (dp && dp.workcell_runtime && typeof dp.workcell_runtime === 'object' && !Array.isArray(dp.workcell_runtime)) {
    workcell_runtime = /** @type {Record<string, unknown>} */ (dp.workcell_runtime);
  }
  if ((!workcell_summary_lines || workcell_summary_lines.length === 0) && workcell_runtime) {
    const wl = formatHarnessWorkcellSummaryLines(workcell_runtime, 8)
      .map((x) => String(x).trim())
      .filter(Boolean);
    if (wl.length) workcell_summary_lines = wl;
  }

  /** @type {Record<string, unknown>} */
  const shell = {
    id,
    run_id,
    thread_key,
    dispatch_id: run.dispatch_id != null ? String(run.dispatch_id).trim() || null : null,
    status,
    stage: run.stage != null ? String(run.stage).trim() || null : null,
    current_packet_id: run.current_packet_id != null ? String(run.current_packet_id).trim() || null : null,
    required_packet_ids: req.slice(0, 32),
    workspace_key: run.workspace_key != null ? String(run.workspace_key) : null,
    product_key: run.product_key != null ? String(run.product_key) : null,
    project_space_key: run.project_space_key != null ? String(run.project_space_key) : null,
    parcel_deployment_key: run.parcel_deployment_key != null ? String(run.parcel_deployment_key) : null,
    updated_at: run.updated_at != null ? String(run.updated_at) : null,
    ...(persona_contract_runtime_snapshot ? { persona_contract_runtime_snapshot } : {}),
    ...(workcell_summary_lines ? { workcell_summary_lines } : {}),
    ...(workcell_runtime ? { workcell_runtime } : {}),
  };
  return shell;
}

/**
 * @param {Record<string, unknown> | null | undefined} shell
 * @returns {{ ok: true } | { ok: false, reason: string, missing_keys?: string[] }}
 */
export function validateExecutionContextShell(shell) {
  if (!shell || typeof shell !== 'object') {
    return { ok: false, reason: 'execution_context_shell_invalid' };
  }
  const missing = [];
  for (const k of ['id', 'run_id', 'thread_key', 'status']) {
    const v = shell[k];
    if (v == null || !String(v).trim()) missing.push(k);
  }
  if (missing.length) {
    return { ok: false, reason: 'execution_context_shell_incomplete', missing_keys: missing };
  }
  return { ok: true };
}
