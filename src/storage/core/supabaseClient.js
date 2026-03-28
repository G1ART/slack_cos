export function getSupabaseClientConfig() {
  const url = process.env.SUPABASE_URL || null;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || null;
  return {
    url,
    hasKey: Boolean(key),
    configured: Boolean(url && key),
  };
}

export function formatSupabaseConnectivity(config) {
  return [
    'Supabase connectivity',
    `- configured: ${config.configured ? 'yes' : 'no'}`,
    `- url: ${config.url || 'null'}`,
    `- service role key present: ${config.hasKey ? 'yes' : 'no'}`,
  ].join('\n');
}

function normalizeUrl(url) {
  if (!url) return null;
  return String(url).replace(/\/+$/, '');
}

function buildAuthHeaders(cfg) {
  // 서버 전용: 서비스 롤 키로만 인증
  return {
    apikey: cfg.key,
    Authorization: `Bearer ${cfg.key}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
}

async function supabaseFetch({ cfg, method, path, query, body, headers }) {
  const base = normalizeUrl(cfg.url);
  if (!base) throw new Error('supabase url missing');

  const qs = query && Object.keys(query).length ? `?${new URLSearchParams(query).toString()}` : '';
  const res = await fetch(`${base}${path}${qs}`, {
    method,
    headers: { ...buildAuthHeaders(cfg), ...(headers || {}) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    let details = text;
    try {
      const parsed = JSON.parse(text);
      details = parsed?.message || parsed?.hint || text;
    } catch {
      // keep raw
    }
    const err = new Error(`supabase http ${res.status}: ${details}`);
    err.status = res.status;
    throw err;
  }

  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export async function supabaseCheckConnectivity({ table }) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) return { ok: false, error: 'supabase_not_configured' };

  // tables는 아직 없을 수도 있으므로, 최소 질의로 200 여부 확인
  try {
    const tableName = table;
    await supabaseFetch({
      cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
      method: 'GET',
      path: `/rest/v1/${encodeURIComponent(tableName)}`,
      // context 테이블(project_context/environment_context)은 id 컬럼이 없을 수 있으므로 전체 선택
      query: { select: '*', limit: 1 },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e?.message || e) };
  }
}

export async function supabaseCountRows(table) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) throw new Error('supabase_not_configured');

  const res = await supabaseFetch({
    cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'GET',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query: { select: 'count' },
  });

  // PostgREST count result 형식은 [ { count: 'N' } ] 형태로 오는 경우가 많음
  const count = Array.isArray(res) && res[0] ? res[0].count : null;
  const n = typeof count === 'string' ? Number(count) : count;
  return Number.isFinite(n) ? n : 0;
}

export async function supabaseGetLatestUpdatedAt(table, updatedAtColumn) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) throw new Error('supabase_not_configured');
  if (!updatedAtColumn) return null;

  const res = await supabaseFetch({
    cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'GET',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query: {
      select: updatedAtColumn,
      order: `${updatedAtColumn}.desc`,
      limit: 1,
    },
  });

  const row = Array.isArray(res) ? res[0] : null;
  const v = row ? row[updatedAtColumn] : null;
  return v || null;
}

export async function supabaseRestQuery({ table, select, filters, order, limit }) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) throw new Error('supabase_not_configured');

  const query = { select: select || '*' };
  if (Number.isFinite(limit)) query.limit = limit;
  if (order) query.order = order;
  if (filters && typeof filters === 'object') {
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null) continue;
      // v가 배열이면 in() 대체 전략(초기 구현: eq only)
      query[k] = `eq.${v}`;
    }
  }

  const res = await supabaseFetch({
    cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'GET',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query,
  });
  return res;
}

export async function supabaseRestUpsert({ table, pkColumn, rows }) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) throw new Error('supabase_not_configured');

  const res = await supabaseFetch({
    cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'POST',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query: { on_conflict: pkColumn },
    body: Array.isArray(rows) ? rows : [rows],
    headers: {
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
  });
  return res;
}

export async function supabaseRestInsert({ table, rows }) {
  const cfg = getSupabaseClientConfig();
  if (!cfg.configured) throw new Error('supabase_not_configured');
  return supabaseFetch({
    cfg: { ...cfg, key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'POST',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    body: Array.isArray(rows) ? rows : [rows],
    headers: {
      Prefer: 'return=representation',
    },
  });
}

export async function supabaseRestPatch({ table, pkColumn, pkValue, patch }) {
  return supabaseFetch({
    cfg: { ...getSupabaseClientConfig(), key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'PATCH',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query: { [pkColumn]: `eq.${pkValue}` },
    body: patch,
  });
}

export async function supabaseRestDelete({ table, pkColumn, pkValue }) {
  return supabaseFetch({
    cfg: { ...getSupabaseClientConfig(), key: process.env.SUPABASE_SERVICE_ROLE_KEY },
    method: 'DELETE',
    path: `/rest/v1/${encodeURIComponent(table)}`,
    query: { [pkColumn]: `eq.${pkValue}` },
  });
}
