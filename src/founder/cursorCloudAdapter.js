/**
 * Cursor Automation — HTTP trigger (Railway: endpoint + auth header).
 * Auth 값·전체 URL은 founder-facing/로그에 노출하지 않는다.
 */

import crypto from 'node:crypto';
import { deriveAutomationResponseWinningSource } from './cursorEnvParsingTruth.js';
import { computeEmitPatchPayloadPathFingerprint } from './cursorCallbackGate.js';
import { buildEmitPatchCompletionContractBlock, EMIT_PATCH_COMPLETION_CONTRACT_KEY } from './cursorCompletionContract.js';

/** @type {{ fn: typeof fetch | null }} */
export const __cursorAutomationFetchForTests = { fn: null };


/**
 * Outbound automation request_id — must match trigger body before POST (v13.75 dispatch ledger bind).
 * @param {string | null | undefined} invocationId
 */
export function resolveCursorAutomationRequestId(invocationId) {
  const s = String(invocationId || '').trim();
  if (s) return s;
  return `ca_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

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

/** Provider-side run/composer hints only — never promoted to COS accepted_external_id (v13.74). */
const PROVIDER_RUN_HINT_KEYS = ['backgroundComposerId', 'composerId', 'background_composer_id'];

/**
 * @param {Record<string, unknown> | null | undefined} parsed
 */
export function extractProviderRunHintFromParsed(parsed) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
  for (const k of PROVIDER_RUN_HINT_KEYS) {
    if (!Object.prototype.hasOwnProperty.call(parsed, k)) continue;
    const v = /** @type {Record<string, unknown>} */ (parsed)[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return null;
}

/**
 * @param {Record<string, unknown> | null} parsed
 * @param {NodeJS.ProcessEnv} env
 * @param {{ localTriggerRequestId?: string | null }} [opts] v13.74 — invoice id = outbound request_id only when set
 */
export function extractAutomationResponseFields(parsed, env, opts = {}) {
  const absentBase = {
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
    run_id_source: /** @type {const} */ ('absent'),
    accepted_external_id_source: /** @type {const} */ ('absent'),
    status_source: /** @type {const} */ ('absent'),
    url_source: /** @type {const} */ ('absent'),
    branch_source: /** @type {const} */ ('absent'),
    automation_response_env_absent_notes: /** @type {string[]} */ ([]),
    provider_run_hint: /** @type {string | null} */ (null),
  };
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return absentBase;
  }

  const provider_run_hint = extractProviderRunHintFromParsed(parsed);
  const localInvoice = String(opts.localTriggerRequestId || '').trim();

  const runIdPath = String(env.CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH || '').trim();
  const acceptedIdPath = String(env.CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH || '').trim();
  const urlPath = String(env.CURSOR_AUTOMATION_RESPONSE_URL_PATH || '').trim();
  const statusPath = String(env.CURSOR_AUTOMATION_RESPONSE_STATUS_PATH || '').trim();
  const branchPath = String(env.CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH || '').trim();

  /** @type {string | null} */
  let selected_run_id_field_name = null;
  let external_run_id = '';
  let runWonOverride = false;
  if (runIdPath) {
    const v = getByDotPath(parsed, runIdPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        external_run_id = s;
        selected_run_id_field_name = runIdPath;
        runWonOverride = true;
      }
    }
  }
  let runWonHeuristic = false;
  if (!external_run_id) {
    for (const p of DEFAULT_RUN_ID_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        external_run_id = s;
        selected_run_id_field_name = p;
        runWonHeuristic = true;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_url_field_name = null;
  let external_url = '';
  let urlWonOverride = false;
  if (urlPath) {
    const v = getByDotPath(parsed, urlPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        external_url = s;
        selected_url_field_name = urlPath;
        urlWonOverride = true;
      }
    }
  }
  let urlWonHeuristic = false;
  if (!external_url) {
    for (const p of DEFAULT_URL_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        external_url = s;
        selected_url_field_name = p;
        urlWonHeuristic = true;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_status_field_name = null;
  let automation_status_raw = null;
  let statusWonOverride = false;
  if (statusPath) {
    const v = getByDotPath(parsed, statusPath);
    if (v != null) {
      const s = String(v).trim();
      automation_status_raw = s || null;
      selected_status_field_name = s ? statusPath : null;
      if (s) statusWonOverride = true;
    }
  }
  let statusWonHeuristic = false;
  if (automation_status_raw == null) {
    for (const p of DEFAULT_STATUS_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        automation_status_raw = s;
        selected_status_field_name = p;
        statusWonHeuristic = true;
        break;
      }
    }
  }

  /** @type {string | null} */
  let automation_branch_raw = null;
  let branchWonOverride = false;
  if (branchPath) {
    const v = getByDotPath(parsed, branchPath);
    automation_branch_raw = v != null ? String(v).trim() || null : null;
    if (automation_branch_raw) branchWonOverride = true;
  }
  let branchWonHeuristic = false;
  if (automation_branch_raw == null) {
    for (const p of DEFAULT_BRANCH_DOT_PATHS) {
      const v = getByDotPath(parsed, p);
      if (v == null) continue;
      const s = String(v).trim();
      if (s) {
        automation_branch_raw = s;
        branchWonHeuristic = true;
        break;
      }
    }
  }

  /** @type {string | null} */
  let selected_accepted_id_field_name = null;
  let accepted_external_id = '';
  let accWonOverride = false;
  let accWonHeuristic = false;
  if (localInvoice) {
    accepted_external_id = localInvoice;
    selected_accepted_id_field_name = 'local_trigger_request_id';
    accWonOverride = true;
  } else if (acceptedIdPath) {
    const v = getByDotPath(parsed, acceptedIdPath);
    if (v != null) {
      const s = String(v).trim();
      if (s) {
        accepted_external_id = s;
        selected_accepted_id_field_name = acceptedIdPath;
        accWonOverride = true;
      }
    }
  }

  const has_run_id = !!external_run_id;
  const has_url = !!external_url;
  const has_status = automation_status_raw != null && String(automation_status_raw).trim() !== '';
  const has_accepted_external_id = !!accepted_external_id;
  const has_branch = automation_branch_raw != null && String(automation_branch_raw).trim() !== '';

  const run_id_source = deriveAutomationResponseWinningSource(runWonOverride, has_run_id, runWonHeuristic);
  const url_source = deriveAutomationResponseWinningSource(urlWonOverride, has_url, urlWonHeuristic);
  const status_source = deriveAutomationResponseWinningSource(statusWonOverride, has_status, statusWonHeuristic);
  const branch_source = deriveAutomationResponseWinningSource(branchWonOverride, has_branch, branchWonHeuristic);
  const accepted_external_id_source = deriveAutomationResponseWinningSource(
    accWonOverride,
    has_accepted_external_id,
    accWonHeuristic,
  );

  /** @type {string[]} */
  const automation_response_env_absent_notes = [];
  if (!runIdPath && !has_run_id) automation_response_env_absent_notes.push('run_id:CURSOR_AUTOMATION_RESPONSE_RUN_ID_PATH_unset_and_absent');
  if (!statusPath && !has_status) automation_response_env_absent_notes.push('status:CURSOR_AUTOMATION_RESPONSE_STATUS_PATH_unset_and_absent');
  if (!urlPath && !has_url) automation_response_env_absent_notes.push('url:CURSOR_AUTOMATION_RESPONSE_URL_PATH_unset_and_absent');
  if (!branchPath && !has_branch) automation_response_env_absent_notes.push('branch:CURSOR_AUTOMATION_RESPONSE_BRANCH_PATH_unset_and_absent');
  if (!localInvoice && !acceptedIdPath && !has_accepted_external_id) {
    automation_response_env_absent_notes.push('accepted_id:CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH_unset_and_absent');
  }

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
    run_id_source,
    accepted_external_id_source,
    status_source,
    url_source,
    branch_source,
    automation_response_env_absent_notes,
    provider_run_hint,
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
/**
 * Downstream truth for emit_patch Cursor automation acceptance (no extra logging).
 * @param {Record<string, unknown> | null | undefined} tr triggerCursorAutomation result
 * @param {Record<string, unknown>} payload outbound payload (pre-trigger)
 * @param {NodeJS.ProcessEnv} [env]
 */
export function computeEmitPatchCursorAutomationTruth(tr, payload, env = process.env) {
  const d = describeTriggerCallbackContractForOps(env);
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const fp = computeEmitPatchPayloadPathFingerprint(pl);
  const row = tr && typeof tr === 'object' ? tr : {};
  const echo = acceptanceResponseHasCallbackMetadataKeys(row, env);
  return {
    callback_contract_enabled_flag: d.callback_contract_enabled_flag,
    callback_contract_present: d.callback_contract_present,
    callback_metadata_echoed_on_acceptance: echo,
    request_id_present: Boolean(String(row.request_id || '').trim()),
    accepted_external_id_present: Boolean(String(row.accepted_external_id || '').trim()),
    external_run_id_present: Boolean(String(row.external_run_id || '').trim()),
    emit_patch_path_fingerprint_derivable: Boolean(fp),
    accepted_without_callback_contract_echo:
      row.ok === true && d.callback_contract_present === true && !echo,
  };
}

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
 *   completionContext?: { thread_key?: string | null, packet_id?: string | null },
 * }} opts
 */
export async function triggerCursorAutomation(opts) {
  const env = opts.env || process.env;
  const endpoint = String(env.CURSOR_AUTOMATION_ENDPOINT || '').trim();
  const authRaw = String(env.CURSOR_AUTOMATION_AUTH_HEADER || '').trim();
  const timeoutMs = Number(opts.timeoutMs ?? env.CURSOR_CLOUD_TIMEOUT_MS ?? 60_000) || 60_000;
  const request_id = resolveCursorAutomationRequestId(opts.invocation_id);

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
      run_id_source: 'absent',
      accepted_external_id_source: 'absent',
      status_source: 'absent',
      url_source: 'absent',
      branch_source: 'absent',
      automation_response_env_absent_notes: [],
      provider_run_hint: null,
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
  const act = String(opts.action || '').trim();
  if (act === 'emit_patch') {
    const d = describeTriggerCallbackContractForOps(env);
    const fullUrl = resolveCursorAutomationCallbackUrl(env);
    const pl =
      bodyObj.payload && typeof bodyObj.payload === 'object' && !Array.isArray(bodyObj.payload)
        ? /** @type {Record<string, unknown>} */ (bodyObj.payload)
        : {};
    const block = buildEmitPatchCompletionContractBlock({
      callbackDescribe: d,
      fullCallbackUrl: fullUrl,
      requestId: request_id,
      payload: pl,
      completionContext: opts.completionContext,
    });
    if (block) bodyObj[EMIT_PATCH_COMPLETION_CONTRACT_KEY] = block;
  }
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
    const ok = res.ok;
    const extracted = extractAutomationResponseFields(parsed, env, ok ? { localTriggerRequestId: request_id } : {});
    const external_run_id = extracted.external_run_id;
    const external_url = extracted.external_url;
    const automation_branch_raw = extracted.automation_branch_raw;
    const automation_status_raw = extracted.automation_status_raw;
    return {
      ok,
      trigger_status: ok ? 'accepted' : `http_${res.status}`,
      status: res.status,
      trigger_response_preview: preview || null,
      request_id,
      external_run_id,
      external_url,
      accepted_external_id: extracted.accepted_external_id,
      provider_run_hint: extracted.provider_run_hint,
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
      run_id_source: extracted.run_id_source,
      accepted_external_id_source: extracted.accepted_external_id_source,
      status_source: extracted.status_source,
      url_source: extracted.url_source,
      branch_source: extracted.branch_source,
      automation_response_env_absent_notes: extracted.automation_response_env_absent_notes,
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
      provider_run_hint: null,
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
      run_id_source: 'absent',
      accepted_external_id_source: 'absent',
      status_source: 'absent',
      url_source: 'absent',
      branch_source: 'absent',
      automation_response_env_absent_notes: [],
    };
  }
}
