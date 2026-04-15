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

/** `read_execution_context` 보조: ledger artifact payload 스캔 시 `slack_team_id` 포함. */
const LEDGER_ARTIFACT_SPINE_SCAN_KEYS = [...CANONICAL_ENVELOPE_SPINE_KEYS, 'slack_team_id'];

/**
 * 최근 스레드 ledger artifact 의 payload 에서 스파인·테넄시 문자열 **distinct** 만 수집 (의미 해석 없음).
 *
 * @param {Array<{ payload?: unknown }>} artifacts
 * @param {number} [maxEach] 키당 최대 개수
 * @returns {Record<string, string[]>}
 */
export function distinctSpineKeysFromLedgerArtifacts(artifacts, maxEach = 8) {
  const cap = Math.max(1, Math.min(24, maxEach || 8));
  /** @type {Record<string, Set<string>>} */
  const sets = Object.fromEntries(LEDGER_ARTIFACT_SPINE_SCAN_KEYS.map((k) => [k, new Set()]));
  for (const a of artifacts || []) {
    const p = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? a.payload : {};
    for (const k of LEDGER_ARTIFACT_SPINE_SCAN_KEYS) {
      if (sets[k].size >= cap) continue;
      const v = p[k];
      if (v == null) continue;
      const s = String(v).trim();
      if (!s) continue;
      sets[k].add(s);
    }
  }
  return Object.fromEntries(LEDGER_ARTIFACT_SPINE_SCAN_KEYS.map((k) => [k, [...sets[k]].sort()]));
}

/**
 * 테넄시(env) + run/packet/thread 컨텍스트를 한 경로에서 병합. 이미 비어 있지 않은 필드는 덮어쓰지 않음.
 *
 * @param {Record<string, unknown>} payload
 * @param {{
 *   runId?: string | null,
 *   packetId?: string | null,
 *   threadKey?: string | null,
 *   runTenancy?: Record<string, unknown> | null,
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

  const rt = ctx.runTenancy && typeof ctx.runTenancy === 'object' ? ctx.runTenancy : {};
  const tenancyKeys = ['parcel_deployment_key', 'workspace_key', 'product_key', 'project_space_key'];
  for (const k of tenancyKeys) {
    if (!String(pl[k] || '').trim() && rt[k] != null && String(rt[k]).trim()) {
      pl[k] = String(rt[k]).trim();
    }
  }
  // M0: 요약·감사 한 줄 진단 — scope 없을 때 workspace_key 가 Slack 팀 ID 형태면 slack_team_id 보강.
  if (!String(pl.slack_team_id || '').trim()) {
    const wk = String(pl.workspace_key || '').trim();
    if (/^T[A-Z0-9]+$/.test(wk)) pl.slack_team_id = wk;
  }
  return pl;
}

/**
 * 스레드 로컬 execution ledger 행(harness_dispatch·tool_invocation·execution_note 등) — durable `cos_run_events` 와 동일 SSOT 병합.
 *
 * @param {Record<string, unknown>} payload
 * @param {{
 *   threadKey: string,
 *   runId?: string | null,
 *   packetId?: string | null,
 *   runTenancy?: Record<string, unknown> | null,
 * }} rowCtx
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, unknown>}
 */
export function mergeLedgerExecutionRowPayload(payload, rowCtx, env = process.env) {
  const tk = String(rowCtx.threadKey || '').trim();
  if (!tk) {
    return payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  }
  const base = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  const rid = rowCtx.runId != null && String(rowCtx.runId).trim() ? String(rowCtx.runId).trim() : '';
  const pid = rowCtx.packetId != null && String(rowCtx.packetId).trim() ? String(rowCtx.packetId).trim() : '';
  const rt =
    rowCtx.runTenancy && typeof rowCtx.runTenancy === 'object' && !Array.isArray(rowCtx.runTenancy)
      ? rowCtx.runTenancy
      : null;
  return mergeCanonicalExecutionEnvelopeToPayload(base, {
    threadKey: tk,
    ...(rid ? { runId: rid } : {}),
    ...(pid ? { packetId: pid } : {}),
    ...(rt ? { runTenancy: rt } : {}),
  }, env);
}
