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
  'CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH',
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

/** Ordered candidates; only values that exist on the parsed object are used (no guessing). */
const DEFAULT_RUN_ID_DOT_PATHS = [
  'run_id',
  'runId',
  'id',
  'external_run_id',
  'externalRunId',
  'data.run.id',
  'result.agentRunId',
  'result.runId',
  'job.run.id',
  'payload.run.id',
];

const DEFAULT_URL_DOT_PATHS = [
  'url',
  'run_url',
  'runUrl',
  'external_url',
  'externalUrl',
  'data.url',
  'result.url',
  'result.runUrl',
  'job.url',
  'payload.url',
];

const DEFAULT_STATUS_DOT_PATHS = ['status', 'state', 'result.status', 'data.status', 'payload.status'];

const DEFAULT_BRANCH_DOT_PATHS = ['branch', 'branch_name', 'branchName', 'result.branch', 'data.branch'];

/** Acceptance / correlation id from provider — not canonical COS external_run_id until callback matches. */
const DEFAULT_ACCEPTED_EXTERNAL_ID_PATHS = ['backgroundComposerId', 'composerId', 'background_composer_id'];

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
      accepted_external_id: null,
      selected_run_id_field_name: null,
      selected_accepted_id_field_name: null,
      selected_url_field_name: null,
      selected_status_field_name: null,
      has_run_id: false,
      has_accepted_external_id: false,
      has_status: false,
      has_url: false,
    };
  }

  const runIdPath = String(env.CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH || '').trim();
  const acceptedIdPath = String(env.CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH || '').trim();
  const urlPath = String(env.CURSOR_AUTOMATION_RESPONSE_URL_PATH || '').trim();
  const statusPath = String(env.CURSOR_AUTOMATION_RESPONSE_STATUS_PATH || '').trim();
  const branchPath = String(env.CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH || '').trim();

  /** @type {string | null} */
  let selected_run_id_field_name = null;
  let external_run_id = '';
  if (runIdPath) {
    const v = getByDotPath(parsed, runIdPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        external_run_id = s;
        selected_run_id_field_name = runIdPath;
      }
    }
  }
  if (!external_run_id) {
    for (const p of DEFAULT_RUN_ID_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        external_run_id = s;
        selected_run_id_field_name = p;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_url_field_name = null;
  let external_url = '';
  if (urlPath) {
    const v = getByDotPath(parsed, urlPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        external_url = s;
        selected_url_field_name = urlPath;
      }
    }
  }
  if (!external_url) {
    for (const p of DEFAULT_URL_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        external_url = s;
        selected_url_field_name = p;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_status_field_name = null;
  let automation_status_raw = null;
  if (statusPath) {
    const v = getByDotPath(parsed, statusPath);
    if (v != null) {
      const s = String(v).trim();
      automation_status_raw = s || null;
      selected_status_field_name = s ? statusPath : null;
    }
  }
  if (automation_status_raw == null) {
    for (const p of DEFAULT_STATUS_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        automation_status_raw = s;
        selected_status_field_name = p;
        break;
      }
    }
  }

  /** @type {string | null} */
  let automation_branch_raw = null;
  if (branchPath) {
    const v = getByDotPath(parsed, branchPath);
    automation_branch_raw = v != null ? String(v).trim() || null : null;
  }
  if (automation_branch_raw == null) {
    for (const p of DEFAULT_BRANCH_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        automation_branch_raw = s;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_accepted_id_field_name = null;
  let accepted_external_id = '';
  if (acceptedIdPath) {
    const v = getByDotPath(parsed, acceptedIdPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        accepted_external_id = s;
        selected_accepted_id_field_name = acceptedIdPath;
      }
    }
  }
  if (!accepted_external_id) {
    for (const p of DEFAULT_ACCEPTED_EXTERNAL_ID_PATHS) {
      if (!Object.prototype.hasOwnProperty.call(parsed, p)) continue;
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        accepted_external_id = s;
        selected_accepted_id_field_name = p;
        break;
      }
    }
  }

  const has_run_id = !!external_run_id;
  const has_url = !!external_url;
  const has_status = automation_status_raw != null && String(automation_status_raw).trim() !== '';
  const has_accepted_external_id = !!accepted_external_id;

  return {
    external_run_id: external_run_id || null,
    external_url: external_url || null,
    automation_status_raw,
    automation_branch_raw,
    accepted_external_id: accepted_external_id || null,
    selected_run_id_field_name,
    selected_accepted_id_field_name,
    selected_url_field_name,
    selected_status_field_name,
    has_run_id,
    has_accepted_external_id,
    has_status,
    has_url,
  };
}

export function isCursorAutomationSmokeMode(env = process.env) {
  return String(env.CURSOR_AUTOMATION_SMOKE_MODE || '').trim() === '1';
}

/**
 * Resolve callback URL for outbound trigger (full string; never log in ops — use describeTriggerCallbackContractForOps).
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveCursorAutomationCallbackUrl(env = process.env) {
  const explicit = String(env.CURSOR_AUTOMATION_CALLBACK_URL || '').trim();
  if (explicit) return explicit;
  const publicBase = String(env.PUBLIC_BASE_URL || '').trim();
  const pathFrag = String(env.CURSOR_AUTOMATION_CALLBACK_PATH || '/webhooks/cursor').trim() || '/webhooks/cursor';
  if (!publicBase) return '';
  try {
    const base = publicBase.endsWith('/') ? publicBase.slice(0, -1) : publicBase;
    const path = pathFrag.startsWith('/') ? pathFrag : `/${pathFrag}`;
    return new URL(path, `${base}/`).href;
  } catch {
    return '';
  }
}

/**
 * Safe subset for ops: outbound callback contract shape (vNext.13.53). No raw URLs, no secret values.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function describeTriggerCallbackContractForOps(env = process.env) {
  const enabled = String(env.CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED || '').trim() === '1';
  const urlField = String(env.CURSOR_AUTOMATION_CALLBACK_URL_FIELD || 'callbackUrl').trim() || 'callbackUrl';
  const secretField = String(env.CURSOR_AUTOMATION_CALLBACK_SECRET_FIELD || 'webhookSecret').trim() || 'webhookSecret';
  const policyField =
    String(env.CURSOR_AUTOMATION_COMPLETION_POLICY_FIELD || 'execution_completion_policy').trim() ||
    'execution_completion_policy';
  const secondaryFxField =
    String(env.CURSOR_AUTOMATION_SECONDARY_EFFECTS_FIELD || 'side_effects_are_non_primary').trim() ||
    'side_effects_are_non_primary';

  const fullUrl = resolveCursorAutomationCallbackUrl(env);
  const webhookSecret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  const endpoint = String(env.CURSOR_AUTOMATION_ENDPOINT || '').trim();

  const callback_contract_present = enabled && Boolean(fullUrl && webhookSecret);

  let callback_url_path_only = null;
  if (fullUrl) {
    try {
      const u = new URL(fullUrl);
      callback_url_path_only = `${u.pathname}${u.search ? '?[redacted]' : ''}`.slice(0, 200);
    } catch {
      callback_url_path_only = '[unparseable]';
    }
  }

  let selected_trigger_endpoint_family = 'unknown';
  if (endpoint) {
    const h = (automationEndpointHostOnly(endpoint) || '').toLowerCase();
    if (h.includes('cursor')) selected_trigger_endpoint_family = 'cursor_automation_host';
    else if (h.includes('railway')) selected_trigger_endpoint_family = 'railway_custom';
    else selected_trigger_endpoint_family = 'http_json_post';
  }

  return {
    callback_contract_enabled_flag: enabled,
    callback_contract_present,
    callback_url_field_name: urlField,
    callback_secret_field_name: secretField,
    callback_hints_field_names: [policyField, secondaryFxField].filter(Boolean),
    callback_url_path_only,
    callback_secret_present: Boolean(webhookSecret),
    selected_trigger_endpoint_family,
    completion_policy_field: policyField,
    secondary_effects_field: secondaryFxField,
  };
}

/**
 * vNext.13.59a — Safe enum for ops: why outbound callback contract was or was not inserted.
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'enabled_and_inserted'|'disabled_by_env'|'callback_url_unavailable'|'callback_secret_unavailable'|'field_merge_skipped'}
 */
export function deriveOutboundCallbackContractReason(env = process.env) {
  const d = describeTriggerCallbackContractForOps(env);
  if (!d.callback_contract_enabled_flag) return 'disabled_by_env';
  if (d.callback_contract_present) return 'enabled_and_inserted';
  const fullUrl = resolveCursorAutomationCallbackUrl(env);
  const secret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  if (!fullUrl) return 'callback_url_unavailable';
  if (!secret) return 'callback_secret_unavailable';
  return 'field_merge_skipped';
}

/**
 * Truth plane: acceptance response included callback-contract-related top-level keys (not outbound/inbound).
 * @param {Record<string, unknown> | null | undefined} tr
 * @param {NodeJS.ProcessEnv} [env]
 */
export function acceptanceResponseHasCallbackMetadataKeys(tr, env = process.env) {
  const keys = Array.isArray(tr?.response_top_level_keys)
    ? tr.response_top_level_keys.map((k) => String(k))
    : [];
  if (!keys.length) return false;
  const lower = new Set(keys.map((k) => k.toLowerCase()));
  const d = describeTriggerCallbackContractForOps(env);
  const noteField =
    String(env.CURSOR_AUTOMATION_COMPLETION_POLICY_NOTE_FIELD || 'cos_completion_policy_note').trim() ||
    'cos_completion_policy_note';
  const candidates = [
    d.callback_url_field_name,
    d.callback_secret_field_name,
    d.completion_policy_field,
    d.secondary_effects_field,
    noteField,
    ...(Array.isArray(d.callback_hints_field_names) ? d.callback_hints_field_names : []),
  ].filter(Boolean);
  return candidates.some((c) => lower.has(String(c).toLowerCase()));
}

/**
 * @param {Record<string, unknown>} base
 * @param {NodeJS.ProcessEnv} [env]
 */
export function mergeCallbackContractIntoTriggerBody(base, env = process.env) {
  const d = describeTriggerCallbackContractForOps(env);
  const out = { ...base };
  if (!d.callback_contract_present) return out;
  const fullUrl = resolveCursorAutomationCallbackUrl(env);
  const secret = String(env.CURSOR_WEBHOOK_SECRET || '').trim();
  out[d.callback_url_field_name] = fullUrl;
  out[d.callback_secret_field_name] = secret;
  out[d.completion_policy_field] = 'cos_webhook_primary';
  out[d.secondary_effects_field] = true;
  const noteField =
    String(env.CURSOR_AUTOMATION_COMPLETION_POLICY_NOTE_FIELD || 'cos_completion_policy_note').trim() ||
    'cos_completion_policy_note';
  out[noteField] =
    'Primary completion is COS webhook delivery (or proof callback metadata unavailable). Git, branch, push, and PR are secondary side effects, not the primary completion signal.';
  return out;
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
      accepted_external_id: null,
      error_code: 'cursor_automation_not_configured',
      response_top_level_keys: null,
      selected_run_id_field_name: null,
      selected_accepted_id_field_name: null,
      selected_url_field_name: null,
      selected_status_field_name: null,
      has_run_id: false,
      has_accepted_external_id: false,
      has_status: false,
      has_url: false,
    };
  }

  const bodyObj = mergeCallbackContractIntoTriggerBody(
    {
      action: String(opts.action || ''),
      payload: opts.payload && typeof opts.payload === 'object' && !Array.isArray(opts.payload) ? opts.payload : {},
      request_id,
      source: 'g1_cos_slack',
    },
    env,
  );
  const body = JSON.stringify(bodyObj);

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
      accepted_external_id: extracted.accepted_external_id,
      automation_branch_raw,
      automation_status_raw,
      error_code: ok ? null : `cursor_automation_http_${res.status}`,
      response_top_level_keys:
        parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? Object.keys(parsed).slice(0, 60)
          : null,
      selected_run_id_field_name: extracted.selected_run_id_field_name,
      selected_accepted_id_field_name: extracted.selected_accepted_id_field_name,
      selected_url_field_name: extracted.selected_url_field_name,
      selected_status_field_name: extracted.selected_status_field_name,
      has_run_id: extracted.has_run_id,
      has_accepted_external_id: extracted.has_accepted_external_id,
      has_status: extracted.has_status,
      has_url: extracted.has_url,
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
      accepted_external_id: null,
      error_code: aborted ? 'cursor_automation_timeout' : 'cursor_automation_fetch_error',
      response_top_level_keys: null,
      selected_run_id_field_name: null,
      selected_accepted_id_field_name: null,
      selected_url_field_name: null,
      selected_status_field_name: null,
      has_run_id: false,
      has_accepted_external_id: false,
      has_status: false,
      has_url: false,
    };
  }
}
