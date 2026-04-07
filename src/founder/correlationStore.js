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
  const rec = {
    run_id,
    thread_key,
    packet_id: row.packet_id != null ? String(row.packet_id) : null,
    provider,
    object_type,
    object_id,
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

export function __resetCorrelationMemoryForTests() {
  memCorrelations.clear();
}
