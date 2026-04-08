/**
 * Supabase-backed cos_runs persistence (vNext.13.31).
 */

import { createClient } from '@supabase/supabase-js';

/** @returns {import('@supabase/supabase-js').SupabaseClient | null} */
export function createCosRuntimeSupabase() {
  const url = String(process.env.SUPABASE_URL || '').trim();
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * Read-only Supabase client for ops summaries: optional COS_RUNTIME_* overrides, then app defaults.
 * Does not change {@link createCosRuntimeSupabase} behavior used by the main run store.
 * @param {NodeJS.ProcessEnv} [env]
 * @param {string} [urlOverride]
 * @param {string} [keyOverride]
 */
export function createCosRuntimeSupabaseForSummary(env = process.env, urlOverride, keyOverride) {
  const url = String(urlOverride || env.COS_RUNTIME_SUPABASE_URL || env.SUPABASE_URL || '').trim();
  const key = String(
    keyOverride || env.COS_RUNTIME_SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '',
  ).trim();
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ runId?: string | null, limit?: number }} p
 */
export async function supabaseListOpsSmokePhaseEvents(sb, p) {
  const lim = Math.max(1, Math.min(Number(p.limit) || 2000, 10000));
  const rid = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : null;
  let q = sb
    .from('cos_run_events')
    .select('run_id, event_type, payload, created_at')
    .eq('event_type', 'ops_smoke_phase');
  if (rid) q = q.eq('run_id', rid);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(lim);
  if (error) return [];
  return (data || []).map((r) => ({
    run_id: String(r.run_id || ''),
    event_type: String(r.event_type || ''),
    payload: r.payload && typeof r.payload === 'object' ? r.payload : {},
    created_at: r.created_at != null ? String(r.created_at) : '',
  }));
}

/**
 * @param {Record<string, unknown>} row app-shaped run row (camel/snake mix from existing code)
 */
export function appRunToDbRow(row) {
  const snap = row.harness_snapshot && typeof row.harness_snapshot === 'object' ? row.harness_snapshot : {};
  const ho =
    Array.isArray(row.handoff_order) && row.handoff_order.length
      ? row.handoff_order.map(String)
      : Array.isArray(snap.handoff_order)
        ? snap.handoff_order.map(String)
        : [];
  const base = {
    thread_key: String(row.thread_key || ''),
    dispatch_id: String(row.dispatch_id || ''),
    objective: String(row.objective || ''),
    status: String(row.status || ''),
    stage: row.stage != null ? String(row.stage) : null,
    current_packet_id: row.current_packet_id != null ? String(row.current_packet_id) : null,
    next_packet_id: row.next_packet_id != null ? String(row.next_packet_id) : null,
    packet_state_map: row.packet_state_map && typeof row.packet_state_map === 'object' ? row.packet_state_map : {},
    handoff_order: ho,
    dispatch_payload:
      row.dispatch_payload && typeof row.dispatch_payload === 'object'
        ? row.dispatch_payload
        : row.dispatch && typeof row.dispatch === 'object'
          ? row.dispatch
          : {},
    starter_kickoff: row.starter_kickoff && typeof row.starter_kickoff === 'object' ? row.starter_kickoff : null,
    last_auto_invocation_sha: row.last_auto_invocation_sha != null ? String(row.last_auto_invocation_sha) : null,
    founder_request_summary: row.founder_request_summary != null ? String(row.founder_request_summary) : null,
    founder_notified_started_at: row.founder_notified_started_at ?? null,
    founder_notified_review_required_at: row.founder_notified_review_required_at ?? null,
    founder_notified_blocked_at: row.founder_notified_blocked_at ?? null,
    founder_notified_completed_at: row.founder_notified_completed_at ?? null,
    founder_notified_failed_at: row.founder_notified_failed_at ?? null,
    external_run_id: row.external_run_id != null ? String(row.external_run_id) : String(row.run_id || ''),
    required_packet_ids: Array.isArray(row.required_packet_ids) ? row.required_packet_ids : [],
    terminal_packet_ids: Array.isArray(row.terminal_packet_ids) ? row.terminal_packet_ids : [],
    harness_snapshot: snap,
    completed_at: row.completed_at ?? null,
    last_progressed_at: row.last_progressed_at ?? null,
    last_founder_update_sha: row.last_founder_update_sha != null ? String(row.last_founder_update_sha) : null,
    cursor_external_terminal_by_packet:
      row.cursor_external_terminal_by_packet && typeof row.cursor_external_terminal_by_packet === 'object'
        ? row.cursor_external_terminal_by_packet
        : {},
    pending_supervisor_wake: Boolean(row.pending_supervisor_wake),
    last_supervisor_wake_request_at: row.last_supervisor_wake_request_at ?? null,
    created_at: row.created_at ?? undefined,
    updated_at: row.updated_at ?? new Date().toISOString(),
  };
  if (row.id != null && String(row.id).trim()) {
    return { id: String(row.id).trim(), ...base };
  }
  return base;
}

/**
 * @param {Record<string, unknown>} db
 */
export function dbRowToAppRun(db) {
  if (!db || typeof db !== 'object') return null;
  const id = String(db.id || '');
  const ext = db.external_run_id != null ? String(db.external_run_id) : id;
  return {
    run_id: ext,
    id,
    thread_key: String(db.thread_key || ''),
    dispatch_id: String(db.dispatch_id || ''),
    objective: String(db.objective || ''),
    status: String(db.status || ''),
    stage: db.stage != null ? String(db.stage) : null,
    current_packet_id: db.current_packet_id != null ? String(db.current_packet_id) : null,
    next_packet_id: db.next_packet_id != null ? String(db.next_packet_id) : null,
    packet_state_map:
      db.packet_state_map && typeof db.packet_state_map === 'object' ? db.packet_state_map : {},
    starter_kickoff: db.starter_kickoff && typeof db.starter_kickoff === 'object' ? db.starter_kickoff : null,
    last_auto_invocation_sha: db.last_auto_invocation_sha != null ? String(db.last_auto_invocation_sha) : null,
    founder_request_summary: db.founder_request_summary != null ? String(db.founder_request_summary) : null,
    founder_notified_started_at: db.founder_notified_started_at ?? null,
    founder_notified_review_required_at: db.founder_notified_review_required_at ?? null,
    founder_notified_blocked_at: db.founder_notified_blocked_at ?? null,
    founder_notified_completed_at: db.founder_notified_completed_at ?? null,
    founder_notified_failed_at: db.founder_notified_failed_at ?? null,
    created_at: db.created_at ?? null,
    updated_at: db.updated_at ?? null,
    completed_at: db.completed_at ?? null,
    last_progressed_at: db.last_progressed_at ?? null,
    last_founder_update_sha: db.last_founder_update_sha != null ? String(db.last_founder_update_sha) : null,
    required_packet_ids: Array.isArray(db.required_packet_ids) ? db.required_packet_ids.map(String) : [],
    terminal_packet_ids: Array.isArray(db.terminal_packet_ids) ? db.terminal_packet_ids.map(String) : [],
    harness_snapshot:
      db.harness_snapshot && typeof db.harness_snapshot === 'object'
        ? db.harness_snapshot
        : { packets: [], handoff_order: [] },
    dispatch_payload:
      db.dispatch_payload && typeof db.dispatch_payload === 'object' ? db.dispatch_payload : {},
    handoff_order: Array.isArray(db.handoff_order) ? db.handoff_order.map(String) : [],
    packet_ids: Array.isArray(db.required_packet_ids) ? db.required_packet_ids.map(String) : [],
    external_run_id: ext,
    cursor_external_terminal_by_packet:
      db.cursor_external_terminal_by_packet && typeof db.cursor_external_terminal_by_packet === 'object'
        ? db.cursor_external_terminal_by_packet
        : {},
    pending_supervisor_wake: Boolean(db.pending_supervisor_wake),
    last_supervisor_wake_request_at: db.last_supervisor_wake_request_at ?? null,
  };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} threadKey
 */
export async function supabaseCancelActiveRuns(sb, threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return;
  const now = new Date().toISOString();
  await sb
    .from('cos_runs')
    .update({ status: 'canceled', updated_at: now })
    .eq('thread_key', tk)
    .in('status', ['queued', 'running', 'review_required', 'blocked']);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} threadKey
 */
export async function supabaseSelectLatestRun(sb, threadKey) {
  const tk = String(threadKey || '');
  if (!tk) return null;
  const { data, error } = await sb
    .from('cos_runs')
    .select('*')
    .eq('thread_key', tk)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    console.error('[cos_runs]', error.message);
    return null;
  }
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} runUuid
 */
export async function supabaseSelectRunById(sb, runUuid) {
  const rid = String(runUuid || '').trim();
  if (!rid) return null;
  const { data, error } = await sb.from('cos_runs').select('*').eq('id', rid).maybeSingle();
  if (error) {
    console.error('[cos_runs by id]', error.message);
    return null;
  }
  return data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {Record<string, unknown>} appRow
 * @returns {Promise<Record<string, unknown> | null>}
 */
export async function supabaseInsertRun(sb, appRow) {
  const base = appRunToDbRow(appRow);
  const { created_at: _c, ...insertRow } = base;
  const { data, error } = await sb.from('cos_runs').insert(insertRow).select('*').single();
  if (error) {
    console.error('[cos_runs insert]', error.message);
    return null;
  }
  return dbRowToAppRun(data);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} runUuid
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 */
/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} runUuid
 * @param {string} eventType
 * @param {Record<string, unknown>} payload
 * @param {{ matched_by?: string | null, canonical_status?: string | null, payload_fingerprint_prefix?: string | null }} [evidence]
 */
export async function supabaseAppendRunEvent(sb, runUuid, eventType, payload, evidence) {
  const rid = String(runUuid || '');
  if (!rid) return;
  const ev = evidence && typeof evidence === 'object' ? evidence : {};
  await sb.from('cos_run_events').insert({
    run_id: rid,
    event_type: String(eventType || 'unknown'),
    payload: payload && typeof payload === 'object' ? payload : {},
    matched_by: ev.matched_by != null && String(ev.matched_by).trim() ? String(ev.matched_by).trim() : null,
    canonical_status: ev.canonical_status != null && String(ev.canonical_status).trim() ? String(ev.canonical_status).trim() : null,
    payload_fingerprint_prefix:
      ev.payload_fingerprint_prefix != null && String(ev.payload_fingerprint_prefix).trim()
        ? String(ev.payload_fingerprint_prefix).trim().slice(0, 32)
        : null,
  });
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} threadKey
 * @param {Record<string, unknown>} patch app-shaped patch
 */
export async function supabasePatchLatestRun(sb, threadKey, patch) {
  const cur = await supabaseSelectLatestRun(sb, threadKey);
  if (!cur) return null;
  const merged = { ...dbRowToAppRun(cur), ...patch };
  merged.updated_at = new Date().toISOString();
  const dbUp = appRunToDbRow(merged);
  const { error } = await sb
    .from('cos_runs')
    .update({
      dispatch_id: dbUp.dispatch_id,
      objective: dbUp.objective,
      status: dbUp.status,
      stage: dbUp.stage,
      current_packet_id: dbUp.current_packet_id,
      next_packet_id: dbUp.next_packet_id,
      packet_state_map: dbUp.packet_state_map,
      handoff_order: dbUp.handoff_order,
      dispatch_payload: dbUp.dispatch_payload,
      starter_kickoff: dbUp.starter_kickoff,
      last_auto_invocation_sha: dbUp.last_auto_invocation_sha,
      founder_request_summary: dbUp.founder_request_summary,
      founder_notified_started_at: dbUp.founder_notified_started_at,
      founder_notified_review_required_at: dbUp.founder_notified_review_required_at,
      founder_notified_blocked_at: dbUp.founder_notified_blocked_at,
      founder_notified_completed_at: dbUp.founder_notified_completed_at,
      founder_notified_failed_at: dbUp.founder_notified_failed_at,
      external_run_id: dbUp.external_run_id,
      required_packet_ids: dbUp.required_packet_ids,
      terminal_packet_ids: dbUp.terminal_packet_ids,
      harness_snapshot: dbUp.harness_snapshot,
      completed_at: dbUp.completed_at,
      last_progressed_at: dbUp.last_progressed_at,
      last_founder_update_sha: dbUp.last_founder_update_sha,
      cursor_external_terminal_by_packet: dbUp.cursor_external_terminal_by_packet,
      pending_supervisor_wake: dbUp.pending_supervisor_wake,
      last_supervisor_wake_request_at: dbUp.last_supervisor_wake_request_at,
      updated_at: dbUp.updated_at,
    })
    .eq('id', cur.id);
  if (error) {
    console.error('[cos_runs patch]', error.message);
    return null;
  }
  const again = await supabaseSelectLatestRun(sb, threadKey);
  return dbRowToAppRun(again);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string} runUuid
 * @param {Record<string, unknown>} patch app-shaped patch
 */
export async function supabasePatchRunById(sb, runUuid, patch) {
  const rid = String(runUuid || '').trim();
  if (!rid) return null;
  const cur = await supabaseSelectRunById(sb, rid);
  if (!cur) return null;
  const merged = { ...dbRowToAppRun(cur), ...patch };
  merged.updated_at = new Date().toISOString();
  const dbUp = appRunToDbRow(merged);
  const { error } = await sb
    .from('cos_runs')
    .update({
      dispatch_id: dbUp.dispatch_id,
      objective: dbUp.objective,
      status: dbUp.status,
      stage: dbUp.stage,
      current_packet_id: dbUp.current_packet_id,
      next_packet_id: dbUp.next_packet_id,
      packet_state_map: dbUp.packet_state_map,
      handoff_order: dbUp.handoff_order,
      dispatch_payload: dbUp.dispatch_payload,
      starter_kickoff: dbUp.starter_kickoff,
      last_auto_invocation_sha: dbUp.last_auto_invocation_sha,
      founder_request_summary: dbUp.founder_request_summary,
      founder_notified_started_at: dbUp.founder_notified_started_at,
      founder_notified_review_required_at: dbUp.founder_notified_review_required_at,
      founder_notified_blocked_at: dbUp.founder_notified_blocked_at,
      founder_notified_completed_at: dbUp.founder_notified_completed_at,
      founder_notified_failed_at: dbUp.founder_notified_failed_at,
      external_run_id: dbUp.external_run_id,
      required_packet_ids: dbUp.required_packet_ids,
      terminal_packet_ids: dbUp.terminal_packet_ids,
      harness_snapshot: dbUp.harness_snapshot,
      completed_at: dbUp.completed_at,
      last_progressed_at: dbUp.last_progressed_at,
      last_founder_update_sha: dbUp.last_founder_update_sha,
      cursor_external_terminal_by_packet: dbUp.cursor_external_terminal_by_packet,
      pending_supervisor_wake: dbUp.pending_supervisor_wake,
      last_supervisor_wake_request_at: dbUp.last_supervisor_wake_request_at,
      updated_at: dbUp.updated_at,
    })
    .eq('id', rid);
  if (error) {
    console.error('[cos_runs patch by id]', error.message);
    return null;
  }
  const again = await supabaseSelectRunById(sb, rid);
  return dbRowToAppRun(again);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @returns {Promise<string[]>}
 */
export async function supabaseListThreadKeys(sb) {
  const { data, error } = await sb.from('cos_runs').select('thread_key');
  if (error || !data) return [];
  return [...new Set(data.map((r) => String(r.thread_key || '').trim()).filter(Boolean))];
}

const NON_TERMINAL_STATUSES = ['queued', 'running', 'review_required', 'blocked'];

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {number} [limit]
 * @param {string | null} [updatedSince] ISO timestamp — runs with updated_at >= this
 */
export async function supabaseListNonTerminalRunIds(sb, limit = 80, updatedSince = null) {
  const lim = Math.min(Math.max(Number(limit) || 80, 1), 500);
  let q = sb
    .from('cos_runs')
    .select('id, updated_at')
    .in('status', NON_TERMINAL_STATUSES)
    .order('updated_at', { ascending: false })
    .limit(lim);
  if (updatedSince && String(updatedSince).trim()) {
    q = q.gte('updated_at', String(updatedSince).trim());
  }
  const { data, error } = await q;
  if (error) {
    console.error('[cos_runs list non-terminal]', error.message);
    return [];
  }
  return (data || []).map((r) => String(r.id || '').trim()).filter(Boolean);
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {number} [limit]
 */
export async function supabaseListPendingSupervisorWakeRunIds(sb, limit = 50) {
  const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const { data, error } = await sb
    .from('cos_runs')
    .select('id')
    .eq('pending_supervisor_wake', true)
    .order('last_supervisor_wake_request_at', { ascending: false })
    .limit(lim);
  if (error) {
    console.error('[cos_runs list pending wake]', error.message);
    return [];
  }
  return (data || []).map((r) => String(r.id || '').trim()).filter(Boolean);
}
