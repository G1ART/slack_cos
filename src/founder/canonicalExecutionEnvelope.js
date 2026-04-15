/**
 * Roadmap **M1** — 레이어 간 공통 실행 봉투 (payload snake_case).
 * `parcel_deployment_key` = deployment 축 (로드맵의 deployment_key 와 동일 역할).
 *
 * @see docs/cursor-handoffs/G1_COS_Upgrade_Roadmap_2026-04-14.md (M1)
 * @see docs/cursor-handoffs/COS_Phase1_CrossLayer_Envelope_2026-04-15.md
 * @see docs/cursor-handoffs/WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md
 */

import { withParcelDeploymentPayload } from './parcelDeploymentContext.js';
import { getRequestScope } from './requestScopeContext.js';
import { workspaceKeyFromSlackTeamId } from './slackEventTenancy.js';

/** 요약·감사 스트림 payload 에서 흔적 추적에 쓰는 정본 키 (값 비어 있으면 채움 시도). */
export const CANONICAL_ENVELOPE_SPINE_KEYS = [
  'run_id',
  'packet_id',
  'thread_key',
  'parcel_deployment_key',
  'workspace_key',
  'product_key',
  'project_space_key',
];

/**
 * 테넄시(env) + run/packet/thread 컨텍스트를 한 경로에서 병합. 이미 비어 있지 않은 필드는 덮어쓰지 않음.
 *
 * @param {Record<string, unknown>} payload
 * @param {{
 *   runId?: string | null,
 *   packetId?: string | null,
 *   threadKey?: string | null,
 * }} [ctx]
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, unknown>}
 */
export function mergeCanonicalExecutionEnvelopeToPayload(payload, ctx = {}, env = process.env) {
  let pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  pl = withParcelDeploymentPayload(pl, env);
  const scope = getRequestScope();
  const scopedTeamId = scope.slack_team_id != null ? String(scope.slack_team_id).trim() : '';
  const scopedWorkspace = workspaceKeyFromSlackTeamId(scopedTeamId);
  if (!String(pl.workspace_key || '').trim() && scopedWorkspace) {
    pl.workspace_key = scopedWorkspace;
  }
  if (!String(pl.slack_team_id || '').trim() && scopedTeamId) {
    pl.slack_team_id = scopedTeamId;
  }

  const r = ctx.runId != null && String(ctx.runId).trim() ? String(ctx.runId).trim() : '';
  if (r && !String(pl.run_id || '').trim()) {
    pl.run_id = r;
  }
  const pk = ctx.packetId != null && String(ctx.packetId).trim() ? String(ctx.packetId).trim() : '';
  if (pk && !String(pl.packet_id || '').trim()) {
    pl.packet_id = pk;
  }
  const tk = ctx.threadKey != null && String(ctx.threadKey).trim() ? String(ctx.threadKey).trim().slice(0, 512) : '';
  if (tk && !String(pl.thread_key || '').trim()) {
    pl.thread_key = tk;
  }
  return pl;
}
