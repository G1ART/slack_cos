/**
 * Runtime SSOT: external tool → lane adapter, readiness, and pre-invocation checks.
 * Dispatch (`dispatchExternalToolCall`) resolves execution through this registry only.
 */

import { ALLOWED_EXTERNAL_TOOLS } from './cosFounderToolDefinitions.js';
import { TOOL_ALLOWED_ACTIONS } from './toolLaneActions.js';
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
