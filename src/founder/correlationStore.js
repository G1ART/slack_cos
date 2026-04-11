/**
 * external object ↔ cos run correlation (Supabase | memory | file).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';
import { createCosRuntimeSupabase } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';

/** @type {Map<string, Record<string, unknown>>} */
const memCorrelations = new Map();

function compositeKey(provider, objectType, objectId) {
  return `${String(provider)}|${String(objectType)}|${String(objectId)}`;
}

function correlationsFilePath() {
  return path.join(cosRuntimeBaseDir(), 'external_correlations.json');
}

async function readFileCorrelations() {
  try {
    const raw = await fs.readFile(correlationsFilePath(), 'utf8');
    const j = JSON.parse(raw);
    return Array.isArray(j) ? j : [];
  } catch {
    return [];
  }
}

async function writeFileCorrelations(rows) {
  const fp = correlationsFilePath();
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.writeFile(fp, JSON.stringify(rows, null, 2), 'utf8');
}

/**
 * @param {{
 *   run_id: string,
 *   thread_key: string,
 *   packet_id?: string | null,
 *   provider: string,
 *   object_type: string,
 *   object_id: string,
 * }} row
 */
export async function upsertExternalCorrelation(row) {
  const run_id = String(row.run_id || '');
  const thread_key = String(row.thread_key || '');
  const provider = String(row.provider || '');
  const object_type = String(row.object_type || '');
  const object_id = String(row.object_id || '');
  if (!run_id || !thread_key || !provider || !object_type || !object_id) return false;

  const mode = getCosRunStoreMode();
  const nowIso = new Date().toISOString();
  const rec = {
    run_id,
    thread_key,
    packet_id: row.packet_id != null ? String(row.packet_id) : null,
    provider,
    object_type,
    object_id,
    last_seen_at: nowIso,
  };

  if (mode === 'memory') {
    memCorrelations.set(compositeKey(provider, object_type, object_id), rec);
    return true;
  }

  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return false;
    const { error } = await sb.from('cos_external_correlations').upsert(
      {
        run_id,
        thread_key,
        packet_id: rec.packet_id,
        provider,
        object_type,
        object_id,
        last_seen_at: nowIso,
      },
      { onConflict: 'provider,object_type,object_id' },
    );
    if (error) {
      console.error('[cos_external_correlations]', error.message);
      return false;
    }
    return true;
  }

  const list = await readFileCorrelations();
  const k = compositeKey(provider, object_type, object_id);
  const next = list.filter((r) => compositeKey(r.provider, r.object_type, r.object_id) !== k);
  next.push(rec);
  await writeFileCorrelations(next);
  return true;
}

/**
 * @param {string} provider
 * @param {string} objectType
 * @param {string} objectId
 */
export async function findExternalCorrelation(provider, objectType, objectId) {
  const p = String(provider || '');
  const ot = String(objectType || '');
  const oid = String(objectId || '');
  if (!p || !ot || !oid) return null;

  const mode = getCosRunStoreMode();
  if (mode === 'memory') {
    return memCorrelations.get(compositeKey(p, ot, oid)) || null;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return null;
    const { data, error } = await sb
      .from('cos_external_correlations')
      .select('*')
      .eq('provider', p)
      .eq('object_type', ot)
      .eq('object_id', oid)
      .maybeSingle();
    if (error) {
      console.error('[cos_external_correlations]', error.message);
      return null;
    }
    return data || null;
  }

  const list = await readFileCorrelations();
  const hit = list.find((r) => r.provider === p && r.object_type === ot && r.object_id === oid);
  return hit || null;
}

/**
 * Cursor authoritative correlation (v13.74): external_run_id → accepted_external_id →
 * run_uuid+packet → thread_key+packet. Path-fp is evidence-only (see findExternalCorrelationCursorPathFingerprintEvidence).
 *
 * @param {{
 *   external_run_id?: string | null,
 *   run_id?: string | null,
 *   packet_id?: string | null,
 *   thread_key?: string | null,
 *   accepted_external_id?: string | null,
 *   callback_request_id?: string | null,
 *   callback_path_fingerprint?: string | null,
 * }} hints
 * @returns {Promise<{ corr: Record<string, unknown> | null, matched_by: string }>}
 */
export async function findExternalCorrelationCursorHintsWithMeta(hints) {
  const ext = String(hints.external_run_id || '').trim();
  if (ext) {
    const hit = await findExternalCorrelation('cursor', 'cloud_agent_run', ext);
    if (hit) return { corr: hit, matched_by: 'external_run_id' };
  }

  const acc = String(hints.accepted_external_id || '').trim();
  if (acc) {
    const hit = await findExternalCorrelation('cursor', 'accepted_external_id', acc);
    if (hit) return { corr: hit, matched_by: 'accepted_external_id' };
  }

  const rid = String(hints.run_id || '').trim();
  const pid = String(hints.packet_id || '').trim();
  const tk = String(hints.thread_key || '').trim();

  const mode = getCosRunStoreMode();
  if (mode === 'memory') {
    for (const rec of memCorrelations.values()) {
      if (String(rec.provider || '') !== 'cursor') continue;
      if (rid && String(rec.run_id || '') === rid && (!pid || String(rec.packet_id || '') === pid)) {
        return { corr: rec, matched_by: 'run_uuid_packet' };
      }
      if (tk && String(rec.thread_key || '') === tk && pid && String(rec.packet_id || '') === pid) {
        return { corr: rec, matched_by: 'thread_key_packet_id' };
      }
    }
    return { corr: null, matched_by: 'none' };
  }

  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return { corr: null, matched_by: 'none' };
    if (rid) {
      let q = sb.from('cos_external_correlations').select('*').eq('provider', 'cursor').eq('run_id', rid);
      if (pid) q = q.eq('packet_id', pid);
      const { data, error } = await q.limit(1);
      if (!error && Array.isArray(data) && data[0]) return { corr: data[0], matched_by: 'run_uuid_packet' };
    }
    if (tk && pid) {
      const { data, error } = await sb
        .from('cos_external_correlations')
        .select('*')
        .eq('provider', 'cursor')
        .eq('thread_key', tk)
        .eq('packet_id', pid)
        .limit(1);
      if (!error && Array.isArray(data) && data[0]) return { corr: data[0], matched_by: 'thread_key_packet_id' };
    }
    return { corr: null, matched_by: 'none' };
  }

  const list = await readFileCorrelations();
  for (const rec of list) {
    if (String(rec.provider) !== 'cursor') continue;
    if (rid && String(rec.run_id) === rid && (!pid || String(rec.packet_id || '') === pid)) {
      return { corr: rec, matched_by: 'run_uuid_packet' };
    }
    if (tk && String(rec.thread_key) === tk && pid && String(rec.packet_id) === pid) {
      return { corr: rec, matched_by: 'thread_key_packet_id' };
    }
  }
  return { corr: null, matched_by: 'none' };
}

/**
 * Path fingerprint correlation only — not eligible for packet progression (v13.74).
 * @param {{ callback_request_id?: string | null, callback_path_fingerprint?: string | null }} hints
 * @returns {Promise<{ corr: Record<string, unknown> | null, matched_by: string }>}
 */
export async function findExternalCorrelationCursorPathFingerprintEvidence(hints) {
  const req = String(hints.callback_request_id || '').trim();
  const fp = String(hints.callback_path_fingerprint || '').trim();
  if (!req || !fp) return { corr: null, matched_by: 'none' };
  const composite = `${req}|${fp}`;
  const hit = await findExternalCorrelation('cursor', 'automation_request_path_fp', composite);
  return hit ? { corr: hit, matched_by: 'automation_request_path_fp' } : { corr: null, matched_by: 'none' };
}

/**
 * @param {{
 *   external_run_id?: string | null,
 *   run_id?: string | null,
 *   packet_id?: string | null,
 *   thread_key?: string | null,
 *   accepted_external_id?: string | null,
 *   callback_request_id?: string | null,
 *   callback_path_fingerprint?: string | null,
 * }} hints
 */
export async function findExternalCorrelationCursorHints(hints) {
  const { corr } = await findExternalCorrelationCursorHintsWithMeta(hints);
  return corr;
}

export function __resetCorrelationMemoryForTests() {
  memCorrelations.clear();
}
