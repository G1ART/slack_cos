/**
 * Cursor Automation — HTTP trigger (Railway: endpoint + auth header).
 * Auth 값·전체 URL은 founder-facing/로그에 노출하지 않는다.
 */

import crypto from 'node:crypto';

/** @type {{ fn: typeof fetch | null }} */
export const __cursorAutomationFetchForTests = { fn: null };

export function isCursorCloudAgentEnabled(env = process.env) {
  return String(env.CURSOR_CLOUD_AGENT_ENABLED || '').trim() === '1';
}

export function isCursorAutomationConfigured(env = process.env) {
  const ep = String(env.CURSOR_AUTOMATION_ENDPOINT || '').trim();
  const auth = String(env.CURSOR_AUTOMATION_AUTH_HEADER || '').trim();
  return !!ep && !!auth;
}

/** Cloud-first lane: 플래그 + Automation 자격증명 */
export function isCursorCloudAgentLaneReady(env = process.env) {
  return isCursorCloudAgentEnabled(env) && isCursorAutomationConfigured(env);
}

/**
 * @param {string | undefined} raw
 * @returns {Record<string, string>}
 */
export function headersFromAutomationAuth(raw) {
  const s = String(raw || '').trim();
  if (!s) return {};
  const colonIdx = s.indexOf(':');
  if (colonIdx > 0 && colonIdx < 64) {
    const name = s.slice(0, colonIdx).trim();
    const val = s.slice(colonIdx + 1).trim();
    if (/^[\w-]+$/.test(name) && val) return { [name]: val };
  }
  return { Authorization: s };
}

/**
 * @param {string | undefined} endpoint
 */
export function automationEndpointHostOnly(endpoint) {
  try {
    return new URL(String(endpoint || '').trim()).host || null;
  } catch {
    return null;
  }
}

/**
 * Dot-path getter (e.g. data.run.id). Bracket indices not supported.
 * @param {unknown} obj
 * @param {string} pathStr
 */
export function getByDotPath(obj, pathStr) {
  const path = String(pathStr || '').trim();
  if (!path || obj == null || typeof obj !== 'object') return undefined;
  const parts = path.split('.').filter(Boolean);
  let cur = obj;
  for (const p of parts) {
    if (cur == null || typeof cur !== 'object' || Array.isArray(cur)) return undefined;
    cur = /** @type {Record<string, unknown>} */ (cur)[p];
  }
  return cur;
}

const RESPONSE_PATH_ENVS = [
  'CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH',
  'CURSOR_AUTOMATION_RESPONSE_URL_PATH',
  'CURSOR_AUTOMATION_RESPONSE_STATUS_PATH',
  'CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH',
];

/** @param {NodeJS.ProcessEnv} [env] */
export function listAutomationResponseOverrideKeys(env = process.env) {
  const keys = [];
  for (const k of RESPONSE_PATH_ENVS) {
    if (String(env[k] || '').trim()) keys.push(k);
  }
  return keys;
}

/**
 * @param {Record<string, unknown> | null} parsed
 * @param {NodeJS.ProcessEnv} env
 */
export function extractAutomationResponseFields(parsed, env) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      external_run_id: null,
      external_url: null,
      automation_status_raw: null,
      automation_branch_raw: null,
    };
  }

  const runIdPath = String(env.CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH || '').trim();
  const urlPath = String(env.CURSOR_AUTOMATION_RESPONSE_URL_PATH || '').trim();
  const statusPath = String(env.CURSOR_AUTOMATION_RESPONSE_STATUS_PATH || '').trim();
  const branchPath = String(env.CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH || '').trim();

  let external_run_id = '';
  if (runIdPath) {
    const v = getByDotPath(parsed, runIdPath);
    if (v != null) external_run_id = String(v).trim();
  }
  if (!external_run_id) {
    external_run_id = String(
      parsed.run_id ??
        parsed.runId ??
        parsed.id ??
        parsed.external_run_id ??
        parsed.externalRunId ??
        '',
    ).trim();
  }

  let external_url = '';
  if (urlPath) {
    const v = getByDotPath(parsed, urlPath);
    if (v != null) external_url = String(v).trim();
  }
  if (!external_url) {
    external_url = String(
      parsed.url ?? parsed.run_url ?? parsed.runUrl ?? parsed.external_url ?? parsed.externalUrl ?? '',
    ).trim();
  }

  let automation_status_raw = null;
  if (statusPath) {
    const v = getByDotPath(parsed, statusPath);
    automation_status_raw = v != null ? String(v).trim() : null;
  }

  let automation_branch_raw = null;
  if (branchPath) {
    const v = getByDotPath(parsed, branchPath);
    automation_branch_raw = v != null ? String(v).trim() : null;
  }

  return {
    external_run_id: external_run_id || null,
    external_url: external_url || null,
    automation_status_raw,
    automation_branch_raw,
  };
}

export function isCursorAutomationSmokeMode(env = process.env) {
  return String(env.CURSOR_AUTOMATION_SMOKE_MODE || '').trim() === '1';
}

/**
 * @param {{
 *   action: string,
 *   payload: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 *   invocation_id?: string,
 *   timeoutMs?: number,
 * }} opts
 */
export async function triggerCursorAutomation(opts) {
  const env = opts.env || process.env;
  const endpoint = String(env.CURSOR_AUTOMATION_ENDPOINT || '').trim();
  const authRaw = String(env.CURSOR_AUTOMATION_AUTH_HEADER || '').trim();
  const timeoutMs = Number(opts.timeoutMs ?? env.CURSOR_CLOUD_TIMEOUT_MS ?? 60_000) || 60_000;
  const request_id =
    String(opts.invocation_id || '').trim() ||
    `ca_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  if (!endpoint || !authRaw) {
    return {
      ok: false,
      trigger_status: 'blocked_missing_config',
      status: 0,
      trigger_response_preview: null,
      request_id,
      external_run_id: null,
      external_url: null,
      error_code: 'cursor_automation_not_configured',
    };
  }

  const body = JSON.stringify({
    action: String(opts.action || ''),
    payload: opts.payload && typeof opts.payload === 'object' && !Array.isArray(opts.payload) ? opts.payload : {},
    request_id,
    source: 'g1_cos_slack',
  });

  const authHeaders = headersFromAutomationAuth(authRaw);
  const headers = {
    'Content-Type': 'application/json',
    ...authHeaders,
  };

  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  const impl = __cursorAutomationFetchForTests.fn || fetch;

  try {
    const res = await impl(endpoint, {
      method: 'POST',
      headers,
      body,
      signal: ac.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    const preview = text.slice(0, 2000);
    /** @type {Record<string, unknown> | null} */
    let parsed = null;
    try {
      const j = JSON.parse(text);
      parsed = j && typeof j === 'object' && !Array.isArray(j) ? j : null;
    } catch {
      parsed = null;
    }
    const extracted = extractAutomationResponseFields(parsed, env);
    const external_run_id = extracted.external_run_id;
    const external_url = extracted.external_url;
    const automation_branch_raw = extracted.automation_branch_raw;
    const automation_status_raw = extracted.automation_status_raw;

    const ok = res.ok;
    return {
      ok,
      trigger_status: ok ? 'accepted' : `http_${res.status}`,
      status: res.status,
      trigger_response_preview: preview || null,
      request_id,
      external_run_id,
      external_url,
      automation_branch_raw,
      automation_status_raw,
      error_code: ok ? null : `cursor_automation_http_${res.status}`,
    };
  } catch (e) {
    clearTimeout(timer);
    const aborted = e && typeof e === 'object' && 'name' in e && e.name === 'AbortError';
    return {
      ok: false,
      trigger_status: aborted ? 'timeout' : 'fetch_error',
      status: 0,
      trigger_response_preview: String(e?.message || e).slice(0, 500),
      request_id,
      external_run_id: null,
      external_url: null,
      error_code: aborted ? 'cursor_automation_timeout' : 'cursor_automation_fetch_error',
    };
  }
}
