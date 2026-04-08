/**
 * Ops-only Cursor cloud smoke evidence (vNext.13.42). No founder UX.
 * Stores safe subsets in cos_run_events as event_type ops_smoke_phase when COS_OPS_SMOKE_ENABLED=1.
 */

import crypto from 'node:crypto';
import { appendCosRunEventForRun } from './runCosEvents.js';
import { listAutomationResponseOverrideKeys } from './cursorCloudAdapter.js';
import { EMIT_PATCH_CONTRACT_NAME } from './livePatchPayload.js';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES } from './runStoreSupabase.js';

/**
 * Strip bearer tokens and http(s) URLs from free text (ops summaries only).
 * @param {string} s
 * @param {number} [maxLen]
 */
export function stripSecretsAndUrlsFromString(s, maxLen = 240) {
  let t = String(s || '');
  t = t.replace(/\bBearer\s+[\w\-_.+/=]+\b/gi, '[redacted_bearer]');
  t = t.replace(/https?:\/\/[^\s"'<>{}[\]]+/gi, '[url]');
  return t.slice(0, maxLen);
}

/**
 * @param {unknown} id
 */
export function tailExternalRunId(id) {
  const extId = String(id || '').trim();
  return extId.length > 8 ? extId.slice(-8) : extId;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function isOpsSmokeEnabled(env = process.env) {
  return String(env.COS_OPS_SMOKE_ENABLED || '').trim() === '1';
}

let cachedSessionId = null;

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSmokeSessionId(env = process.env) {
  const explicit = String(env.COS_OPS_SMOKE_SESSION_ID || '').trim();
  if (explicit) return explicit;
  if (!isOpsSmokeEnabled(env)) return null;
  if (!cachedSessionId) {
    cachedSessionId = `smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  }
  return cachedSessionId;
}

/**
 * @param {{
 *   runId: string,
 *   threadKey?: string,
 *   smoke_session_id?: string | null,
 *   phase: string,
 *   detail?: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} p
 */
export async function recordOpsSmokePhase(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const sid = String(p.smoke_session_id || '').trim() || resolveSmokeSessionId(env);
  const runId = String(p.runId || '').trim();
  if (!sid || !runId) return;

  const detail = p.detail && typeof p.detail === 'object' ? p.detail : {};
  const payload = {
    smoke_session_id: sid,
    phase: String(p.phase || 'unknown'),
    at: new Date().toISOString(),
    thread_key: p.threadKey != null ? String(p.threadKey).slice(0, 200) : null,
    ...detail,
  };
  await appendCosRunEventForRun(runId, 'ops_smoke_phase', payload, {});
}

/**
 * @param {Record<string, unknown> | null | undefined} tr
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, unknown>}
 */
export function buildSafeTriggerSmokeDetail(tr, env = process.env) {
  const t = tr && typeof tr === 'object' ? tr : {};
  const keys = Array.isArray(t.response_top_level_keys) ? t.response_top_level_keys.map(String).slice(0, 60) : null;
  const extUrl = t.external_url != null ? String(t.external_url).trim() : '';
  const hasRun = t.has_run_id === true || (t.external_run_id != null && String(t.external_run_id).trim() !== '');
  const hasStat =
    t.has_status === true ||
    (t.automation_status_raw != null && String(t.automation_status_raw).trim() !== '');
  const hasUrl = t.has_url === true || Boolean(extUrl);
  return {
    response_top_level_keys: keys,
    http_status: typeof t.status === 'number' ? t.status : null,
    trigger_status: t.trigger_status != null ? String(t.trigger_status).slice(0, 80) : null,
    external_run_id_tail: tailExternalRunId(t.external_run_id),
    status_extracted:
      t.automation_status_raw != null
        ? stripSecretsAndUrlsFromString(String(t.automation_status_raw), 120)
        : null,
    branch_present: Boolean(t.automation_branch_raw != null && String(t.automation_branch_raw).trim()),
    url_present: Boolean(extUrl),
    has_run_id: Boolean(hasRun),
    has_status: Boolean(hasStat),
    has_url: Boolean(hasUrl),
    selected_run_id_field_name:
      t.selected_run_id_field_name != null ? String(t.selected_run_id_field_name).slice(0, 120) : null,
    selected_status_field_name:
      t.selected_status_field_name != null ? String(t.selected_status_field_name).slice(0, 120) : null,
    selected_url_field_name:
      t.selected_url_field_name != null ? String(t.selected_url_field_name).slice(0, 120) : null,
    override_keys_used: listAutomationResponseOverrideKeys(env),
  };
}

/**
 * @param {{
 *   canonical: Record<string, unknown>,
 *   matched_by: string | null | undefined,
 *   canonical_status: string | null | undefined,
 *   payload_fingerprint_prefix: string | null | undefined,
 *   ingressEvidence: Record<string, unknown>,
 * }} p
 */
export function buildSafeCursorCallbackSmokeDetail(p) {
  const ev = p.ingressEvidence && typeof p.ingressEvidence === 'object' ? p.ingressEvidence : {};
  const c = p.canonical && typeof p.canonical === 'object' ? p.canonical : {};
  const names = [ev.source_status_field_name, ev.source_run_id_field_name].filter(
    (x) => x != null && String(x).trim(),
  );
  const ov = Array.isArray(ev.selected_override_keys) ? ev.selected_override_keys.map(String) : [];
  const pl = c.payload && typeof c.payload === 'object' && !Array.isArray(c.payload) ? c.payload : {};
  return {
    matched_by: p.matched_by != null ? String(p.matched_by).slice(0, 80) : null,
    canonical_status: p.canonical_status != null ? String(p.canonical_status).slice(0, 80) : null,
    payload_fingerprint_prefix:
      p.payload_fingerprint_prefix != null ? String(p.payload_fingerprint_prefix).slice(0, 32) : null,
    selected_webhook_field_names: names.map((x) => String(x).slice(0, 120)),
    selected_override_keys: ov.slice(0, 20).map((x) => x.slice(0, 80)),
    external_run_id_tail: tailExternalRunId(c.external_run_id),
    has_thread_key_hint: Boolean(c.thread_key_hint),
    has_packet_id_hint: Boolean(c.packet_id_hint),
    has_branch: Boolean(pl.branch),
    has_pr_url: Boolean(pl.pr_url),
    has_summary: Boolean(pl.summary),
    occurred_at_present: Boolean(c.occurred_at),
  };
}

/** Progress gates only (diagnostic phases do not advance the break pointer). */
const PIPELINE_BREAK_ORDER = [
  'cursor_trigger_recorded',
  'external_run_id_extracted',
  'external_callback_matched',
  'run_packet_progression_patched',
  'supervisor_wake_enqueued',
  'founder_milestone_sent',
];

/** Sort order for phases_seen / ordered_events. */
const PHASE_SORT_ORDER = [
  'cursor_trigger_recorded',
  'trigger_accepted_external_run_id_absent',
  'external_run_id_extracted',
  'external_callback_matched',
  'run_packet_progression_patched',
  'supervisor_wake_enqueued',
  'founder_milestone_sent',
];

/**
 * Derive closure summary from ops_smoke_phase event rows (payload shape from this module).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown> }>} rows
 */
const OPS_PHASE_LIKE_EVENT_TYPES = new Set([
  'trigger_blocked_invalid_payload',
  'live_payload_compilation_started',
  'delegate_packets_ready',
  'emit_patch_payload_validated',
  'trigger_accepted_external_run_id_absent',
]);

function smokeSummaryPhaseFromRow(r) {
  const et = String(r.event_type || '');
  const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
  if (et === 'ops_smoke_phase' && pl.phase) return String(pl.phase);
  if (et === 'cos_pretrigger_tool_call' || et === 'cos_pretrigger_tool_call_blocked') return et;
  if (OPS_PHASE_LIKE_EVENT_TYPES.has(et)) return et;
  return '';
}

/**
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown> }>} rows
 */
export function aggregateSmokeSessionProgress(rows) {
  const phases = (rows || [])
    .map((r) => {
      const ph = smokeSummaryPhaseFromRow(r);
      const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
      const at = pl.at != null ? String(pl.at) : '';
      return ph ? { phase: ph, at } : null;
    })
    .filter(Boolean);

  const seen = new Set(phases.map((p) => String(p.phase || '')));
  const orderIdx = (ph) => {
    const i = PHASE_SORT_ORDER.indexOf(ph);
    return i >= 0 ? i : 99;
  };
  const sorted = [...phases].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));

  if (!seen.size) {
    return {
      phases_seen: [],
      ordered_events: [],
      breaks_at: null,
      final_status: 'no_ops_smoke_events',
    };
  }

  if (
    (seen.has('trigger_blocked_invalid_payload') || seen.has('cos_pretrigger_tool_call_blocked')) &&
    !seen.has('cursor_trigger_recorded')
  ) {
    return {
      phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
      ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
      breaks_at: 'cursor_trigger_recorded',
      final_status: 'pre_trigger_blocked_invalid_payload',
    };
  }

  if (seen.has('cursor_trigger_failed')) {
    return {
      phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
      ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
      breaks_at: 'cursor_trigger_recorded',
      final_status: 'trigger_failed',
    };
  }

  let breaksAt = null;
  for (let i = 0; i < PIPELINE_BREAK_ORDER.length; i += 1) {
    const step = PIPELINE_BREAK_ORDER[i];
    if (!seen.has(step)) {
      breaksAt = step;
      break;
    }
  }

  let final_status = 'unknown';
  if (
    seen.has('cursor_trigger_recorded') &&
    seen.has('trigger_accepted_external_run_id_absent') &&
    !seen.has('external_run_id_extracted')
  ) {
    final_status = 'trigger_accepted_external_run_id_missing';
    breaksAt = 'external_run_id_extracted';
  } else if (!breaksAt) final_status = 'full_pipeline_observed';
  else if (breaksAt === 'cursor_trigger_recorded') final_status = 'before_trigger';
  else final_status = `partial_stopped_before_${breaksAt}`;

  return {
    phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
    ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
    breaks_at: breaksAt,
    final_status: final_status,
  };
}

/**
 * Group flat cos_run_events-shaped rows into smoke session summaries (read-only ops tooling).
 * @param {Array<{ run_id?: string, event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} flatRows
 * @param {{ sessionLimit?: number }} [opts]
 */
const SMOKE_SESSION_ROW_EVENT_TYPES = new Set(COS_OPS_SMOKE_SUMMARY_EVENT_TYPES);

/**
 * Latest pre-trigger / blocked machine fields for ops summary (field names only; no raw payload bodies).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
/**
 * Latest Cursor automation trigger safe subset for ops session summary (from ops_smoke_phase rows).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractLatestTriggerEvidenceFromRows(rows) {
  const empty = {
    response_top_level_keys: null,
    selected_run_id_field_name: null,
    selected_status_field_name: null,
    selected_url_field_name: null,
    has_run_id: null,
    has_status: null,
    has_url: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestTrigger = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const ph = String(pl.phase || '');
    if (ph !== 'cursor_trigger_recorded' && ph !== 'trigger_accepted_external_run_id_absent') continue;
    const det = pl.detail && typeof pl.detail === 'object' ? pl.detail : {};
    const trg =
      (det.trigger && typeof det.trigger === 'object' ? det.trigger : null) ||
      (pl.trigger && typeof pl.trigger === 'object' ? pl.trigger : null);
    if (!trg) continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      bestTrigger = trg;
    }
  }
  if (!bestTrigger) return empty;
  return {
    response_top_level_keys: Array.isArray(bestTrigger.response_top_level_keys)
      ? bestTrigger.response_top_level_keys.map(String).slice(0, 60)
      : null,
    selected_run_id_field_name:
      bestTrigger.selected_run_id_field_name != null
        ? String(bestTrigger.selected_run_id_field_name).slice(0, 120)
        : null,
    selected_status_field_name:
      bestTrigger.selected_status_field_name != null
        ? String(bestTrigger.selected_status_field_name).slice(0, 120)
        : null,
    selected_url_field_name:
      bestTrigger.selected_url_field_name != null
        ? String(bestTrigger.selected_url_field_name).slice(0, 120)
        : null,
    has_run_id: bestTrigger.has_run_id != null ? Boolean(bestTrigger.has_run_id) : null,
    has_status: bestTrigger.has_status != null ? Boolean(bestTrigger.has_status) : null,
    has_url: bestTrigger.has_url != null ? Boolean(bestTrigger.has_url) : null,
  };
}

export function extractOpsSmokeMachineSummaryFromRows(rows) {
  const empty = {
    call_name: null,
    selected_tool: null,
    selected_action: null,
    delegate_packets_present: null,
    delegate_live_patch_present: null,
    payload_top_level_keys: null,
    blocked_reason: null,
    machine_hint: null,
    missing_required_fields: null,
  };
  /** @type {{ _rank: number, _t: string, pl: Record<string, unknown> } | null} */
  let best = null;
  for (const r of rows || []) {
    const et = String(r.event_type || '');
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const ph = String(pl.phase || '');
    const isBlocked =
      et === 'cos_pretrigger_tool_call_blocked' ||
      ph === 'cos_pretrigger_tool_call_blocked' ||
      et === 'trigger_blocked_invalid_payload' ||
      ph === 'trigger_blocked_invalid_payload';
    const isPre = et === 'cos_pretrigger_tool_call' || ph === 'cos_pretrigger_tool_call';
    if (!isBlocked && !isPre) continue;
    const rank = isBlocked ? 2 : 1;
    const t1 = String(pl.at || '');
    const t2 = String(r.created_at || '');
    const t = t1 > t2 ? t1 : t2;
    if (!best || rank > best._rank || (rank === best._rank && t > best._t)) {
      best = { _rank: rank, _t: t, pl };
    }
  }
  if (!best) return empty;
  const pl = best.pl;
  const keys = Array.isArray(pl.payload_top_level_keys) ? pl.payload_top_level_keys.map(String) : null;
  const miss = Array.isArray(pl.missing_required_fields) ? pl.missing_required_fields.map(String) : null;
  return {
    call_name: pl.call_name != null ? String(pl.call_name) : null,
    selected_tool: pl.selected_tool != null ? String(pl.selected_tool) : null,
    selected_action: pl.selected_action != null ? String(pl.selected_action) : null,
    delegate_packets_present:
      pl.delegate_packets_present != null ? Boolean(pl.delegate_packets_present) : null,
    delegate_live_patch_present:
      pl.delegate_live_patch_present != null ? Boolean(pl.delegate_live_patch_present) : null,
    payload_top_level_keys: keys,
    blocked_reason: pl.blocked_reason != null ? String(pl.blocked_reason) : null,
    machine_hint: pl.machine_hint != null ? String(pl.machine_hint) : null,
    missing_required_fields: miss,
  };
}

export function summarizeOpsSmokeSessionsFromFlatRows(flatRows, opts = {}) {
  const sessionLimit = opts.sessionLimit != null ? Math.max(1, Number(opts.sessionLimit)) : 50;
  /** @type {Map<string, { run_id: string, rows: { event_type: string, payload: Record<string, unknown>, created_at: string }[] }>} */
  const bySession = new Map();
  for (const row of flatRows || []) {
    if (!SMOKE_SESSION_ROW_EVENT_TYPES.has(String(row.event_type || ''))) continue;
    const pl = row.payload && typeof row.payload === 'object' ? row.payload : {};
    const sid = String(pl.smoke_session_id || '').trim();
    if (!sid) continue;
    const runId = String(row.run_id || '').trim() || 'unknown';
    if (!bySession.has(sid)) bySession.set(sid, { run_id: runId, rows: [] });
    const bucket = bySession.get(sid);
    bucket.rows.push({
      event_type: String(row.event_type || ''),
      payload: pl,
      created_at: row.created_at != null ? String(row.created_at) : '',
    });
    if (bucket.run_id !== runId) bucket.run_id = `${bucket.run_id}+${runId}`;
  }
  const sessions = [...bySession.entries()].map(([smoke_session_id, { run_id, rows }]) => {
    const agg = aggregateSmokeSessionProgress(rows);
    const machine = extractOpsSmokeMachineSummaryFromRows(rows);
    const triggerEv = extractLatestTriggerEvidenceFromRows(rows);
    const lastAt = rows.reduce((m, r) => {
      const t1 = String(r.payload?.at || '');
      const t2 = String(r.created_at || '');
      const best = t1 > t2 ? t1 : t2;
      return best > m ? best : m;
    }, '');
    return { smoke_session_id, run_id, lastAt, ...machine, ...triggerEv, ...agg };
  });
  sessions.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return sessions.slice(0, sessionLimit);
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   smoke_session_id?: string | null,
 *   tr: Record<string, unknown> | null,
 * }} p
 */
export async function recordOpsSmokeCursorTrigger(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId || !threadKey) return;
  const tr = p.tr;
  const ok = Boolean(tr && tr.ok);
  const ext = tr && tr.external_run_id != null ? String(tr.external_run_id).trim() : '';
  const smokeSid = String(p.smoke_session_id || '').trim() || null;

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    smoke_session_id: smokeSid || undefined,
    phase: ok ? 'cursor_trigger_recorded' : 'cursor_trigger_failed',
    detail: {
      trigger: buildSafeTriggerSmokeDetail(tr, env),
      trigger_ok: ok,
    },
  });

  if (ok && !ext) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'trigger_accepted_external_run_id_absent',
      detail: {
        trigger: buildSafeTriggerSmokeDetail(tr, env),
      },
    });
  }

  if (ok && ext) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'external_run_id_extracted',
      detail: { external_run_id_tail: tailExternalRunId(ext) },
    });
  }
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   canonical: Record<string, unknown>,
 *   corr: Record<string, unknown>,
 *   ingressMeta: Record<string, unknown>,
 *   canonForOut: { bucket?: string },
 *   ingressEvidence: Record<string, unknown>,
 *   cursorPacketPatched: boolean,
 * }} p
 */
export async function recordOpsSmokeAfterExternalMatch(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId) return;

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    phase: 'external_callback_matched',
    detail: {
      callback: buildSafeCursorCallbackSmokeDetail({
        canonical: p.canonical,
        matched_by: p.ingressMeta?.matched_by,
        canonical_status: p.canonForOut?.bucket != null ? String(p.canonForOut.bucket) : null,
        payload_fingerprint_prefix: p.ingressMeta?.payload_fingerprint_prefix,
        ingressEvidence: p.ingressEvidence,
      }),
    },
  });

  if (p.cursorPacketPatched) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      phase: 'run_packet_progression_patched',
      detail: {},
    });
  }

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    phase: 'supervisor_wake_enqueued',
    detail: {},
  });
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   milestone: string,
 * }} p
 */
export async function recordOpsSmokeFounderMilestone(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  await recordOpsSmokePhase({
    env,
    runId: String(p.runId || ''),
    threadKey: p.threadKey,
    phase: 'founder_milestone_sent',
    detail: { milestone: String(p.milestone || '').slice(0, 80) },
  });
}

/**
 * Pre-trigger emit_patch cloud contract gate (vNext.13.44+).
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   smoke_session_id?: string | null,
 *   prep: ReturnType<import('./livePatchPayload.js').prepareEmitPatchForCloudAutomation>,
 * }} p
 */
export async function recordOpsSmokeEmitPatchCloudGate(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId) return;
  const prep = p.prep;
  const smokeSid = String(p.smoke_session_id || '').trim() || null;

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    smoke_session_id: smokeSid || undefined,
    phase: 'live_payload_compilation_started',
    detail: {
      selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
      compilation_mode: prep.compilation,
    },
  });

  if (prep.compilation === 'narrow') {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'delegate_packets_ready',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
      },
    });
  }

  if (prep.narrow_incomplete) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'live_payload_compilation_failed',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        blocked_reason_code: 'narrow_live_patch_incomplete',
      },
    });
  }

  if (prep.cloud_ok) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'emit_patch_payload_validated',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
      },
    });
  }

  if (!prep.cloud_ok) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      phase: 'trigger_blocked_invalid_payload',
      detail: {
        blocked_reason_code: 'emit_patch_contract_not_met',
        missing_required_fields: (prep.validation.missing_required_fields || []).slice(0, 24),
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
      },
    });
  }
}

export function __resetOpsSmokeSessionCacheForTests() {
  cachedSessionId = null;
}
