/**
 * cos_run_events append + 조회 (Supabase | memory | file).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';
import { createCosRuntimeSupabase, supabaseAppendRunEvent } from './runStoreSupabase.js';
import { getActiveRunForThread, getCosRunStoreMode } from './executionRunStore.js';

/**
 * @param {Record<string, unknown>} row
 */
function eventRowFromPayload(eventType, payload, evidence) {
  const pl = payload && typeof payload === 'object' ? payload : {};
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  return {
    event_type: String(eventType || 'unknown'),
    payload: pl,
    created_at: new Date().toISOString(),
    matched_by: ev.matched_by != null && String(ev.matched_by).trim() ? String(ev.matched_by).trim() : null,
    canonical_status: ev.canonical_status != null && String(ev.canonical_status).trim() ? String(ev.canonical_status).trim() : null,
    payload_fingerprint_prefix:
      ev.payload_fingerprint_prefix != null && String(ev.payload_fingerprint_prefix).trim()
        ? String(ev.payload_fingerprint_prefix).trim().slice(0, 32)
        : null,
  };
}

/** @type {Map<string, { event_type: string, payload: Record<string, unknown>, created_at: string }[]>} */
const memByRun = new Map();

function eventsFilePath(runUuid) {
  return path.join(cosRuntimeBaseDir(), 'cos_run_events', `${runUuid}.jsonl`);
}

/**
 * @param {string} threadKey
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 * @returns {Promise<boolean>}
 */
export async function appendCosRunEvent(threadKey, eventType, payload) {
  const tk = String(threadKey || '').trim();
  if (!tk) return false;
  const run = await getActiveRunForThread(tk);
  const rid = run?.id != null ? String(run.id).trim() : '';
  if (!rid) return false;

  const pl = payload && typeof payload === 'object' ? payload : {};
  const mode = getCosRunStoreMode();
  const row = eventRowFromPayload(eventType, pl, {});

  if (mode === 'memory') {
    const arr = memByRun.get(rid) || [];
    arr.push(row);
    memByRun.set(rid, arr);
    return true;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return false;
    await supabaseAppendRunEvent(sb, rid, row.event_type, pl, {});
    return true;
  }

  const fp = eventsFilePath(rid);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, `${JSON.stringify(row)}\n`, 'utf8');
  return true;
}

/**
 * @param {string} runUuid
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 * @param {{ matched_by?: string | null, canonical_status?: string | null, payload_fingerprint_prefix?: string | null }} [evidence]
 * @returns {Promise<boolean>}
 */
export async function appendCosRunEventForRun(runUuid, eventType, payload, evidence) {
  const rid = String(runUuid || '').trim();
  if (!rid) return false;
  const mode = getCosRunStoreMode();
  const row = eventRowFromPayload(eventType, payload, evidence);

  if (mode === 'memory') {
    const arr = memByRun.get(rid) || [];
    arr.push(row);
    memByRun.set(rid, arr);
    return true;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return false;
    await supabaseAppendRunEvent(sb, rid, row.event_type, row.payload, evidence);
    return true;
  }

  const fp = eventsFilePath(rid);
  await fs.mkdir(path.dirname(fp), { recursive: true });
  await fs.appendFile(fp, `${JSON.stringify(row)}\n`, 'utf8');
  return true;
}

/**
 * @param {string} runUuid
 * @param {number} [limit]
 */
export async function listCosRunEventsForRun(runUuid, limit = 50) {
  const rid = String(runUuid || '').trim();
  if (!rid) return [];
  const mode = getCosRunStoreMode();
  if (mode === 'memory') {
    const arr = memByRun.get(rid) || [];
    return arr.slice(-limit);
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (!sb) return [];
    const { data, error } = await sb
      .from('cos_run_events')
      .select('event_type, payload, created_at, matched_by, canonical_status, payload_fingerprint_prefix')
      .eq('run_id', rid)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) return [];
    return (data || []).reverse();
  }
  try {
    const raw = await fs.readFile(eventsFilePath(rid), 'utf8');
    const lines = raw.split('\n').filter(Boolean);
    const rows = lines.map((l) => JSON.parse(l));
    return rows.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * @param {string} threadKey
 * @param {number} [limit]
 */
export async function listRecentCosRunEventsForThread(threadKey, limit = 30) {
  const run = await getActiveRunForThread(threadKey);
  if (!run?.id) return [];
  return listCosRunEventsForRun(String(run.id), limit);
}

/**
 * 슈퍼바이저/프로그레서가 외부 콜백 이벤트만 빠르게 볼 때 사용.
 * @param {string} threadKey
 * @param {number} [limit]
 */
export async function getLatestExternalRunEventsForThread(threadKey, limit = 20) {
  const rows = await listRecentCosRunEventsForThread(threadKey, limit);
  return rows.filter((e) => String(e.event_type || '').startsWith('external_'));
}

export function __resetCosRunEventsMemoryForTests() {
  memByRun.clear();
}
