/**
 * Pre-invocation credential / payload gates — delegated per lane via registry.
 */

import { getExternalLaneRuntime } from './externalToolLaneRegistry.js';

/**
 * @param {string} tool
 * @param {string} action
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv} env
 */
export function toolInvocationBlocked(tool, action, payload, env) {
  const lane = getExternalLaneRuntime(tool);
  if (lane?.invocationPrecheck) return lane.invocationPrecheck(action, payload, env);
  return { blocked: false, blocked_reason: null, next_required_input: null };
}
