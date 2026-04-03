/**
 * Cursor Cloud launch — COS native launch contract over HTTP POST.
 * Endpoint is still operator-controlled (webhook/automation); payload/response semantics are Cursor-native shaped.
 */

/** COS ↔ automation contract version (bump when envelope fields change). */
export const CURSOR_LAUNCH_CONTRACT_VERSION = '1';

/**
 * @returns {{
 *   launchUrlConfigured: boolean,
 *   authConfigured: boolean,
 *   disabled: boolean,
 *   launchUrl: string | null,
 *   missing: string[],
 *   expectedResponseKeys: string[],
 *   readiness: 'ready'|'disabled'|'missing_url',
 * }}
 */
export function diagnoseCursorCloudLaunch() {
  const url = String(process.env.COS_CURSOR_CLOUD_LAUNCH_URL || '').trim();
  const disabled = String(process.env.COS_CURSOR_CLOUD_DISABLE || '').trim() === '1';
  const secret = String(process.env.COS_CURSOR_CLOUD_LAUNCH_SECRET || '').trim();
  const launchUrlConfigured = Boolean(url) && !disabled;
  return {
    launchUrlConfigured,
    authConfigured: Boolean(secret),
    disabled,
    launchUrl: url || null,
    missing: launchUrlConfigured ? [] : ['COS_CURSOR_CLOUD_LAUNCH_URL'],
    expectedResponseKeys: ['run_ref', 'conversation_url', 'branch_name'],
    readiness: disabled ? 'disabled' : launchUrlConfigured ? 'ready' : 'missing_url',
  };
}

function normalizeCursorLaunchResponse(json, httpOk) {
  const run_ref = json.run_ref ?? json.run_id ?? json.id ?? null;
  const conversation_url = json.conversation_url ?? json.url ?? null;
  const branch_name = json.branch_name ?? json.branch ?? null;
  const shapeOk = Boolean(run_ref || conversation_url);
  return {
    run_ref,
    conversation_url,
    branch_name,
    response_shape_ok: shapeOk,
    response_incomplete: httpOk && !shapeOk,
  };
}

/**
 * @param {object} run — execution run
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{
 *   ok: boolean,
 *   mode: 'live'|'manual_bridge'|'error',
 *   source: 'cursor_cloud',
 *   launch_contract_version: string,
 *   run_ref?: string|null,
 *   conversation_url?: string|null,
 *   branch_name?: string|null,
 *   error_summary?: string,
 *   attemptedRemote?: boolean,
 *   fallback_reason?: string|null,
 *   response_shape_ok?: boolean,
 *   response_incomplete?: boolean,
 * }>}
 */
export async function tryLaunchCursorRun(run, metadata = {}) {
  const diag = diagnoseCursorCloudLaunch();
  if (!diag.launchUrlConfigured) {
    return {
      ok: false,
      mode: 'manual_bridge',
      source: 'cursor_cloud',
      launch_contract_version: CURSOR_LAUNCH_CONTRACT_VERSION,
      error_summary: 'cursor_cloud_launch_url_not_configured',
      attemptedRemote: false,
      fallback_reason: 'launch_url_not_configured',
    };
  }

  const secret = String(process.env.COS_CURSOR_CLOUD_LAUNCH_SECRET || '').trim();
  const body = {
    kind: 'cos_cursor_cloud_launch',
    source: 'cos_slack_bot',
    launch_contract_version: CURSOR_LAUNCH_CONTRACT_VERSION,
    run_id: run.run_id,
    packet_id: run.packet_id,
    project_goal: run.project_goal,
    locked_mvp_summary: run.locked_mvp_summary,
    originating_task_kind: run.originating_task_kind || null,
    originating_playbook_id: run.originating_playbook_id || null,
    channel: metadata.channel || null,
    thread_ts: metadata.thread_ts || null,
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const controller = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(12000)
      : undefined;

    const res = await fetch(diag.launchUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      ...(controller ? { signal: controller } : {}),
    });

    const text = await res.text();
    let json = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }

    const norm = normalizeCursorLaunchResponse(json, res.ok);

    if (res.ok) {
      const runRef = norm.run_ref || `cursor_launch_${res.status}`;
      return {
        ok: true,
        mode: 'live',
        source: 'cursor_cloud',
        launch_contract_version: CURSOR_LAUNCH_CONTRACT_VERSION,
        run_ref: runRef,
        conversation_url: norm.conversation_url,
        branch_name: norm.branch_name,
        attemptedRemote: true,
        fallback_reason: null,
        response_shape_ok: norm.response_shape_ok,
        response_incomplete: norm.response_incomplete,
      };
    }

    return {
      ok: false,
      mode: 'error',
      source: 'cursor_cloud',
      launch_contract_version: CURSOR_LAUNCH_CONTRACT_VERSION,
      error_summary: String(json.error || json.message || text || `http_${res.status}`).slice(0, 400),
      run_ref: norm.run_ref,
      conversation_url: norm.conversation_url,
      branch_name: norm.branch_name,
      attemptedRemote: true,
      fallback_reason: 'http_error',
      response_shape_ok: norm.response_shape_ok,
    };
  } catch (e) {
    return {
      ok: false,
      mode: 'error',
      source: 'cursor_cloud',
      launch_contract_version: CURSOR_LAUNCH_CONTRACT_VERSION,
      error_summary: String(e?.message || e).slice(0, 400),
      attemptedRemote: true,
      fallback_reason: 'network_or_abort',
    };
  }
}
