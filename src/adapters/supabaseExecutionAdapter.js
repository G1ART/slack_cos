/**
 * Supabase execution — staged dispatch contract (no production direct apply by default).
 */

export const SUPABASE_DISPATCH_CONTRACT_VERSION = '1';

/**
 * @returns {'dev'|'staging'|'unknown'}
 */
export function resolveSupabaseSafeTarget() {
  const raw = String(process.env.COS_SUPABASE_SAFE_TARGET || '').trim().toLowerCase();
  if (raw === 'staging' || raw === 'stage') return 'staging';
  if (raw === 'dev' || raw === 'development' || raw === 'local') return 'dev';
  return 'unknown';
}

/**
 * @param {object|null} space
 * @param {object|null} run
 * @returns {{
 *   live_dispatch_configured: boolean,
 *   dispatchUrl: string | null,
 *   project_linked: boolean,
 *   migration_stub_available: boolean,
 *   direct_apply_forbidden: boolean,
 *   safe_target: 'dev'|'staging'|'unknown',
 *   disabled: boolean,
 * }}
 */
export function diagnoseSupabaseExecutionContext(space = null, run = null) {
  const url = String(process.env.COS_SUPABASE_LIVE_DISPATCH_URL || '').trim();
  const disabled = String(process.env.COS_SUPABASE_LIVE_DISABLE || '').trim() === '1';
  const live_dispatch_configured = Boolean(url) && !disabled;
  const project_linked =
    space?.supabase_ready_status === 'configured'
    || Boolean(space?.supabase_project_ref)
    || Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const migration_stub_available = Boolean(run?.artifacts?.fullstack_swe?.supabase_migration_file_path);
  const direct_apply_forbidden = String(process.env.COS_SUPABASE_ALLOW_DIRECT_APPLY || '').trim() !== '1';
  const safe_target = resolveSupabaseSafeTarget();

  return {
    live_dispatch_configured,
    dispatchUrl: url || null,
    project_linked,
    migration_stub_available,
    direct_apply_forbidden,
    safe_target,
    disabled,
  };
}

/**
 * @returns {{ liveDispatchConfigured: boolean, dispatchUrl: string | null }}
 */
export function diagnoseSupabaseLiveExecution() {
  const ctx = diagnoseSupabaseExecutionContext(null, null);
  return {
    liveDispatchConfigured: ctx.live_dispatch_configured,
    dispatchUrl: ctx.dispatchUrl,
  };
}

/**
 * POST schema draft + migration pointers to operator-controlled staging bridge.
 * @param {object} run
 * @param {{ draft_path?: string|null, migration_path?: string|null, draft_payload?: object|null }} refs
 */
export async function trySupabaseLiveDispatch(run, refs = {}) {
  const ctx = diagnoseSupabaseExecutionContext(null, run);
  if (!ctx.live_dispatch_configured) {
    return {
      ok: false,
      mode: 'skipped',
      error_summary: 'supabase_live_dispatch_url_not_configured',
      attemptedRemote: false,
      safe_target: ctx.safe_target,
      dispatch_target: null,
    };
  }

  let dispatch_target = null;
  try {
    dispatch_target = new URL(ctx.dispatchUrl).host;
  } catch {
    dispatch_target = 'invalid_url';
  }

  const secret = String(process.env.COS_SUPABASE_LIVE_DISPATCH_SECRET || '').trim();
  const body = {
    kind: 'cos_supabase_staged_dispatch',
    source: 'cos_slack_bot',
    dispatch_contract_version: SUPABASE_DISPATCH_CONTRACT_VERSION,
    run_id: run.run_id,
    packet_id: run.packet_id,
    draft_path: refs.draft_path || null,
    migration_path: refs.migration_path || null,
    draft_kind: refs.draft_payload?.kind || null,
    project_goal: run.project_goal || null,
    safe_target: ctx.safe_target,
    direct_apply_forbidden: ctx.direct_apply_forbidden,
  };

  try {
    const headers = { 'Content-Type': 'application/json' };
    if (secret) headers.Authorization = `Bearer ${secret}`;

    const controller = typeof AbortSignal !== 'undefined' && AbortSignal.timeout
      ? AbortSignal.timeout(15000)
      : undefined;

    const res = await fetch(ctx.dispatchUrl, {
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
        dispatch_target,
        safe_target: ctx.safe_target,
        attemptedRemote: true,
      };
    }

    return {
      ok: false,
      mode: 'error',
      error_summary: String(json.error || json.message || text || `http_${res.status}`).slice(0, 400),
      dispatch_target,
      safe_target: ctx.safe_target,
      attemptedRemote: true,
    };
  } catch (e) {
    return {
      ok: false,
      mode: 'error',
      error_summary: String(e?.message || e).slice(0, 400),
      dispatch_target,
      safe_target: ctx.safe_target,
      attemptedRemote: true,
    };
  }
}
