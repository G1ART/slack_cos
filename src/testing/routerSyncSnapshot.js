/**
 * 인바운드 동기 스냅샷 — `runInboundCommandRouter` / 프로덕션과 동일한 정규화·추출 순서.
 * @see ../features/runInboundCommandRouter.js (routing_sync_snapshot 로그 직전 단계)
 */

import { normalizeSlackUserPayload } from '../slack/slackTextNormalize.js';
import {
  normalizePlannerInputForRoute,
  analyzePlannerResponderLock,
} from '../features/plannerRoute.js';
import {
  extractQueryCommandLine,
  matchQueryCommandPrefix,
  parseCommandToken,
} from '../features/queryOnlyRoute.js';

/**
 * @param {string} userText getInboundCommandText 결과 또는 동일 의미의 평문
 */
export function buildRouterSyncSnapshot(userText) {
  const trimmed = normalizeSlackUserPayload(String(userText ?? '').trim());
  const plannerNorm = normalizePlannerInputForRoute(trimmed);
  const plannerLock = analyzePlannerResponderLock(plannerNorm);
  const queryLineResolved = extractQueryCommandLine(trimmed) ?? trimmed;
  const queryPrefix = matchQueryCommandPrefix(queryLineResolved);
  const target_id = queryPrefix ? parseCommandToken(queryLineResolved, queryPrefix) : null;

  return {
    trimmed,
    planner_norm: plannerNorm,
    planner_lock: plannerLock,
    query_line_resolved: queryLineResolved,
    query_prefix: queryPrefix,
    target_id,
  };
}
