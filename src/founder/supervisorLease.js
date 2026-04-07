/**
 * Durable supervisor lease (Supabase) with in-memory fallback when Supabase is not configured.
 */

import { createClient } from '@supabase/supabase-js';

const LEASE_NAME = 'run_supervisor';
const LEASE_MS = 25_000;

/** @type {{ owner_id: string, expires_at: string } | null} */
let memLease = null;

function supabaseClient() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * @param {string} ownerId
 * @returns {Promise<boolean>}
 */
export async function tryAcquireSupervisorLease(ownerId) {
  const owner = String(ownerId || '').trim() || 'unknown';
  const until = new Date(Date.now() + LEASE_MS).toISOString();

  const sb = supabaseClient();
  if (!sb) {
    const now = Date.now();
    if (memLease) {
      const exp = Date.parse(memLease.expires_at);
      if (Number.isFinite(exp) && exp > now && memLease.owner_id && memLease.owner_id !== owner) {
        return false;
      }
    }
    memLease = { owner_id: owner, expires_at: until };
    return true;
  }

  const { data: row, error: selErr } = await sb
    .from('cos_supervisor_leases')
    .select('owner_id, expires_at')
    .eq('lease_name', LEASE_NAME)
    .maybeSingle();

  if (selErr) {
    console.error('[supervisor_lease]', selErr.message);
    return false;
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
    console.error('[supervisor_lease]', upErr.message);
    return false;
  }

  return true;
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

export { LEASE_MS, LEASE_NAME };
