/**
 * cos_run_events append + 조회 (Supabase | memory | file).
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { cosRuntimeBaseDir } from './executionLedger.js';
import {
  createCosRuntimeSupabase,
  createCosRuntimeSupabaseForSummary,
  supabaseAppendRunEvent,
  supabaseListMergedSmokeSummaryEvents,
} from './runStoreSupabase.js';
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

/** Memory-only rows without a durable run id (pre-delegate audit). */
const memSmokeSummaryOrphans = [];

/** Event types included in ops smoke session summaries (vNext.13.46+). */
export const SMOKE_SUMMARY_EVENT_TYPES = new Set([
  'ops_smoke_phase',
  'cos_pretrigger_tool_call',
  'cos_pretrigger_tool_call_blocked',
  'cos_cursor_webhook_ingress_safe',
  'cos_github_fallback_evidence',
  'result_recovery_github_secondary',
]);

const SMOKE_SUMMARY_ORPHANS_BASENAME = 'cos_smoke_summary_orphans.jsonl';

function isSmokeSummaryEventType(et) {
  return SMOKE_SUMMARY_EVENT_TYPES.has(String(et || ''));
}

function eventsFilePath(runUuid) {
  return path.join(cosRuntimeBaseDir(), 'cos_run_events', `${runUuid}.jsonl`);
}

function cosEventsDirForSummary(runtimeStateDir) {
  const base =
    runtimeStateDir != null && String(runtimeStateDir).trim()
      ? path.resolve(String(runtimeStateDir))
      : cosRuntimeBaseDir();
  return path.join(base, 'cos_run_events');
}

function smokeSummaryOrphansFilePath(runtimeStateDir) {
  return path.join(cosEventsDirForSummary(runtimeStateDir ?? null), SMOKE_SUMMARY_ORPHANS_BASENAME);
}

/**
 * Pre-run audit rows (no cos_runs row yet). File + memory only; skipped in Supabase (FK).
 * @param {{ event_type: string, payload: Record<string, unknown>, created_at: string }} row
 */
export async function appendSmokeSummaryOrphanRow(row) {
  const mode = getCosRunStoreMode();
  const et = String(row.event_type || '');
  const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
  const created_at = row.created_at != null ? String(row.created_at) : new Date().toISOString();
  if (mode === 'memory') {
    memSmokeSummaryOrphans.push({
      run_id: '_orphan',
      event_type: et,
      payload: pl,
      created_at,
    });
    return true;
  }
  if (mode === 'file') {
    const fp = smokeSummaryOrphansFilePath(null);
    await fs.mkdir(path.dirname(fp), { recursive: true });
    const line = JSON.stringify({
      event_type: et,
      payload: pl,
      created_at,
    });
    await fs.appendFile(fp, `${line}\n`, 'utf8');
    return true;
  }
  return false;
}

async function readEventsJsonlFile(fp) {
  try {
    const raw = await fs.readFile(fp, 'utf8');
    return raw
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

/**
 * Read-only: `ops_smoke_phase` rows for ops summary (file | memory | supabase), one code path.
 * @param {{
 *   runId?: string | null,
 *   maxRows?: number,
 *   modeOverride?: 'file' | 'memory' | 'supabase' | null,
 *   runtimeStateDir?: string | null,
 *   supabaseClient?: import('@supabase/supabase-js').SupabaseClient | null,
 * }} [opts]
 * @returns {Promise<Array<{ run_id: string, event_type: string, payload: Record<string, unknown>, created_at: string }>>}
 */
export async function listOpsSmokePhaseEventsForSummary(opts = {}) {
  const runId = opts.runId != null && String(opts.runId).trim() ? String(opts.runId).trim() : null;
  const maxRows = Math.max(1, Math.min(Number(opts.maxRows) || 2000, 10000));
  const modeRaw = opts.modeOverride != null ? String(opts.modeOverride).trim().toLowerCase() : '';
  const mode =
    modeRaw === 'file' || modeRaw === 'memory' || modeRaw === 'supabase'
      ? modeRaw
      : getCosRunStoreMode();

  if (mode === 'memory') {
    const out = [];
    for (const [uuid, arr] of memByRun.entries()) {
      if (runId && uuid !== runId) continue;
      for (const row of arr) {
        if (!isSmokeSummaryEventType(row.event_type)) continue;
        out.push({
          run_id: uuid,
          event_type: String(row.event_type || ''),
          payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
          created_at: row.created_at != null ? String(row.created_at) : '',
        });
      }
    }
    if (!runId) {
      for (const row of memSmokeSummaryOrphans) {
        if (!isSmokeSummaryEventType(row.event_type)) continue;
        out.push({
          run_id: String(row.run_id || '_orphan'),
          event_type: String(row.event_type || ''),
          payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
          created_at: row.created_at != null ? String(row.created_at) : '',
        });
      }
    }
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return out.slice(0, maxRows);
  }

  if (mode === 'supabase') {
    const sb = opts.supabaseClient || createCosRuntimeSupabaseForSummary();
    if (!sb) return [];
    return supabaseListMergedSmokeSummaryEvents(sb, { runId, limit: maxRows });
  }

  const dir = cosEventsDirForSummary(opts.runtimeStateDir ?? null);
  const out = [];
  if (runId) {
    const fp = path.join(dir, `${runId}.jsonl`);
    const rows = await readEventsJsonlFile(fp);
    for (const row of rows) {
      if (!isSmokeSummaryEventType(row.event_type)) continue;
      out.push({
        run_id: runId,
        event_type: String(row.event_type || ''),
        payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
        created_at: row.created_at != null ? String(row.created_at) : '',
      });
    }
    out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    return out.slice(0, maxRows);
  }

  let names = [];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  for (const n of names) {
    if (!n.endsWith('.jsonl')) continue;
    if (n === SMOKE_SUMMARY_ORPHANS_BASENAME) continue;
    const uuid = path.basename(n, '.jsonl');
    const rows = await readEventsJsonlFile(path.join(dir, n));
    for (const row of rows) {
      if (!isSmokeSummaryEventType(row.event_type)) continue;
      out.push({
        run_id: uuid,
        event_type: String(row.event_type || ''),
        payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
        created_at: row.created_at != null ? String(row.created_at) : '',
      });
    }
  }
  const orphanFp = smokeSummaryOrphansFilePath(opts.runtimeStateDir ?? null);
  const orphanRows = await readEventsJsonlFile(orphanFp);
  for (const row of orphanRows) {
    if (!isSmokeSummaryEventType(row.event_type)) continue;
    out.push({
      run_id: '_orphan',
      event_type: String(row.event_type || ''),
      payload: row.payload && typeof row.payload === 'object' ? row.payload : {},
      created_at: row.created_at != null ? String(row.created_at) : '',
    });
  }
  out.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  return out.slice(0, maxRows);
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
 * Recent events for a specific durable run uuid (full history for that run id).
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

/** Alias for {@link listCosRunEventsForRun} — explicit “by run id” naming. */
export const listRecentCosRunEventsForRun = listCosRunEventsForRun;

/**
 * **Active-run view only:** events for the thread’s current latest run snapshot (see {@link getActiveRunForThread}).
 * Does not aggregate older runs on the same Slack thread.
 * @param {string} threadKey
 * @param {number} [limit]
 */
export async function listRecentCosRunEventsForThread(threadKey, limit = 30) {
  const run = await getActiveRunForThread(threadKey);
  if (!run?.id) return [];
  return listCosRunEventsForRun(String(run.id), limit);
}

/**
 * External-shaped events for one run uuid (`external_*` event_type prefix).
 * @param {string} runUuid
 * @param {number} [limit]
 */
export async function getLatestExternalRunEventsForRun(runUuid, limit = 20) {
  const rows = await listCosRunEventsForRun(String(runUuid), limit);
  return rows.filter((e) => String(e.event_type || '').startsWith('external_'));
}

/**
 * **Active-run view only** — external events for the thread’s latest run, not older runs on the same thread.
 * @param {string} threadKey
 * @param {number} [limit]
 */
export async function getLatestExternalRunEventsForThread(threadKey, limit = 20) {
  const rows = await listRecentCosRunEventsForThread(threadKey, limit);
  return rows.filter((e) => String(e.event_type || '').startsWith('external_'));
}

export function __resetCosRunEventsMemoryForTests() {
  memByRun.clear();
  memSmokeSummaryOrphans.length = 0;
}
