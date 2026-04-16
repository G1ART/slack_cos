/**
 * External tool → execution plane metadata (routing docs / ops; not security boundary).
 * Keep in sync with ALLOWED_EXTERNAL_TOOLS + toolsBridge action matrix.
 */

import { ALLOWED_EXTERNAL_TOOLS } from './cosFounderToolDefinitions.js';

/** @type {Record<string, { plane: string, actions_hint: string }>} */
const EXTERNAL_TOOL_LANE_BY_TOOL = {
  cursor: { plane: 'cursor_cloud', actions_hint: 'create_spec, emit_patch' },
  github: { plane: 'github_rest', actions_hint: 'create_issue, open_pr' },
  supabase: { plane: 'supabase_sql', actions_hint: 'apply_sql' },
  vercel: { plane: 'vercel_deploy', actions_hint: 'deploy' },
  railway: { plane: 'railway_ops', actions_hint: 'deploy, inspect_logs' },
};

/** @returns {{ tool: string, plane: string, actions_hint: string }[]} */
export function listExternalToolLanes() {
  return Object.entries(EXTERNAL_TOOL_LANE_BY_TOOL).map(([tool, v]) => ({
    tool,
    plane: v.plane,
    actions_hint: v.actions_hint,
  }));
}

/**
 * @param {string} tool
 * @returns {({ plane: string, actions_hint: string })|null}
 */
export function getExternalToolLane(tool) {
  const k = String(tool || '').trim();
  return EXTERNAL_TOOL_LANE_BY_TOOL[k] || null;
}

/** @returns {string[]} — tools missing from lane registry (should be empty) */
export function externalToolLaneRegistryGaps() {
  const gaps = [];
  for (const t of ALLOWED_EXTERNAL_TOOLS) {
    if (!EXTERNAL_TOOL_LANE_BY_TOOL[t]) gaps.push(t);
  }
  return gaps;
}
