/**
 * 툴 레지스트리 관측 — `queryOnlyRoute` 등과 순환하지 않도록 경량만 둔다.
 * @see cosToolRegistry.js · cosToolRuntime.js
 */

import { COS_TOOL_REGISTRY_V0 } from './cosToolRegistry.js';
import { logRouterEvent } from './topLevelRouter.js';

/** @type {Record<string, object>} */
const BY_ID = Object.fromEntries(COS_TOOL_REGISTRY_V0.map((t) => [t.id, t]));

/** @param {string} id */
export function getCosToolDescriptor(id) {
  return BY_ID[id] ?? null;
}

/**
 * finalize / fixture 분류 축에서 툴 id 추정 (로그·테스트용)
 * @param {string} responder
 */
export function inferCosToolRegistryIdFromResponder(responder) {
  switch (responder) {
    case 'query':
      return 'plan_query';
    case 'planner':
      return 'plan_register';
    case 'navigator':
      return 'navigator';
    case 'council':
      return 'council';
    default:
      return null;
  }
}

/**
 * @param {Record<string, unknown>} fields tool_id, pipeline, response_type 등
 */
export function logCosToolRegistryBind(fields) {
  logRouterEvent('tool_registry_bind', fields);
}
