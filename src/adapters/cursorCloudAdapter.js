/**
 * Cursor Cloud / automation launch — env-gated HTTP POST only.
 * Without COS_CURSOR_CLOUD_LAUNCH_URL the runtime stays on manual_bridge (handoff file).
 */

/**
 * @returns {{ liveRouteConfigured: boolean, launchUrl: string | null, missing: string[] }}
 */
export function diagnoseCursorCloudLaunch() {
  const url = String(process.env.COS_CURSOR_CLOUD_LAUNCH_URL || '').trim();
  const disabled = String(process.env.COS_CURSOR_CLOUD_DISABLE || '').trim() === '1';
  return {
    liveRouteConfigured: Boolean(url) && !disabled,
    launchUrl: url || null,
    missing: url ? [] : ['COS_CURSOR_CLOUD_LAUNCH_URL'],
  };
}

/**
 * @param {object} run — execution run
 * @param {Record<string, unknown>} metadata
 * @returns {Promise<{
 *   ok: boolean,
 *   mode: 'live'|'manual_bridge'|'error',
 *   run_ref?: string|null,
 *   conversation_url?: string|null,
 *   branch_name?: string|null,
 *   error_summary?: string,
 *   attemptedRemote?: boolean,
 * }>}
 */
export async function tryLaunchCursorRun(run, metadata = {}) {
  const diag = diagnoseCursorCloudLaunch();
  if (!diag.liveRouteConfigured) {
    return {
      ok: false,
      mode: 'manual_bridge',
      error_summary: 'cursor_cloud_launch_url_not_configured',
      attemptedRemote: false,
    };
  }

  const secret = String(process.env.COS_CURSOR_CLOUD_LAUNCH_SECRET || '').trim();
  const body = {
    kind: 'cos_cursor_cloud_launch',
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

    const run_ref = json.run_ref ?? json.run_id ?? json.id ?? null;
    const conversation_url = json.conversation_url ?? json.url ?? null;
    const branch_name = json.branch_name ?? json.branch ?? null;

    if (res.ok) {
      return {
        ok: true,
        mode: 'live',
        run_ref: run_ref || `cursor_launch_${res.status}`,
        conversation_url,
        branch_name,
        attemptedRemote: true,
      };
    }

    return {
      ok: false,
      mode: 'error',
      error_summary: String(json.error || json.message || text || `http_${res.status}`).slice(0, 400),
      run_ref,
      conversation_url,
      branch_name,
      attemptedRemote: true,
    };
  } catch (e) {
    return {
      ok: false,
      mode: 'error',
      error_summary: String(e?.message || e).slice(0, 400),
      attemptedRemote: true,
    };
  }
}
