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
    const external_run_id =
      parsed &&
      String(
        parsed.run_id ??
          parsed.runId ??
          parsed.id ??
          parsed.external_run_id ??
          parsed.externalRunId ??
          '',
      ).trim();
    const external_url =
      parsed &&
      String(parsed.url ?? parsed.run_url ?? parsed.runUrl ?? parsed.external_url ?? '').trim();

    const ok = res.ok;
    return {
      ok,
      trigger_status: ok ? 'accepted' : `http_${res.status}`,
      status: res.status,
      trigger_response_preview: preview || null,
      request_id,
      external_run_id: external_run_id || null,
      external_url: external_url || null,
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
