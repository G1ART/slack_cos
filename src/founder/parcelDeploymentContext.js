/**
 * Ops smoke 요약·감사용 최소 테넌시 키 (에픽 6 — COS_Layer_Epic_LockIn).
 * `parcel_deployment_key` = deployment 축; 나머지 workspace / product / project_space 는 env로 선택 주입.
 * payload 에 이미 값이 있으면 덮어쓰지 않음.
 */

import { getRequestScope } from './requestScopeContext.js';
import { workspaceKeyFromSlackTeamId } from './slackEventTenancy.js';

const MAX_KEY_LEN = 64;

export const COS_PARCEL_DEPLOYMENT_KEY_ENV = 'COS_PARCEL_DEPLOYMENT_KEY';
export const COS_WORKSPACE_KEY_ENV = 'COS_WORKSPACE_KEY';
export const COS_PRODUCT_KEY_ENV = 'COS_PRODUCT_KEY';
export const COS_PROJECT_SPACE_KEY_ENV = 'COS_PROJECT_SPACE_KEY';

/**
 * @param {string} raw
 * @returns {string}
 */
function sanitizeTenancyKey(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const safe = s
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, MAX_KEY_LEN);
  return safe || '';
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} envVarName
 * @returns {string}
 */
function tenancyKeyFromEnvVar(env, envVarName) {
  return sanitizeTenancyKey(env[envVarName] || '');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function parcelDeploymentKeyFromEnv(env = process.env) {
  return tenancyKeyFromEnvVar(env, COS_PARCEL_DEPLOYMENT_KEY_ENV);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function workspaceKeyFromEnv(env = process.env) {
  return tenancyKeyFromEnvVar(env, COS_WORKSPACE_KEY_ENV);
}

/**
 * env 에 workspace 가 없을 때만 요청 스코프(Slack team_id)에서 workspace_key 후보.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function workspaceKeyFromRequestScopeFallback(env = process.env) {
  if (workspaceKeyFromEnv(env)) return '';
  const sid = getRequestScope().slack_team_id;
  return workspaceKeyFromSlackTeamId(sid != null ? String(sid) : '');
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function productKeyFromEnv(env = process.env) {
  return tenancyKeyFromEnvVar(env, COS_PRODUCT_KEY_ENV);
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function projectSpaceKeyFromEnv(env = process.env) {
  return tenancyKeyFromEnvVar(env, COS_PROJECT_SPACE_KEY_ENV);
}

/**
 * 부트·헬스용 — **값은 넣지 않고** env에 네 축이 설정됐는지 여부만 (로그 노출 최소화).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {{ parcel_deployment: boolean, workspace: boolean, product: boolean, project_space: boolean }}
 */
export function tenancyKeysPresenceFromEnv(env = process.env) {
  return {
    parcel_deployment: Boolean(parcelDeploymentKeyFromEnv(env)),
    workspace: Boolean(workspaceKeyFromEnv(env)),
    product: Boolean(productKeyFromEnv(env)),
    project_space: Boolean(projectSpaceKeyFromEnv(env)),
  };
}

/**
 * `cos_runs` insert/update용 — 값이 있는 키만 반환 (스네이크 케이스 컬럼명).
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
export function cosRunTenancyColumnsFromEnv(env = process.env) {
  /** @type {Record<string, string>} */
  const out = {};
  const p = parcelDeploymentKeyFromEnv(env);
  if (p) out.parcel_deployment_key = p;
  const w = workspaceKeyFromEnv(env);
  if (w) out.workspace_key = w;
  const pr = productKeyFromEnv(env);
  if (pr) out.product_key = pr;
  const ps = projectSpaceKeyFromEnv(env);
  if (ps) out.project_space_key = ps;
  return out;
}

/**
 * 런 행 객체에 테넄시 기본값 채움 (이미 비어 있지 않은 필드는 덮어쓰지 않음).
 * @param {Record<string, unknown>} row
 * @param {NodeJS.ProcessEnv} [env]
 */
export function applyCosRunTenancyDefaults(row, env = process.env) {
  const t = cosRunTenancyColumnsFromEnv(env);
  for (const [k, v] of Object.entries(t)) {
    const cur = row[k];
    if (cur != null && String(cur).trim()) continue;
    row[k] = v;
  }
  const wkFb = workspaceKeyFromRequestScopeFallback(env);
  if (wkFb) {
    const curWk = row.workspace_key;
    if (curWk == null || !String(curWk).trim()) row.workspace_key = wkFb;
  }
}

const COS_RUN_TENANCY_MERGE_KEYS = [
  'parcel_deployment_key',
  'workspace_key',
  'product_key',
  'project_space_key',
];

/**
 * durable run 행에서 요약·감사 payload 병합용 테넄시 조각만 추출.
 * @param {Record<string, unknown> | null | undefined} run
 * @returns {Record<string, string>}
 */
export function cosRunTenancyMergeHintsFromRunRow(run) {
  if (!run || typeof run !== 'object') return {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of COS_RUN_TENANCY_MERGE_KEYS) {
    const v = run[k];
    const s = v != null ? String(v).trim() : '';
    if (s) out[k] = s;
  }
  return out;
}

/**
 * `appendCosRunEvent*` 가 durable run 행으로부터 `mergeCanonicalExecutionEnvelopeToPayload` 에 넘길 ctx.
 * env·요청 스코프 병합은 canonical 쪽 SSOT; 여기서는 행 기준 thread + 테넄시 조각만 묶는다.
 *
 * @param {Record<string, unknown> | null | undefined} run
 * @param {string} runId
 * @param {string | null | undefined} [threadKeyOverride] active-thread 경로에서 이미 알고 있으면 전달
 * @returns {{ runId: string, threadKey?: string, runTenancy: Record<string, string> }}
 */
export function cosRunEventEnvelopeMergeCtxFromRun(run, runId, threadKeyOverride) {
  const rid = String(runId || '').trim();
  const fromOverride =
    threadKeyOverride != null && String(threadKeyOverride).trim()
      ? String(threadKeyOverride).trim().slice(0, 512)
      : '';
  const fromRun =
    run?.thread_key != null && String(run.thread_key).trim()
      ? String(run.thread_key).trim().slice(0, 512)
      : '';
  const rtk = fromOverride || fromRun;
  return {
    runId: rid,
    ...(rtk ? { threadKey: rtk } : {}),
    runTenancy: cosRunTenancyMergeHintsFromRunRow(run),
  };
}

/**
 * 요약 이벤트 payload에 최소 테넌시 키 병합 (비어 있는 필드만).
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv} [env]
 */
export function withParcelDeploymentPayload(payload, env = process.env) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  /** @type {Array<[string, string]>} */
  const pairs = [
    ['parcel_deployment_key', parcelDeploymentKeyFromEnv(env)],
    ['workspace_key', workspaceKeyFromEnv(env)],
    ['product_key', productKeyFromEnv(env)],
    ['project_space_key', projectSpaceKeyFromEnv(env)],
  ];
  for (const [field, v] of pairs) {
    const existing = String(pl[field] ?? '').trim();
    if (existing) continue;
    if (v) pl[field] = v;
  }
  return pl;
}

/**
 * 요약·감사 클라이언트 필터 (뷰 컬럼 또는 payload).
 * @param {Array<{ payload?: unknown, parcel_deployment_key?: unknown }>} rows
 * @param {string | null | undefined} deploymentKey
 * @param {boolean} [includeLegacy] 키 없는 행 포함(이행 구간)
 */
export function filterRowsByParcelDeploymentKey(rows, deploymentKey, includeLegacy = false) {
  const d = String(deploymentKey || '').trim();
  if (!d) return rows;
  const leg = includeLegacy === true;
  return rows.filter((r) => {
    const pl = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {};
    const fromCol = r.parcel_deployment_key != null ? String(r.parcel_deployment_key).trim() : '';
    const fromPl = String(pl.parcel_deployment_key ?? '').trim();
    const v = fromCol || fromPl;
    if (v === d) return true;
    if (leg && !v) return true;
    return false;
  });
}

/**
 * 스트림·폴백 병합 행에 workspace / product / project_space 선택 필터 (뷰 컬럼 또는 payload).
 * @param {Array<Record<string, unknown>>} rows
 * @param {{
 *   workspaceKey?: string | null,
 *   productKey?: string | null,
 *   projectSpaceKey?: string | null,
 *   tenancyIncludeLegacy?: boolean,
 * }} f
 */
export function filterRowsByOptionalTenancyKeys(rows, f) {
  const wk = String(f.workspaceKey || '').trim();
  const pk = String(f.productKey || '').trim();
  const psk = String(f.projectSpaceKey || '').trim();
  const leg = f.tenancyIncludeLegacy === true;
  if (!wk && !pk && !psk) return rows;
  return rows.filter((r) => {
    const pl = r.payload && typeof r.payload === 'object' && !Array.isArray(r.payload) ? r.payload : {};
    /** @type {Array<[string, string]>} */
    const dims = [
      ['workspace_key', wk],
      ['product_key', pk],
      ['project_space_key', psk],
    ];
    for (const [col, want] of dims) {
      if (!want) continue;
      const fromCol = r[col] != null ? String(r[col]).trim() : '';
      const fromPl = String(pl[col] ?? '').trim();
      const v = fromCol || fromPl;
      if (v === want) continue;
      if (leg && !v) continue;
      return false;
    }
    return true;
  });
}
