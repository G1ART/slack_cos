/**
 * Ops smoke 요약·감사용 최소 테넌시 키 (에픽 6 — COS_Layer_Epic_LockIn).
 * `parcel_deployment_key` = deployment 축; 나머지 workspace / product / project_space 는 env로 선택 주입.
 * payload 에 이미 값이 있으면 덮어쓰지 않음.
 */

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
