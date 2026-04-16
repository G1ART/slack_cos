/**
 * W5-B — active_project_space slice for read_execution_context.
 *
 * tenancy_slice.project_space_key 를 anchor 로 삼아 현재 project space 의 bindings 요약 +
 * open_human_gates 목록을 compact lines 로 제공한다. 이 슬라이스는 founder-facing 본문에
 * 직접 주입되지 않는다 — founder surface 는 W4 경로로 별도 가공된다. 내부 truth 용.
 */

import {
  listBindingsForSpace,
  listOpenHumanGates,
  getProjectSpace,
} from './projectSpaceBindingStore.js';

const MAX_BINDING_LINES = 12;
const MAX_GATE_LINES = 8;
const LINE_CAP = 240;

function trim(s, max = LINE_CAP) {
  const str = s == null ? '' : String(s);
  return str.length > max ? `${str.slice(0, max - 1)}…` : str;
}

/**
 * @param {Array<Record<string, unknown>>} bindings
 * @returns {string[]}
 */
export function formatBindingsCompactLines(bindings) {
  if (!Array.isArray(bindings) || bindings.length === 0) return [];
  const lines = [];
  for (const b of bindings.slice(0, MAX_BINDING_LINES)) {
    if (!b || typeof b !== 'object') continue;
    const kind = String(b.binding_kind || '').trim() || '?';
    const ref = String(b.binding_ref || '').trim() || '?';
    const evidence = String(b.evidence_run_id || '').trim();
    lines.push(trim(evidence ? `${kind}: ${ref} (run:${evidence})` : `${kind}: ${ref}`));
  }
  if (bindings.length > MAX_BINDING_LINES) {
    lines.push(`…+${bindings.length - MAX_BINDING_LINES} more bindings`);
  }
  return lines;
}

/**
 * @param {Array<Record<string, unknown>>} gates
 * @returns {string[]}
 */
export function formatOpenHumanGatesCompactLines(gates) {
  if (!Array.isArray(gates) || gates.length === 0) return [];
  const lines = [];
  for (const g of gates.slice(0, MAX_GATE_LINES)) {
    if (!g || typeof g !== 'object') continue;
    const kind = String(g.gate_kind || '').trim() || '?';
    const reason = String(g.gate_reason || '').trim();
    const action = String(g.gate_action || '').trim();
    const parts = [kind];
    if (reason) parts.push(`reason=${reason}`);
    if (action) parts.push(`action=${action}`);
    lines.push(trim(parts.join(' | ')));
  }
  if (gates.length > MAX_GATE_LINES) {
    lines.push(`…+${gates.length - MAX_GATE_LINES} more gates`);
  }
  return lines;
}

/**
 * Pure builder — 주입된 bindings/gates 로부터 슬라이스를 빌드. (store 미사용)
 *
 * @param {{
 *   project_space_key: string | null,
 *   bindings?: Array<Record<string, unknown>>,
 *   open_human_gates?: Array<Record<string, unknown>>,
 *   display_name?: string | null,
 * }} input
 */
export function buildActiveProjectSpaceSlice(input) {
  const psKey = input.project_space_key ? String(input.project_space_key).trim() : '';
  if (!psKey) {
    return {
      project_space_key: null,
      display_name: null,
      binding_count: 0,
      open_human_gate_count: 0,
      bindings_compact_lines: [],
      open_human_gates_compact_lines: [],
    };
  }
  const bindings = Array.isArray(input.bindings) ? input.bindings : [];
  const gates = Array.isArray(input.open_human_gates) ? input.open_human_gates : [];
  return {
    project_space_key: psKey,
    display_name: input.display_name ? String(input.display_name).trim() : null,
    binding_count: bindings.length,
    open_human_gate_count: gates.length,
    bindings_compact_lines: formatBindingsCompactLines(bindings),
    open_human_gates_compact_lines: formatOpenHumanGatesCompactLines(gates),
  };
}

/**
 * Store-aware loader — project_space_key 를 갖고 store 에서 bindings + open gates 를 조회해
 * slice 를 만든다. 없으면 null 을 반환(조회 실패도 null — fail-open on read-only path).
 *
 * @param {string | null | undefined} project_space_key
 * @returns {Promise<ReturnType<typeof buildActiveProjectSpaceSlice> | null>}
 */
export async function loadActiveProjectSpaceSlice(project_space_key) {
  const key = project_space_key ? String(project_space_key).trim() : '';
  if (!key) return null;
  try {
    const [space, bindings, openGates] = await Promise.all([
      getProjectSpace(key),
      listBindingsForSpace(key),
      listOpenHumanGates(key),
    ]);
    if (!space && (!bindings || bindings.length === 0) && (!openGates || openGates.length === 0)) {
      return null;
    }
    return buildActiveProjectSpaceSlice({
      project_space_key: key,
      bindings: bindings || [],
      open_human_gates: openGates || [],
      display_name: space && space.display_name ? String(space.display_name) : null,
    });
  } catch (err) {
    console.error('[active_project_space_slice]', err && err.message ? err.message : String(err));
    return null;
  }
}
