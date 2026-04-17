/**
 * W13-A2 — Vercel Project Env Variables write client.
 *
 * 공식 API:
 *   GET   /v9/projects/{projectId}/env          — list (존재 확인, 값 read-back 불가 for encrypted)
 *   POST  /v10/projects/{projectId}/env         — create (type='encrypted' 권장)
 *   PATCH /v9/projects/{projectId}/env/{envId}  — update existing
 *
 * `teamId` 쿼리 파라미터는 팀 소유 프로젝트일 때 필수. COS 는 `VERCEL_TEAM_ID` env 또는 opts 로 받는다.
 *
 * 이 모듈은 raw value 를 저장·로깅하지 않고, 호출자가 제공한 value 는 요청 body 이외 어디에도 흐르지 않는다.
 * deleteEnv 는 본 에픽 scope 제외 (비대칭 경계).
 */

const BASE = 'https://api.vercel.com';

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
  };
}

function appendTeam(urlObj, teamId) {
  const t = String(teamId || '').trim();
  if (t) urlObj.searchParams.set('teamId', t);
  return urlObj;
}

/**
 * @param {{ projectId: string, token: string, teamId?: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: boolean, status: number, envs?: Array<{ id: string, key: string, target?: string[], type?: string }> }>}
 */
export async function listEnv({ projectId, token, teamId, fetchImpl }) {
  const fx = fetchImpl || fetch;
  const url = appendTeam(
    new URL(`${BASE}/v9/projects/${encodeURIComponent(String(projectId || ''))}/env`),
    teamId,
  );
  const res = await fx(url.toString(), { method: 'GET', headers: authHeaders(token) });
  if (!res.ok) return { ok: false, status: res.status };
  const body = await res.json().catch(() => null);
  const envs = Array.isArray(body?.envs)
    ? body.envs.map((e) => ({
        id: String(e?.id || ''),
        key: String(e?.key || ''),
        target: Array.isArray(e?.target) ? e.target.map(String) : [],
        type: typeof e?.type === 'string' ? e.type : undefined,
      }))
    : [];
  return { ok: true, status: res.status, envs };
}

/**
 * @param {{ projectId: string, token: string, teamId?: string, key: string, value: string, target: string[], type?: string, fetchImpl?: typeof fetch }} args
 * @returns {Promise<{ ok: boolean, status: number, envId?: string }>}
 */
export async function createEnv({ projectId, token, teamId, key, value, target, type, fetchImpl }) {
  const fx = fetchImpl || fetch;
  const url = appendTeam(
    new URL(`${BASE}/v10/projects/${encodeURIComponent(String(projectId || ''))}/env`),
    teamId,
  );
  const body = {
    key: String(key || ''),
    value: String(value == null ? '' : value),
    type: String(type || 'encrypted'),
    target: Array.isArray(target) && target.length > 0 ? target.map(String) : ['production'],
  };
  const res = await fx(url.toString(), {
    method: 'POST',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, status: res.status };
  const parsed = await res.json().catch(() => null);
  const envId =
    typeof parsed?.id === 'string'
      ? parsed.id
      : Array.isArray(parsed?.created)
        ? String(parsed.created[0]?.id || '')
        : '';
  return { ok: true, status: res.status, envId: envId || undefined };
}

/**
 * @param {{ projectId: string, token: string, teamId?: string, envId: string, value: string, target?: string[], type?: string, fetchImpl?: typeof fetch }} args
 */
export async function updateEnv({ projectId, token, teamId, envId, value, target, type, fetchImpl }) {
  const fx = fetchImpl || fetch;
  const url = appendTeam(
    new URL(
      `${BASE}/v9/projects/${encodeURIComponent(String(projectId || ''))}/env/${encodeURIComponent(String(envId || ''))}`,
    ),
    teamId,
  );
  /** @type {Record<string, unknown>} */
  const body = { value: String(value == null ? '' : value) };
  if (Array.isArray(target) && target.length > 0) body.target = target.map(String);
  if (typeof type === 'string') body.type = type;
  const res = await fx(url.toString(), {
    method: 'PATCH',
    headers: { ...authHeaders(token), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: res.ok, status: res.status };
}

export default { listEnv, createEnv, updateEnv };
