/**
 * Durable supervisor lease (Supabase) with in-memory fallback when Supabase is not configured or fails.
 */

import { createCosRuntimeSupabase } from './runStoreSupabase.js';

const LEASE_NAME = 'run_supervisor';
const LEASE_MS = 25_000;

/** @type {{ owner_id: string, expires_at: string } | null} */
let memLease = null;

/** After first Supabase lease failure, stay on memory until process restart. */
let supabaseLeasePathBroken = false;

/** @type {string | null} */
let lastLeaseErrorKind = null;

/**
 * @param {string} host
 */
export function maskSupabaseHostForLogs(host) {
  const h = String(host || '').trim();
  if (!h || h.startsWith('(')) return h || null;
  const parts = h.split('.');
  if (parts.length >= 3 && parts.includes('supabase') && parts.includes('co')) {
    return `<ref>.${parts.slice(-3).join('.')}`;
  }
  if (parts.length >= 2) return `<ref>.${parts.slice(-2).join('.')}`;
  return '<host>';
}

/**
 * @param {string} msg
 */
function classifyLeaseConnectivity(msg) {
  const m = String(msg || '').toLowerCase();
  if (m.includes('enotfound') || m.includes('getaddrinfo') || m.includes('name not resolved')) return 'dns_resolution';
  if (m.includes('econnrefused') || m.includes('etimedout') || m.includes('fetch failed')) return 'network_transport';
  return 'postgrest_or_unknown';
}

export function getSupervisorLeaseLastErrorKind() {
  return lastLeaseErrorKind;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {'supabase' | 'degraded-memory' | 'disabled'}
 */
export function getSupervisorLeaseBootMode(env = process.env) {
  if (String(env.COS_RUN_SUPERVISOR_DISABLED || '').trim() === '1') return 'disabled';
  const url = String(env.SUPABASE_URL || '').trim();
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (url && key) return 'supabase';
  return 'degraded-memory';
}

/**
 * @returns {'supabase' | 'degraded-memory' | 'disabled'}
 */
export function getSupervisorLeaseRuntimeMode() {
  if (String(process.env.COS_RUN_SUPERVISOR_DISABLED || '').trim() === '1') return 'disabled';
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return 'degraded-memory';
  if (supabaseLeasePathBroken) return 'degraded-memory';
  return 'supabase';
}

/**
 * @param {NodeJS.ProcessEnv} env
 */
function supabaseTargetHost(env) {
  const url = String(env.SUPABASE_URL || '').trim();
  try {
    return new URL(url).host || '(empty_host)';
  } catch {
    return '(malformed_url)';
  }
}

/**
 * @param {unknown} err
 */
function pickErrorShape(err) {
  if (err instanceof Error) {
    const cause =
      err.cause instanceof Error
        ? { name: err.cause.name, message: err.cause.message }
        : err.cause != null
          ? { message: String(err.cause) }
          : undefined;
    return {
      error_name: err.name,
      error_message: err.message.slice(0, 500),
      short_cause: cause,
    };
  }
  if (err && typeof err === 'object') {
    const e = /** @type {Record<string, unknown>} */ (err);
    const det = e.details != null ? String(e.details) : null;
    return {
      error_name: 'PostgrestError',
      error_message: String(e.message ?? err).slice(0, 500),
      short_cause: {
        code: e.code != null ? String(e.code) : null,
        hint: e.hint != null ? String(e.hint) : null,
        details: det ? det.slice(0, 400) : null,
      },
    };
  }
  return { error_name: 'unknown', error_message: String(err), short_cause: undefined };
}

/**
 * @param {Record<string, unknown>} base
 */
function logLease(base) {
  console.info(JSON.stringify({ event: 'cos_supervisor_lease', ...base }));
}

/**
 * @param {string} owner
 * @param {string} untilIso
 */
function acquireMemoryLease(owner, untilIso) {
  const now = Date.now();
  if (memLease) {
    const exp = Date.parse(memLease.expires_at);
    if (Number.isFinite(exp) && exp > now && memLease.owner_id && memLease.owner_id !== owner) {
      return false;
    }
  }
  memLease = { owner_id: owner, expires_at: untilIso };
  return true;
}

/**
 * @param {string} ownerId
 * @returns {Promise<boolean>}
 */
export async function tryAcquireSupervisorLease(ownerId) {
  const owner = String(ownerId || '').trim() || 'unknown';
  const until = new Date(Date.now() + LEASE_MS).toISOString();
  const env = process.env;

  const sb = createCosRuntimeSupabase();
  const bootMode = getSupervisorLeaseBootMode(env);
  const host = supabaseTargetHost(env);

  if (!sb || supabaseLeasePathBroken) {
    if (!sb && bootMode === 'supabase') {
      logLease({
        outcome: 'client_unavailable',
        mode: 'degraded-memory',
        target_url_host: host,
        response_status: null,
        error_name: null,
        error_message: 'createCosRuntimeSupabase returned null',
        short_cause: { code: 'supabase_client_null' },
      });
    }
    return acquireMemoryLease(owner, until);
  }

  try {
    const { data: row, error: selErr } = await sb
      .from('cos_supervisor_leases')
      .select('owner_id, expires_at')
      .eq('lease_name', LEASE_NAME)
      .maybeSingle();

    if (selErr) {
      const shape = pickErrorShape(selErr);
      const se = /** @type {any} */ (selErr);
      lastLeaseErrorKind = classifyLeaseConnectivity(shape.error_message);
      logLease({
        outcome: 'select_error',
        mode: 'supabase',
        target_url_host: host,
        target_url_host_masked: maskSupabaseHostForLogs(host),
        response_status: se.status != null ? Number(se.status) : null,
        ...shape,
      });
      supabaseLeasePathBroken = true;
      console.info(
        JSON.stringify({
          event: 'cos_supervisor_lease_degraded_fallback',
          reason: 'supabase_select_failed',
          target_url_host_masked: maskSupabaseHostForLogs(host),
          supervisor_lease_last_error_kind: lastLeaseErrorKind,
        }),
      );
      return acquireMemoryLease(owner, until);
    }

    const nowIso = new Date().toISOString();
    if (row && row.expires_at && row.owner_id) {
      if (row.expires_at > nowIso && row.owner_id !== owner) return false;
    }

    const { error: upErr } = await sb.from('cos_supervisor_leases').upsert(
      {
        lease_name: LEASE_NAME,
        owner_id: owner,
        expires_at: until,
        updated_at: nowIso,
      },
      { onConflict: 'lease_name' },
    );

    if (upErr) {
      const shape = pickErrorShape(upErr);
      const ue = /** @type {any} */ (upErr);
      lastLeaseErrorKind = classifyLeaseConnectivity(shape.error_message);
      logLease({
        outcome: 'upsert_error',
        mode: 'supabase',
        target_url_host: host,
        target_url_host_masked: maskSupabaseHostForLogs(host),
        response_status: ue.status != null ? Number(ue.status) : null,
        ...shape,
      });
      supabaseLeasePathBroken = true;
      console.info(
        JSON.stringify({
          event: 'cos_supervisor_lease_degraded_fallback',
          reason: 'supabase_upsert_failed',
          target_url_host_masked: maskSupabaseHostForLogs(host),
          supervisor_lease_last_error_kind: lastLeaseErrorKind,
        }),
      );
      return acquireMemoryLease(owner, until);
    }

    return true;
  } catch (e) {
    const shape = pickErrorShape(e);
    lastLeaseErrorKind = classifyLeaseConnectivity(shape.error_message);
    logLease({
      outcome: 'thrown',
      mode: 'supabase',
      target_url_host: host,
      target_url_host_masked: maskSupabaseHostForLogs(host),
      response_status: null,
      ...shape,
    });
    supabaseLeasePathBroken = true;
    console.info(
      JSON.stringify({
        event: 'cos_supervisor_lease_degraded_fallback',
        reason: 'supabase_lease_exception',
        target_url_host_masked: maskSupabaseHostForLogs(host),
        error_name: shape.error_name,
        supervisor_lease_last_error_kind: lastLeaseErrorKind,
      }),
    );
    return acquireMemoryLease(owner, until);
  }
}

/** @returns {{ owner_id: string, expires_at: string } | null} */
export function __supervisorLeaseMemoryPeek() {
  return memLease ? { ...memLease } : null;
}

export function __forceSupervisorLeaseMemoryExpiry() {
  if (memLease) memLease.expires_at = new Date(0).toISOString();
}

export function __resetSupervisorLeaseMemory() {
  memLease = null;
}

export function __resetSupervisorLeaseDegradedStateForTests() {
  supabaseLeasePathBroken = false;
  lastLeaseErrorKind = null;
}

export { LEASE_MS, LEASE_NAME };
