/**
 * Supabase-backed cos_runs persistence (vNext.13.31).
 */

import { createClient } from '@supabase/supabase-js';
import {
  cosRunTenancyColumnsFromEnv,
  filterRowsByOptionalTenancyKeys,
  filterRowsByParcelDeploymentKey,
  workspaceKeyFromRequestScopeFallback,
} from './parcelDeploymentContext.js';

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

/** Included in ops smoke session summaries (cos_ops_smoke_events + cos_run_events merge). Single SSOT for summary fetches. */
export const COS_OPS_SMOKE_SUMMARY_EVENT_TYPES = [
  'ops_smoke_phase',
  'cos_pretrigger_tool_call',
  'cos_pretrigger_tool_call_blocked',
  'live_payload_compilation_started',
  'delegate_packets_ready',
  'emit_patch_payload_validated',
  'trigger_blocked_invalid_payload',
  'cos_cursor_webhook_ingress_safe',
  'cursor_receive_intake_committed',
  'cos_github_fallback_evidence',
  'result_recovery_github_secondary',
];

/** DB 뷰 `supabase/migrations/*_cos_ops_smoke_summary_stream_view.sql` — 단일 시계열 읽기. */
export const COS_OPS_SMOKE_SUMMARY_STREAM_VIEW = 'cos_ops_smoke_summary_stream';

/** DB 뷰 `supabase/migrations/*_cos_run_events_tenancy_stream_view.sql` — ledger 전 타입 테넌시 슬라이스. */
export const COS_RUN_EVENTS_TENANCY_STREAM_VIEW = 'cos_run_events_tenancy_stream';

/** DB RPC `supabase/migrations/*_cos_runs_recent_by_tenancy*.sql` — cos_runs 테넌시 필터 슬라이스 (service_role). */
export const COS_RUNS_RECENT_BY_TENANCY_RPC = 'cos_runs_recent_by_tenancy';

/**
 * @param {Record<string, unknown>} r
 */
/**
 * @param {Record<string, unknown>} pl
 * @param {Record<string, unknown>} r
 * @param {string} field
 */
function mergedTenancyField(pl, r, field) {
  const fromR = r[field] != null ? String(r[field]).trim() : '';
  const fromPl = String(pl[field] ?? '').trim();
  const v = fromR || fromPl;
  return v || undefined;
}

function mapMergedSmokeSummaryRow(r) {
  const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
  const parcelKey = mergedTenancyField(pl, r, 'parcel_deployment_key');
  const workspaceKey = mergedTenancyField(pl, r, 'workspace_key');
  const productKey = mergedTenancyField(pl, r, 'product_key');
  const projectSpaceKey = mergedTenancyField(pl, r, 'project_space_key');
  const slackTeamId = mergedTenancyField(pl, r, 'slack_team_id');
  return {
    run_id: String(r.run_id || ''),
    event_type: String(r.event_type || ''),
    payload: pl,
    ...(parcelKey ? { parcel_deployment_key: parcelKey } : {}),
    ...(workspaceKey ? { workspace_key: workspaceKey } : {}),
    ...(productKey ? { product_key: productKey } : {}),
    ...(projectSpaceKey ? { project_space_key: projectSpaceKey } : {}),
    ...(slackTeamId ? { slack_team_id: slackTeamId } : {}),
    created_at: r.created_at != null ? String(r.created_at) : '',
  };
}

/**
 * 단일 뷰에서 병합 스트림 조회 (한 번의 order/limit).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   runId?: string | null,
 *   limit?: number,
 *   parcelDeploymentKey?: string | null,
 *   parcelDeploymentIncludeLegacy?: boolean,
 *   workspaceKey?: string | null,
 *   productKey?: string | null,
 *   projectSpaceKey?: string | null,
 *   tenancyIncludeLegacy?: boolean,
 * }} p
 * @returns {Promise<{ ok: boolean, data: ReturnType<typeof mapMergedSmokeSummaryRow>[] }>}
 */
export async function supabaseListMergedSmokeSummaryEventsFromStream(sb, p) {
  const lim = Math.max(1, Math.min(Number(p.limit) || 2000, 10000));
  const rid = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : null;
  const dk = String(p.parcelDeploymentKey || '').trim();
  const incLeg = p.parcelDeploymentIncludeLegacy === true;
  const wk = String(p.workspaceKey || '').trim();
  const pk = String(p.productKey || '').trim();
  const psk = String(p.projectSpaceKey || '').trim();
  const tenLeg = p.tenancyIncludeLegacy === true;

  let q = sb
    .from(COS_OPS_SMOKE_SUMMARY_STREAM_VIEW)
    .select(
      'run_id, event_type, payload, created_at, parcel_deployment_key, workspace_key, product_key, project_space_key, slack_team_id',
    );
  if (rid) q = q.eq('run_id', rid);
  if (dk) {
    if (incLeg) {
      q = q.or(`parcel_deployment_key.eq.${dk},parcel_deployment_key.is.null`);
    } else {
      q = q.eq('parcel_deployment_key', dk);
    }
  }
  const { data, error } = await q.order('created_at', { ascending: false }).limit(lim);
  if (error) return { ok: false, data: [] };
  let rows = data || [];
  if (dk) {
    rows = filterRowsByParcelDeploymentKey(rows, dk, incLeg);
  }
  rows = filterRowsByOptionalTenancyKeys(rows, {
    workspaceKey: wk || null,
    productKey: pk || null,
    projectSpaceKey: psk || null,
    tenancyIncludeLegacy: tenLeg,
  });
  return { ok: true, data: rows.map(mapMergedSmokeSummaryRow) };
}

export async function supabaseListOpsSmokePhaseEvents(sb, p) {
  const lim = Math.max(1, Math.min(Number(p.limit) || 2000, 10000));
  const rid = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : null;
  let q = sb
    .from('cos_run_events')
    .select('run_id, event_type, payload, created_at')
    .in('event_type', COS_OPS_SMOKE_SUMMARY_EVENT_TYPES);
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
 * Ops table rows for smoke summaries (nullable run_id; no FK).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{ runId?: string | null, limit?: number }} p
 */
export async function supabaseListCosOpsSmokeEvents(sb, p) {
  const lim = Math.max(1, Math.min(Number(p.limit) || 2000, 10000));
  const rid = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : null;
  let q = sb
    .from('cos_ops_smoke_events')
    .select('run_id, event_type, payload, created_at, smoke_session_id, thread_key')
    .in('event_type', COS_OPS_SMOKE_SUMMARY_EVENT_TYPES);
  if (rid) q = q.eq('run_id', rid);
  const { data, error } = await q.order('created_at', { ascending: false }).limit(lim);
  if (error) return [];
  return (data || []).map((r) => {
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const sid = String(r.smoke_session_id || '').trim();
    const mergedPl =
      sid && !String(pl.smoke_session_id || '').trim() ? { ...pl, smoke_session_id: sid } : pl;
    return {
      run_id: r.run_id != null && String(r.run_id).trim() ? String(r.run_id) : '_orphan',
      event_type: String(r.event_type || ''),
      payload: mergedPl,
      created_at: r.created_at != null ? String(r.created_at) : '',
    };
  });
}

/**
 * 병합 요약: 각 테이블은 이 행 수까지 가져온 뒤 합쳐서 `finalLimit`로 자른다.
 * 두 소스에 동일한 작은 limit만 쓰면 한쪽이 매우 많을 때 다른 쪽 최신 행이 통째로 밀려 요약에서 사라질 수 있어, 소스 예산을 넉넉히 잡는다 (상한 10k).
 * @param {number} finalLimit
 */
export function mergedSmokeSummaryPerSourceFetchBudget(finalLimit) {
  const lim = Math.max(1, Math.min(Number(finalLimit) || 2000, 10000));
  return Math.min(10000, lim * 2);
}

/**
 * 이중 쿼리 병합 (뷰 미적용·오류 시 폴백).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   runId?: string | null,
 *   limit?: number,
 *   parcelDeploymentKey?: string | null,
 *   parcelDeploymentIncludeLegacy?: boolean,
 *   workspaceKey?: string | null,
 *   productKey?: string | null,
 *   projectSpaceKey?: string | null,
 *   tenancyIncludeLegacy?: boolean,
 * }} p
 */
export async function supabaseListMergedSmokeSummaryEventsFallback(sb, p) {
  const lim = Math.max(1, Math.min(Number(p.limit) || 2000, 10000));
  const rid = p.runId != null && String(p.runId).trim() ? String(p.runId).trim() : null;
  const sourceBudget = mergedSmokeSummaryPerSourceFetchBudget(lim);
  const [runEv, opsEv] = await Promise.all([
    supabaseListOpsSmokePhaseEvents(sb, { runId: rid, limit: sourceBudget }),
    supabaseListCosOpsSmokeEvents(sb, { runId: rid, limit: sourceBudget }),
  ]);
  const merged = [...runEv, ...opsEv];
  merged.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  let out = merged.slice(0, lim);
  const dk = String(p.parcelDeploymentKey || '').trim();
  if (dk) {
    out = filterRowsByParcelDeploymentKey(out, dk, p.parcelDeploymentIncludeLegacy === true);
  }
  out = filterRowsByOptionalTenancyKeys(out, {
    workspaceKey: p.workspaceKey,
    productKey: p.productKey,
    projectSpaceKey: p.projectSpaceKey,
    tenancyIncludeLegacy: p.tenancyIncludeLegacy === true,
  });
  return out;
}

/**
 * Merge cos_run_events smoke rows with cos_ops_smoke_events, newest first.
 * 우선 DB 뷰 `cos_ops_smoke_summary_stream` 한 번 조회; 실패 시 {@link supabaseListMergedSmokeSummaryEventsFallback}.
 * 강제 레거시: `COS_SMOKE_SUMMARY_LEGACY_MERGE_ONLY=1`.
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   runId?: string | null,
 *   limit?: number,
 *   parcelDeploymentKey?: string | null,
 *   parcelDeploymentIncludeLegacy?: boolean,
 *   workspaceKey?: string | null,
 *   productKey?: string | null,
 *   projectSpaceKey?: string | null,
 *   tenancyIncludeLegacy?: boolean,
 * }} p
 */
export async function supabaseListMergedSmokeSummaryEvents(sb, p) {
  if (String(process.env.COS_SMOKE_SUMMARY_LEGACY_MERGE_ONLY || '').trim() === '1') {
    return supabaseListMergedSmokeSummaryEventsFallback(sb, p);
  }
  const stream = await supabaseListMergedSmokeSummaryEventsFromStream(sb, p);
  if (!stream.ok) return supabaseListMergedSmokeSummaryEventsFallback(sb, p);
  return stream.data;
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {{
 *   smoke_session_id: string,
 *   run_id?: string | null,
 *   thread_key?: string | null,
 *   event_type: string,
 *   payload: Record<string, unknown>,
 * }} row
 */
export async function supabaseAppendOpsSmokeEvent(sb, row) {
  const sid = String(row.smoke_session_id || '').trim();
  const et = String(row.event_type || '').trim();
  if (!sid || !et) return;
  const runIdCol = row.run_id != null && String(row.run_id).trim() ? String(row.run_id).trim() : null;
  const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
  await sb.from('cos_ops_smoke_events').insert({
    smoke_session_id: sid,
    run_id: runIdCol,
    thread_key: row.thread_key != null ? String(row.thread_key).slice(0, 512) : null,
    event_type: et,
    payload,
  });
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
  const env = typeof process !== 'undefined' ? process.env : {};
  const envTen = cosRunTenancyColumnsFromEnv(env);
  /** @param {string} col */
  const pickTenancyCol = (col) => {
    const fromRow = row[col];
    if (fromRow != null && String(fromRow).trim()) return String(fromRow).trim();
    const fromEnv = envTen[col];
    if (fromEnv != null && String(fromEnv).trim()) return String(fromEnv).trim();
    if (col === 'workspace_key') {
      const fb = workspaceKeyFromRequestScopeFallback(env);
      return fb || null;
    }
    return null;
  };
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
    recovery_envelope_pending:
      row.recovery_envelope_pending && typeof row.recovery_envelope_pending === 'object'
        ? row.recovery_envelope_pending
        : null,
    cursor_callback_anchor:
      row.cursor_callback_anchor && typeof row.cursor_callback_anchor === 'object'
        ? row.cursor_callback_anchor
        : null,
    cursor_dispatch_ledger:
      row.cursor_dispatch_ledger && typeof row.cursor_dispatch_ledger === 'object'
        ? row.cursor_dispatch_ledger
        : null,
    parcel_deployment_key: pickTenancyCol('parcel_deployment_key'),
    workspace_key: pickTenancyCol('workspace_key'),
    product_key: pickTenancyCol('product_key'),
    project_space_key: pickTenancyCol('project_space_key'),
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
    recovery_envelope_pending:
      db.recovery_envelope_pending && typeof db.recovery_envelope_pending === 'object'
        ? db.recovery_envelope_pending
        : null,
    cursor_callback_anchor:
      db.cursor_callback_anchor && typeof db.cursor_callback_anchor === 'object'
        ? db.cursor_callback_anchor
        : null,
    cursor_dispatch_ledger:
      db.cursor_dispatch_ledger && typeof db.cursor_dispatch_ledger === 'object'
        ? db.cursor_dispatch_ledger
        : null,
    parcel_deployment_key: db.parcel_deployment_key != null ? String(db.parcel_deployment_key) : null,
    workspace_key: db.workspace_key != null ? String(db.workspace_key) : null,
    product_key: db.product_key != null ? String(db.product_key) : null,
    project_space_key: db.project_space_key != null ? String(db.project_space_key) : null,
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

const HARNESS_OPS_SMOKE_SID_FETCH_CAP = 200;

/**
 * Ops smoke 요약 CLI 등: 플랫 이벤트에 대응하는 런들의 `harness_snapshot.ops_smoke_session_id` 일괄 조회.
 * orphan intake 귀속 시 스트림 추론보다 우선한다.
 *
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {string[]} runIds
 * @returns {Promise<Map<string, string>>}
 */
export async function supabaseMapHarnessOpsSmokeSessionIdsByRunIds(sb, runIds) {
  const ids = [
    ...new Set((runIds || []).map((x) => String(x || '').trim()).filter((x) => x && x !== '_orphan')),
  ].slice(0, HARNESS_OPS_SMOKE_SID_FETCH_CAP);
  if (!sb || !ids.length) return new Map();
  const { data, error } = await sb.from('cos_runs').select('id,harness_snapshot').in('id', ids);
  if (error) {
    console.error('[cos_runs harness anchors]', error.message);
    return new Map();
  }
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const row of data || []) {
    const id = String(row.id || '').trim();
    const hs = row.harness_snapshot && typeof row.harness_snapshot === 'object' ? row.harness_snapshot : {};
    const sid = String(/** @type {Record<string, unknown>} */ (hs).ops_smoke_session_id || '').trim();
    if (id && sid) out.set(id, sid);
  }
  return out;
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
      recovery_envelope_pending: dbUp.recovery_envelope_pending,
      cursor_callback_anchor: dbUp.cursor_callback_anchor,
      cursor_dispatch_ledger: dbUp.cursor_dispatch_ledger,
      parcel_deployment_key: dbUp.parcel_deployment_key,
      workspace_key: dbUp.workspace_key,
      product_key: dbUp.product_key,
      project_space_key: dbUp.project_space_key,
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
      recovery_envelope_pending: dbUp.recovery_envelope_pending,
      cursor_callback_anchor: dbUp.cursor_callback_anchor,
      cursor_dispatch_ledger: dbUp.cursor_dispatch_ledger,
      parcel_deployment_key: dbUp.parcel_deployment_key,
      workspace_key: dbUp.workspace_key,
      product_key: dbUp.product_key,
      project_space_key: dbUp.project_space_key,
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
 * Runs that may still need GitHub push secondary recovery (client-filters jsonb).
 * @param {import('@supabase/supabase-js').SupabaseClient} sb
 * @param {number} [limit]
 */
export async function supabaseListRunsWithRecoveryEnvelopePending(sb, limit = 200) {
  const lim = Math.min(Math.max(Number(limit) || 200, 1), 500);
  const { data, error } = await sb
    .from('cos_runs')
    .select('*')
    .not('recovery_envelope_pending', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(lim);
  if (error) {
    console.error('[cos_runs recovery envelope list]', error.message);
    return [];
  }
  return (data || []).map((r) => dbRowToAppRun(r)).filter(Boolean);
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
