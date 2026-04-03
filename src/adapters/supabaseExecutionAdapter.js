/**
 * Supabase execution capability — distinguishes draft/migration stubs vs env-gated live dispatch webhook.
 * Production-destructive SQL push is never enabled by default.
 */

/**
 * @returns {{ liveDispatchConfigured: boolean, dispatchUrl: string | null }}
 */
export function diagnoseSupabaseLiveExecution() {
  const url = String(process.env.COS_SUPABASE_LIVE_DISPATCH_URL || '').trim();
  const disabled = String(process.env.COS_SUPABASE_LIVE_DISABLE || '').trim() === '1';
  return {
    liveDispatchConfigured: Boolean(url) && !disabled,
    dispatchUrl: url || null,
  };
}

/**
 * POST draft/migration pointers to an operator-controlled endpoint (staging bridge, CI, etc.).
 * @param {object} run
 * @param {{ draft_path?: string|null, migration_path?: string|null, draft_payload?: object|null }} refs
 */
export async function trySupabaseLiveDispatch(run, refs = {}) {
  const diag = diagnoseSupabaseLiveExecution();
  if (!diag.liveDispatchConfigured) {
    return {
      ok: false,
      mode: 'skipped',
      error_summary: 'supabase_live_dispatch_url_not_configured',
      attemptedRemote: false,
    };
  }

  const secret = String(process.env.COS_SUPABASE_LIVE_DISPATCH_SECRET || '').trim();
  const body = {
    kind: 'cos_supabase_live_dispatch',
    run_id: run.run_id,
    packet_id: run.packet_id,
    draft_path: refs.draft_path || null,
    migration_path: refs.migration_path || null,
    draft_kind: refs.draft_payload?.kind || null,
    project_goal: run.project_goal || null,
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const controller = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(15000)
      : undefined;

    const res = await fetch(diag.dispatchUrl, {
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

    if (res.ok) {
      return {
        ok: true,
        mode: 'live',
        apply_ref: json.apply_ref ?? json.ref ?? json.job_id ?? `dispatch_${res.status}`,
        attemptedRemote: true,
      };
    }

    return {
      ok: false,
      mode: 'error',
      error_summary: String(json.error || json.message || text || `http_${res.status}`).slice(0, 400),
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
