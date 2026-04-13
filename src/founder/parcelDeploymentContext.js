/**
 * 멀티 배포·공유 Supabase: 스모크 요약 스트림·감사를 배포 단위로 나누기 위한 키.
 * `COS_PARCEL_DEPLOYMENT_KEY` 비우면 레거시(전역) 동작.
 */

export const COS_PARCEL_DEPLOYMENT_KEY_ENV = 'COS_PARCEL_DEPLOYMENT_KEY';

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function parcelDeploymentKeyFromEnv(env = process.env) {
  const raw = String(env[COS_PARCEL_DEPLOYMENT_KEY_ENV] || '').trim();
  if (!raw) return '';
  const safe = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 64);
  return safe || '';
}

/**
 * payload에 이미 parcel_deployment_key 가 있으면 유지.
 * @param {Record<string, unknown>} payload
 * @param {NodeJS.ProcessEnv} [env]
 */
export function withParcelDeploymentPayload(payload, env = process.env) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  const existing = String(pl.parcel_deployment_key ?? '').trim();
  if (existing) return pl;
  const k = parcelDeploymentKeyFromEnv(env);
  if (!k) return pl;
  return { ...pl, parcel_deployment_key: k };
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
