/**
 * Runtime SSOT: external tool → lane adapter, readiness, and pre-invocation checks.
 * Dispatch (`dispatchExternalToolCall`) resolves execution through this registry only.
 */

import { ALLOWED_EXTERNAL_TOOLS } from './cosFounderToolDefinitions.js';
import { TOOL_ALLOWED_ACTIONS } from './toolLaneActions.js';
import { buildFailureClassification, classifyLegacyBlockedSignal } from '../failureTaxonomy.js';
import {
  cursorToolAdapter,
  getCursorAdapterReadiness,
  cursorInvocationPrecheck,
} from './lanes/cursorLane.js';
import {
  githubToolAdapter,
  getGithubAdapterReadiness,
  githubInvocationPrecheck,
} from './lanes/githubLane.js';
import {
  supabaseToolAdapter,
  getSupabaseAdapterReadiness,
  supabaseInvocationPrecheck,
  SUPABASE_APPLY_SQL_RPC,
} from './lanes/supabaseLane.js';
import {
  vercelToolAdapter,
  getVercelAdapterReadiness,
  vercelInvocationPrecheck,
} from './lanes/vercelLane.js';
import {
  railwayToolAdapter,
  getRailwayAdapterReadiness,
  railwayInvocationPrecheck,
} from './lanes/railwayLane.js';

/** @typedef {{ laneKey: string, adapter: object, getAdapterReadiness: (env?: NodeJS.ProcessEnv, options?: { threadKey?: string }) => Promise<object>, invocationPrecheck: (action: string, payload: Record<string, unknown>, env?: NodeJS.ProcessEnv) => { blocked: boolean, blocked_reason: string | null, next_required_input: string | null } }} ExternalLaneRuntime */

/** @type {Record<string, ExternalLaneRuntime>} */
const LANE_RUNTIME = {
  cursor: {
    laneKey: 'cursor_cloud',
    adapter: cursorToolAdapter,
    getAdapterReadiness: (env, opts) => getCursorAdapterReadiness(env, opts),
    invocationPrecheck: (_action, _payload, _env) => cursorInvocationPrecheck(),
  },
  github: {
    laneKey: 'github_rest',
    adapter: githubToolAdapter,
    getAdapterReadiness: (env, opts) => getGithubAdapterReadiness(env, opts),
    invocationPrecheck: (action, payload, env) => githubInvocationPrecheck(action, payload, env),
  },
  supabase: {
    laneKey: 'supabase_sql',
    adapter: supabaseToolAdapter,
    getAdapterReadiness: (env, opts) => getSupabaseAdapterReadiness(env, opts),
    invocationPrecheck: (action, payload, env) => supabaseInvocationPrecheck(action, payload, env),
  },
  vercel: {
    laneKey: 'vercel_deploy',
    adapter: vercelToolAdapter,
    getAdapterReadiness: (env, opts) => getVercelAdapterReadiness(env, opts),
    invocationPrecheck: (_action, _payload, _env) => vercelInvocationPrecheck(),
  },
  railway: {
    laneKey: 'railway_ops',
    adapter: railwayToolAdapter,
    getAdapterReadiness: (env, opts) => getRailwayAdapterReadiness(env, opts),
    invocationPrecheck: (action, payload, env) => railwayInvocationPrecheck(action, payload, env),
  },
};

export { SUPABASE_APPLY_SQL_RPC };

/**
 * @param {string} tool
 * @returns {ExternalLaneRuntime | null}
 */
export function getExternalLaneRuntime(tool) {
  const k = String(tool || '').trim();
  return LANE_RUNTIME[k] || null;
}

/**
 * @param {string} tool
 * @returns {object | null}
 */
export function getLaneAdapter(tool) {
  return getExternalLaneRuntime(tool)?.adapter ?? null;
}

/** @returns {{ tool: string, laneKey: string, supportedActions: string[] }[]} */
export function listExternalToolLaneDescriptors() {
  return Object.keys(LANE_RUNTIME).map((tool) => ({
    tool,
    laneKey: LANE_RUNTIME[tool].laneKey,
    supportedActions: Array.from(TOOL_ALLOWED_ACTIONS[tool] || []),
  }));
}

/** @returns {{ tool: string, plane: string, actions_hint: string }[]} */
export function listExternalToolLanes() {
  return listExternalToolLaneDescriptors().map(({ tool, laneKey, supportedActions }) => ({
    tool,
    plane: laneKey,
    actions_hint: supportedActions.join(', '),
  }));
}

/**
 * @param {string} tool
 * @returns {({ plane: string, actions_hint: string, laneKey: string })|null}
 */
export function getExternalToolLane(tool) {
  const rt = getExternalLaneRuntime(tool);
  if (!rt) return null;
  const sa = Array.from(TOOL_ALLOWED_ACTIONS[tool] || []);
  return { plane: rt.laneKey, laneKey: rt.laneKey, actions_hint: sa.join(', ') };
}

/** @returns {string[]} — tools missing from lane registry (should be empty) */
export function externalToolLaneRegistryGaps() {
  const gaps = [];
  for (const t of ALLOWED_EXTERNAL_TOOLS) {
    if (!LANE_RUNTIME[t]) gaps.push(t);
  }
  return gaps;
}

/**
 * W5-A: per-tool static hints that map known legacy `blocked_reason` fragments to a fixed
 * `resolution_class` so the classifier does not have to reinvent the mapping for well-known
 * precheck outputs. Order matters — first match wins. Keep this table conservative; unknown
 * reasons fall through to `classifyLegacyBlockedSignal` heuristics and may stay null.
 *
 * @type {Record<string, Array<{ pattern: RegExp, resolution_class: string }>>}
 */
const LANE_STATIC_RESOLUTION_HINTS = Object.freeze({
  cursor: [],
  github: [
    { pattern: /missing GITHUB_TOKEN|missing GITHUB_FINE_GRAINED_PAT/i, resolution_class: 'hil_required_external_auth' },
    { pattern: /missing GITHUB_REPOSITORY|missing GITHUB_DEFAULT_OWNER/i, resolution_class: 'tenancy_or_binding_ambiguity' },
    { pattern: /requires payload\./i, resolution_class: 'model_coordination_failure' },
  ],
  supabase: [
    { pattern: /missing SUPABASE_URL|missing SUPABASE_SERVICE_ROLE_KEY/i, resolution_class: 'hil_required_external_auth' },
    { pattern: /requires payload\./i, resolution_class: 'model_coordination_failure' },
  ],
  vercel: [],
  railway: [
    { pattern: /missing RAILWAY_TOKEN/i, resolution_class: 'hil_required_external_auth' },
    { pattern: /live 미개방|not yet opened|feature not opened/i, resolution_class: 'technical_capability_missing' },
    { pattern: /requires (payload|deployment_id|env)/i, resolution_class: 'model_coordination_failure' },
  ],
});

/**
 * Resolve the static hint class for a given tool + blocked_reason, if any.
 * @param {string} tool
 * @param {string | null} blockedReason
 * @returns {string | null}
 */
export function resolveLaneStaticResolutionClass(tool, blockedReason) {
  const hints = LANE_STATIC_RESOLUTION_HINTS[tool];
  if (!hints || !Array.isArray(hints) || hints.length === 0) return null;
  if (typeof blockedReason !== 'string' || !blockedReason.trim()) return null;
  for (const h of hints) {
    if (h.pattern.test(blockedReason)) return h.resolution_class;
  }
  return null;
}

/**
 * Wrap the lane precheck with W5-A `failure_classification`. Preserves the legacy
 * `{ blocked, blocked_reason, next_required_input }` shape for existing callers.
 *
 * @param {string} tool
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ blocked: boolean, blocked_reason: string | null, next_required_input: string | null, failure_classification: ReturnType<typeof buildFailureClassification> | null }}
 */
export function classifyToolInvocationPrecheck(tool, action, payload, env) {
  const lane = getExternalLaneRuntime(tool);
  const base = lane && typeof lane.invocationPrecheck === 'function'
    ? lane.invocationPrecheck(action, payload, env)
    : { blocked: false, blocked_reason: null, next_required_input: null };
  if (!base || typeof base !== 'object') {
    return { blocked: false, blocked_reason: null, next_required_input: null, failure_classification: null };
  }
  const blocked = Boolean(base.blocked);
  const blockedReason = typeof base.blocked_reason === 'string' ? base.blocked_reason : null;
  const nextRequired = typeof base.next_required_input === 'string' ? base.next_required_input : null;
  if (!blocked || !blockedReason) {
    return { blocked, blocked_reason: blockedReason, next_required_input: nextRequired, failure_classification: null };
  }
  const staticHint = resolveLaneStaticResolutionClass(tool, blockedReason);
  const heuristic = classifyLegacyBlockedSignal({ blocked_reason: blockedReason, next_required_input: nextRequired, hint_class: staticHint });
  const classification = buildFailureClassification({
    resolution_class: heuristic,
    human_gate_reason: blockedReason,
    human_gate_action: nextRequired ? `필수 입력 ${nextRequired} 을 제공해 주세요.` : null,
  });
  return {
    blocked,
    blocked_reason: blockedReason,
    next_required_input: nextRequired,
    failure_classification: classification,
  };
}
