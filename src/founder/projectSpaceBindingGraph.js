/**
 * W8-A — Project-space binding graph runtime wrapper.
 *
 * 정본: docs/cursor-handoffs/W8_W10_LIVE_AUTOMATION_AND_PROOF_ARCHITECTURE_2026-04-16.md §W8 Required entities.
 *
 * projectSpaceBindingStore 는 row-level CRUD. 이 모듈은 한 project_space 에 대한
 * "graph" (bindings + open human gates + requirements + diff) 를 한 번에 뽑아
 * 런타임이 판단 입력으로 쓸 수 있는 정규화 shape 을 만든다.
 *
 * store API 는 **변경하지 않는다** (추가만).
 */

import {
  getProjectSpace,
  listBindingsForSpace,
  listOpenHumanGates,
} from './projectSpaceBindingStore.js';
import { diffRequirementsVsBindings } from './bindingRequirements.js';

function asString(v) {
  return v == null ? '' : String(v);
}

/**
 * @typedef {Object} BindingGraph
 * @property {string} project_space_key
 * @property {Record<string,unknown>|null} project_space  // project_spaces row (테넨시 라벨 포함)
 * @property {Array<Record<string,unknown>>} bindings
 * @property {Array<Record<string,unknown>>} open_human_gates
 * @property {Array<import('./bindingRequirements.js').BindingRequirement>} requirements
 * @property {Array<import('./bindingRequirements.js').BindingRequirement>} unfulfilled_requirements  // missing + stale
 * @property {Array<import('./bindingRequirements.js').BindingRequirement>} satisfied_requirements
 * @property {Array<import('./bindingRequirements.js').BindingRequirement>} stale_requirements
 * @property {string} computed_at
 */

/**
 * @param {string} project_space_key
 * @param {{ requirements?: Array<import('./bindingRequirements.js').BindingRequirement> }} [opts]
 * @returns {Promise<BindingGraph>}
 */
export async function buildBindingGraph(project_space_key, opts = {}) {
  const key = asString(project_space_key).trim();
  if (!key) {
    throw new Error('buildBindingGraph: project_space_key required');
  }
  const requirements = Array.isArray(opts.requirements) ? opts.requirements : [];
  const [project_space, bindings, open_human_gates] = await Promise.all([
    getProjectSpace(key),
    listBindingsForSpace(key),
    listOpenHumanGates(key),
  ]);
  const { missing, satisfied, stale } = diffRequirementsVsBindings(requirements, bindings);
  const unfulfilled_requirements = [...missing, ...stale];
  return {
    project_space_key: key,
    project_space: project_space || null,
    bindings: Array.isArray(bindings) ? bindings : [],
    open_human_gates: Array.isArray(open_human_gates) ? open_human_gates : [],
    requirements,
    satisfied_requirements: satisfied,
    stale_requirements: stale,
    unfulfilled_requirements,
    computed_at: new Date().toISOString(),
  };
}

/**
 * graph → read_execution_context 에 주입 가능한 compact line 요약 (이름만 노출).
 * founder 본문 토큰 금지 — 이 함수는 bindingKind 원시 토큰을 그대로 쓰지 않고 한국어 라벨로 변환하지 않는다.
 * (compact lines 용도만; surface trailer 는 담당 모듈이 처리)
 *
 * @param {BindingGraph} graph
 * @returns {string[]}
 */
export function formatBindingGraphCompactLines(graph) {
  if (!graph || typeof graph !== 'object') return [];
  const out = [];
  const psKey = asString(graph.project_space_key);
  if (psKey) out.push(`project_space:${psKey}`);
  const bindings = Array.isArray(graph.bindings) ? graph.bindings : [];
  out.push(`bindings_count:${bindings.length}`);
  const open = Array.isArray(graph.open_human_gates) ? graph.open_human_gates : [];
  if (open.length > 0) out.push(`open_human_gates:${open.length}`);
  const missing = Array.isArray(graph.unfulfilled_requirements) ? graph.unfulfilled_requirements.length : 0;
  if (missing > 0) out.push(`unfulfilled_requirements:${missing}`);
  return out.slice(0, 8);
}
