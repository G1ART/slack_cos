/**
 * W8-D — delivery readiness module.
 *
 * project_space_key 에 대해 다음을 조합해 "배포 준비" verdict 와 read_execution_context 용
 * 3개 compact-lines 슬라이스를 만든다:
 *   - delivery_readiness_compact_lines
 *   - unresolved_human_gates_compact_lines
 *   - last_propagation_failures_lines
 *
 * Verdict: 'ready' | 'missing_binding' | 'open_gate' | 'propagation_failed'
 * 우선순위: open_gate > propagation_failed > missing_binding > ready (가장 시급한 것 먼저).
 *
 * Founder-facing 본문이 아니다. read_execution_context 내부 truth 전용.
 * secret value / token / url 전체를 포함하지 않는다.
 */

import { buildBindingGraph } from './projectSpaceBindingGraph.js';
import { formatUnresolvedHumanGatesCompactLines, listOpenHumanGates } from './humanGateRuntime.js';
import { listRecentPropagationRunsForSpace } from './envSecretPropagationEngine.js';

const MAX_FAILURE_LINES = 6;
const LINE_CAP = 240;

function redactSecretLike(raw) {
  let s = raw == null ? '' : String(raw);
  // strip full URLs
  s = s.replace(/https?:\/\/\S+/g, '[url]');
  // strip "Bearer <token>"
  s = s.replace(/Bearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [redacted]');
  // strip common api-key-ish tokens (sk-..., ghp_..., JWT-ish three-part)
  s = s.replace(/\b(?:sk|pk|ghp|gho|ghu|glpat|xox[abpsor])[_-][A-Za-z0-9._-]{10,}/g, '[redacted]');
  s = s.replace(/\beyJ[A-Za-z0-9._-]{10,}/g, '[redacted-jwt]');
  // strip very-long hex/base64 chunks (likely secret)
  s = s.replace(/\b[A-Za-z0-9_-]{32,}\b/g, (m) => (m.length >= 32 ? '[redacted]' : m));
  return s;
}

function trim(v, max = LINE_CAP) {
  const s = redactSecretLike(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** @typedef {'ready'|'missing_binding'|'open_gate'|'propagation_failed'} DeliveryReadinessVerdict */

/**
 * @param {{
 *   project_space_key: string,
 *   binding_graph?: Awaited<ReturnType<typeof buildBindingGraph>>,
 *   open_human_gates?: Array<Record<string, unknown>>,
 *   recent_propagation_runs?: Array<{ run: Record<string, unknown>, steps: Array<Record<string, unknown>> }>,
 * }} input
 * @returns {{
 *   project_space_key: string,
 *   verdict: DeliveryReadinessVerdict,
 *   unresolved_count: number,
 *   delivery_readiness_compact_lines: string[],
 *   unresolved_human_gates_compact_lines: string[],
 *   last_propagation_failures_lines: string[],
 * }}
 */
export function buildDeliveryReadiness(input) {
  const key = input && input.project_space_key ? String(input.project_space_key).trim() : '';
  const graph = input && input.binding_graph && typeof input.binding_graph === 'object' ? input.binding_graph : null;
  const gates = Array.isArray(input && input.open_human_gates) ? input.open_human_gates : [];
  const runs = Array.isArray(input && input.recent_propagation_runs) ? input.recent_propagation_runs : [];

  const missingReqs = graph && Array.isArray(graph.unfulfilled_requirements) ? graph.unfulfilled_requirements : [];
  const satisfiedReqs = graph && Array.isArray(graph.satisfied_requirements) ? graph.satisfied_requirements : [];

  const failedRuns = runs.filter((r) => r && r.run && String(r.run.status) === 'failed');
  const hasPropagationFailure = failedRuns.length > 0;

  /** @type {DeliveryReadinessVerdict} */
  let verdict = 'ready';
  if (gates.length > 0) verdict = 'open_gate';
  else if (hasPropagationFailure) verdict = 'propagation_failed';
  else if (missingReqs.length > 0) verdict = 'missing_binding';

  const unresolved_count = missingReqs.length + gates.length + failedRuns.length;

  const drLines = [];
  drLines.push(
    trim(
      `verdict=${verdict} project=${key || '?'} missing_bindings=${missingReqs.length} satisfied=${satisfiedReqs.length} open_gates=${gates.length} failed_runs=${failedRuns.length}`,
    ),
  );
  for (const req of missingReqs.slice(0, 4)) {
    const r = req || {};
    const name = r.binding_name || '(unnamed)';
    drLines.push(trim(`missing: ${r.binding_kind || '?'} ${r.source_system || '?'}→${r.sink_system || '?'} name=${name}`));
  }
  if (missingReqs.length > 4) drLines.push(`…+${missingReqs.length - 4} more missing`);

  const gateLines = formatUnresolvedHumanGatesCompactLines(gates).map((l) => trim(l));

  const failLines = [];
  for (const r of failedRuns.slice(0, MAX_FAILURE_LINES)) {
    const run = r.run || {};
    const firstStepFail = (r.steps || []).find((s) => s && s.verification_result === 'failed');
    const cls = run.failure_resolution_class || (firstStepFail && firstStepFail.failure_resolution_class) || 'unclassified';
    const sink = firstStepFail ? firstStepFail.sink_system : '?';
    const bname = firstStepFail && firstStepFail.binding_name ? firstStepFail.binding_name : '(unnamed)';
    failLines.push(
      trim(`run:${String(run.id || '').slice(0, 8)} sink=${sink} name=${bname} class=${cls}`),
    );
  }
  if (failedRuns.length > MAX_FAILURE_LINES) {
    failLines.push(`…+${failedRuns.length - MAX_FAILURE_LINES} more failed runs`);
  }

  return {
    project_space_key: key || '',
    verdict,
    unresolved_count,
    delivery_readiness_compact_lines: drLines,
    unresolved_human_gates_compact_lines: gateLines,
    last_propagation_failures_lines: failLines,
  };
}

/**
 * store-aware loader — project_space_key 로 binding_graph / open gates / recent propagation runs 를
 * 직접 조회해 delivery readiness 를 만든다. 실패 시 null 반환 (fail-open on read-only path).
 *
 * @param {string | null | undefined} project_space_key
 * @param {{ limit?: number }} [opts]
 */
export async function loadDeliveryReadiness(project_space_key, opts = {}) {
  const key = project_space_key ? String(project_space_key).trim() : '';
  if (!key) return null;
  try {
    const [graph, gates, runs] = await Promise.all([
      buildBindingGraph(key).catch(() => null),
      listOpenHumanGates(key).catch(() => []),
      listRecentPropagationRunsForSpace(key, { limit: Math.max(1, Math.min(10, opts.limit || 5)) }).catch(() => []),
    ]);
    const graphHasData =
      graph &&
      (graph.project_space ||
        (Array.isArray(graph.bindings) && graph.bindings.length > 0) ||
        (Array.isArray(graph.unfulfilled_requirements) && graph.unfulfilled_requirements.length > 0) ||
        (Array.isArray(graph.satisfied_requirements) && graph.satisfied_requirements.length > 0));
    if (!graphHasData && (!gates || gates.length === 0) && (!runs || runs.length === 0)) return null;
    return buildDeliveryReadiness({
      project_space_key: key,
      binding_graph: graph,
      open_human_gates: gates || [],
      recent_propagation_runs: runs || [],
    });
  } catch (err) {
    console.error('[delivery_readiness]', err && err.message ? err.message : String(err));
    return null;
  }
}
