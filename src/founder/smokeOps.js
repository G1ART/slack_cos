/**
 * Ops-only Cursor cloud smoke evidence (vNext.13.42). No founder UX.
 * Stores safe subsets in cos_run_events as event_type ops_smoke_phase when COS_OPS_SMOKE_ENABLED=1.
 */

import crypto from 'node:crypto';
import { appendCosRunEventForRun, appendSmokeSummaryOrphanRow, listCosRunEventsForRun } from './runCosEvents.js';
import {
  acceptanceResponseHasCallbackMetadataKeys,
  describeTriggerCallbackContractForOps,
  listAutomationResponseOverrideKeys,
} from './cursorCloudAdapter.js';
import {
  EMIT_PATCH_CONTRACT_NAME,
  builderStageLastReachedForEmitPatchPrep,
  classifyEmitPatchAssemblyFailureCode,
} from './livePatchPayload.js';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES, createCosRuntimeSupabase, supabaseAppendOpsSmokeEvent } from './runStoreSupabase.js';
import { getCosRunStoreMode } from './executionRunStore.js';
import { __resetOpsSmokeAttemptSeqForTests } from './opsSmokeAttemptSeq.js';

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
 * Founder tool-loop ops smoke audit: stable session id (env COS_OPS_SMOKE_SESSION_ID or cached smoke_*), never smoke_turn_*.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveOpsSmokeSessionIdForToolAudit(env = process.env) {
  if (!isOpsSmokeEnabled(env)) return null;
  return resolveSmokeSessionId(env);
}

/**
 * @param {{ payload?: Record<string, unknown> }} row
 */
export function getRowAttemptSeq(row) {
  const pl = row?.payload && typeof row.payload === 'object' ? row.payload : {};
  const n = Number(pl.attempt_seq);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

/**
 * @param {Array<{ payload?: Record<string, unknown> }>} rows
 */
export function sessionRowsUseAttemptLineage(rows) {
  return (rows || []).some((r) => getRowAttemptSeq(r) > 0);
}

/**
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function partitionSmokeSessionRowsByAttempt(rows) {
  const useLineage = sessionRowsUseAttemptLineage(rows);
  /** @type {Map<number, Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>>} */
  const byAttempt = new Map();
  for (const r of rows || []) {
    let seq = getRowAttemptSeq(r);
    if (!useLineage) seq = 1;
    else if (seq <= 0) seq = 0;
    if (!byAttempt.has(seq)) byAttempt.set(seq, []);
    byAttempt.get(seq).push(r);
  }
  return { byAttempt, useLineage };
}

function attemptRowsHaveAcceptedTrigger(rows) {
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (String(pl.phase || '') === 'cursor_trigger_recorded' && pl.trigger_ok === true) return true;
  }
  return false;
}

/**
 * @param {Map<number, Array<{ event_type?: string, payload?: Record<string, unknown> }>>} byAttempt
 * @param {boolean} useLineage
 */
export function choosePrimaryAttemptSeqFromPartition(byAttempt, useLineage) {
  if (!useLineage) return 1;
  const seqs = [...byAttempt.keys()].filter((s) => s > 0).sort((a, b) => a - b);
  if (!seqs.length) return 0;
  const accepted = seqs.filter((s) => attemptRowsHaveAcceptedTrigger(byAttempt.get(s) || []));
  if (accepted.length) return accepted[accepted.length - 1];
  return seqs[seqs.length - 1];
}

function primaryRowsLookBlocked(rows) {
  return (rows || []).some((r) => {
    const et = String(r.event_type || '');
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const ph = String(pl.phase || '');
    return (
      et === 'cos_pretrigger_tool_call_blocked' ||
      ph === 'trigger_blocked_invalid_payload' ||
      ph === 'cursor_trigger_failed'
    );
  });
}

/**
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} primaryRows
 */
export function derivePrimaryAttemptStatus(primaryRows) {
  if (attemptRowsHaveAcceptedTrigger(primaryRows)) return 'accepted_trigger';
  if (primaryRowsLookBlocked(primaryRows)) return 'blocked';
  return 'in_progress_or_unknown';
}

/**
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
function extractAcceptanceCallbackMetadataFromRows(rows) {
  let bestAt = '';
  /** @type {boolean | null} */
  let val = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (String(pl.phase || '') !== 'cursor_trigger_recorded') continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      val = typeof pl.acceptance_response_has_callback_metadata === 'boolean' ? pl.acceptance_response_has_callback_metadata : null;
    }
  }
  return val;
}

/**
 * Founder-facing compact lines from a session summary row (primary attempt only; vNext.13.56).
 * @param {Record<string, unknown>} s
 */
export function formatOpsSmokeFounderFacingLines(s) {
  const sid = String(s.smoke_session_id || '').slice(0, 48);
  const pa = s.primary_attempt_seq != null ? String(s.primary_attempt_seq) : '?';
  const ac = s.attempt_count != null ? String(s.attempt_count) : '?';
  const st = String(s.primary_attempt_status || 'unknown');
  const tool = String(s.primary_selected_tool || s.selected_tool || 'n/a');
  const act = String(s.primary_selected_action || s.selected_action || 'n/a');
  const lines = [
    `세션 ${sid} — 주 시도 ${pa}/${ac} (${st})`,
    `실행: ${tool} / ${act}`,
  ];
  if (st === 'accepted_trigger') {
    const ext = s.accepted_external_id != null ? String(s.accepted_external_id) : '';
    lines.push(`트리거 수락 · 외부 식별자: ${ext || '(없음/미추출)'}`);
  } else {
    lines.push(
      `차단·실패: ${String(s.primary_blocked_reason || s.blocked_reason || s.primary_trigger_state || 'n/a').slice(0, 200)}`,
    );
  }
  lines.push(
    `콜백: 아웃바운드_계약=${s.outbound_callback_contract_attached} · 응답_메타=${s.acceptance_response_has_callback_metadata} · 인바운드_관측=${s.inbound_callback_observed}`,
  );
  lines.push(
    s.repository_reflection_observed
      ? '부가(2차): 저장소/깃허브 반사 신호 있음 — 1차 완료로 취급하지 않음.'
      : '부가(2차): 저장소 반사 신호 없음.',
  );
  lines.push(
    s.github_secondary_recovery_observed
      ? `회복(2차·GitHub 푸시): 있음 — ${String(s.github_secondary_recovery_outcome || 'outcome_unknown').slice(0, 120)}`
      : '회복(2차·GitHub 푸시): 없음.',
  );
  return lines.slice(0, 6);
}

/**
 * @param {{
 *   runId: string,
 *   threadKey?: string,
 *   smoke_session_id?: string | null,
 *   phase: string,
 *   detail?: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 *   attempt_seq?: number | null,
 * }} p
 */
export async function recordOpsSmokePhase(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const sid = String(p.smoke_session_id || '').trim() || resolveSmokeSessionId(env);
  const runId = String(p.runId || '').trim();
  if (!sid || !runId) return;

  const detail = p.detail && typeof p.detail === 'object' ? p.detail : {};
  const attemptSeq =
    p.attempt_seq != null && Number(p.attempt_seq) > 0 ? Math.floor(Number(p.attempt_seq)) : null;
  const payload = {
    smoke_session_id: sid,
    phase: String(p.phase || 'unknown'),
    at: new Date().toISOString(),
    thread_key: p.threadKey != null ? String(p.threadKey).slice(0, 200) : null,
    ...detail,
    ...(attemptSeq != null ? { attempt_seq: attemptSeq } : {}),
  };
  await appendCosRunEventForRun(runId, 'ops_smoke_phase', payload, {});
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function getCursorCallbackAbsenceTimeoutSec(env = process.env) {
  const n = Number(String(env.COS_CURSOR_CALLBACK_ABSENCE_TIMEOUT_SEC || '').trim());
  return Number.isFinite(n) && n > 0 ? n : 120;
}

/**
 * Ops-only: durable cursor webhook ingress (safe subset). vNext.13.52
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   smoke_session_id?: string | null,
 *   run_id?: string | null,
 *   thread_key?: string | null,
 *   request_id?: string | null,
 *   request_received?: boolean,
 *   signature_verification_ok: boolean,
 *   json_parse_ok: boolean,
 *   top_level_keys?: string[] | null,
 *   observed_callback_schema_snapshot?: Record<string, unknown> | null,
 *   run_id_candidate_tail?: string | null,
 *   status_candidate_raw?: string | null,
 *   thread_hint_present?: boolean,
 *   packet_hint_present?: boolean,
 *   correlation_outcome: string,
 *   rejection_reason?: string | null,
 *   matched_by?: string | null,
 * }} p
 */
export async function recordCosCursorWebhookIngressSafe(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const sid = String(p.smoke_session_id || '').trim() || resolveSmokeSessionId(env);
  if (!sid) return;

  const at = new Date().toISOString();
  const stRed =
    p.status_candidate_raw != null
      ? stripSecretsAndUrlsFromString(String(p.status_candidate_raw), 120)
      : null;
  /** @type {Record<string, unknown> | null} */
  let snap =
    p.observed_callback_schema_snapshot && typeof p.observed_callback_schema_snapshot === 'object'
      ? { ...p.observed_callback_schema_snapshot }
      : null;
  if (snap && 'status_candidate_raw' in snap) delete snap.status_candidate_raw;
  const payload = {
    smoke_session_id: sid,
    source: 'cursor',
    at,
    request_received: p.request_received !== false,
    signature_verification_ok: Boolean(p.signature_verification_ok),
    json_parse_ok: Boolean(p.json_parse_ok),
    top_level_keys: Array.isArray(p.top_level_keys) ? p.top_level_keys.map(String).slice(0, 40) : null,
    observed_callback_schema_snapshot: snap,
    run_id_candidate_tail: p.run_id_candidate_tail != null ? String(p.run_id_candidate_tail).slice(0, 32) : null,
    status_candidate_redacted: stRed,
    thread_hint_present: Boolean(p.thread_hint_present),
    packet_hint_present: Boolean(p.packet_hint_present),
    correlation_outcome: String(p.correlation_outcome || 'unknown').slice(0, 80),
    rejection_reason: p.rejection_reason != null ? String(p.rejection_reason).slice(0, 120) : null,
    matched_by: p.matched_by != null ? String(p.matched_by).slice(0, 80) : null,
    request_id_suffix: p.request_id != null ? String(p.request_id).slice(-12) : null,
  };

  const runId = String(p.run_id || '').trim();
  const threadKey = p.thread_key != null ? String(p.thread_key).slice(0, 200) : null;
  const mode = getCosRunStoreMode();

  if (runId) {
    await appendCosRunEventForRun(runId, 'cos_cursor_webhook_ingress_safe', payload, {});
    return;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (sb) {
      await supabaseAppendOpsSmokeEvent(sb, {
        smoke_session_id: sid,
        run_id: null,
        thread_key: threadKey,
        event_type: 'cos_cursor_webhook_ingress_safe',
        payload,
      });
    }
    return;
  }
  await appendSmokeSummaryOrphanRow({
    event_type: 'cos_cursor_webhook_ingress_safe',
    payload,
    created_at: at,
  });
}

/**
 * GitHub check_run / issues etc. as secondary evidence only (vNext.13.52).
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   smoke_session_id?: string | null,
 *   run_id?: string | null,
 *   thread_key?: string | null,
 *   match_attempted: boolean,
 *   matched: boolean,
 *   github_event_header?: string | null,
 *   object_type?: string | null,
 *   object_id?: string | null,
 *   github_secondary_recovery?: boolean,
 *   secondary_recovery_outcome?: string | null,
 * }} p
 */
export async function recordOpsSmokeGithubFallbackEvidence(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const sid = String(p.smoke_session_id || '').trim() || resolveSmokeSessionId(env);
  if (!sid) return;

  const at = new Date().toISOString();
  const oid = p.object_id != null ? String(p.object_id).trim() : '';
  const payload = {
    smoke_session_id: sid,
    at,
    github_fallback_signal_seen: true,
    github_fallback_match_attempted: Boolean(p.match_attempted),
    github_fallback_matched: Boolean(p.matched),
    github_event_header: p.github_event_header != null ? String(p.github_event_header).slice(0, 64) : null,
    object_type: p.object_type != null ? String(p.object_type).slice(0, 64) : null,
    object_id_tail: oid.length > 8 ? oid.slice(-8) : oid,
    ...(p.github_secondary_recovery === true
      ? {
          github_secondary_recovery: true,
          secondary_recovery_outcome:
            p.secondary_recovery_outcome != null ? String(p.secondary_recovery_outcome).slice(0, 120) : null,
        }
      : {}),
  };

  const runId = String(p.run_id || '').trim();
  const mode = getCosRunStoreMode();

  if (runId) {
    await appendCosRunEventForRun(runId, 'cos_github_fallback_evidence', payload, {});
    return;
  }
  if (mode === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (sb) {
      await supabaseAppendOpsSmokeEvent(sb, {
        smoke_session_id: sid,
        run_id: null,
        thread_key: p.thread_key != null ? String(p.thread_key).slice(0, 512) : null,
        event_type: 'cos_github_fallback_evidence',
        payload,
      });
    }
    return;
  }
  await appendSmokeSummaryOrphanRow({
    event_type: 'cos_github_fallback_evidence',
    payload,
    created_at: at,
  });
}

/**
 * Supervisor backstop: classify "no verified cursor ingress" after accepted trigger + timeout.
 * @param {{ runId: string, threadKey?: string, env?: NodeJS.ProcessEnv }} p
 */
const CALLBACK_ABSENCE_PHASES = new Set([
  'cursor_callback_absent_within_timeout',
  'cursor_callback_absent_despite_callback_contract',
  'cursor_callback_absent_without_callback_contract',
]);

export async function maybeRecordOpsSmokeCursorCallbackAbsence(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  if (!runId) return;

  const events = await listCosRunEventsForRun(runId, 500);
  const seenAbsence = events.some((e) => {
    if (String(e.event_type || '') !== 'ops_smoke_phase') return false;
    const pl = e.payload && typeof e.payload === 'object' ? e.payload : {};
    return CALLBACK_ABSENCE_PHASES.has(String(pl.phase || ''));
  });
  if (seenAbsence) return;

  let pendingAt = '';
  let smokeSid = '';
  /** @type {boolean | null} */
  let contractPresent = null;
  for (const e of events) {
    if (String(e.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = e.payload && typeof e.payload === 'object' ? e.payload : {};
    if (String(pl.phase || '') !== 'trigger_accepted_callback_pending') continue;
    const at = String(pl.at || e.created_at || '');
    const sid = String(pl.smoke_session_id || '').trim();
    if (at && (!pendingAt || at.localeCompare(pendingAt) < 0)) {
      pendingAt = at;
      if (sid) smokeSid = sid;
      const det = pl.detail && typeof pl.detail === 'object' ? pl.detail : {};
      const ccp =
        typeof pl.callback_contract_present === 'boolean'
          ? pl.callback_contract_present
          : typeof det.callback_contract_present === 'boolean'
            ? det.callback_contract_present
            : null;
      contractPresent = ccp;
    }
  }
  if (!pendingAt || !smokeSid) return;

  const timeoutSec = getCursorCallbackAbsenceTimeoutSec(env);
  const deadline = new Date(new Date(pendingAt).getTime() + timeoutSec * 1000).toISOString();
  const nowIso = new Date().toISOString();
  if (nowIso < deadline) return;

  let sawVerifiedIngress = false;
  for (const e of events) {
    if (String(e.event_type || '') !== 'cos_cursor_webhook_ingress_safe') continue;
    const pl = e.payload && typeof e.payload === 'object' ? e.payload : {};
    if (String(pl.smoke_session_id || '').trim() !== smokeSid) continue;
    const at = String(pl.at || e.created_at || '');
    if (at && at.localeCompare(pendingAt) < 0) continue;
    if (
      pl.signature_verification_ok === true &&
      pl.json_parse_ok === true &&
      String(pl.correlation_outcome || '') !== 'rejected_invalid_signature' &&
      String(pl.correlation_outcome || '') !== 'rejected_invalid_json'
    ) {
      sawVerifiedIngress = true;
      break;
    }
  }
  if (sawVerifiedIngress) return;

  const phase =
    contractPresent === true
      ? 'cursor_callback_absent_despite_callback_contract'
      : contractPresent === false
        ? 'cursor_callback_absent_without_callback_contract'
        : 'cursor_callback_absent_within_timeout';
  await recordOpsSmokePhase({
    env,
    runId,
    threadKey: p.threadKey,
    smoke_session_id: smokeSid || undefined,
    phase,
    detail: {
      timeout_sec: timeoutSec,
      pending_since_at: pendingAt,
      classification:
        phase === 'cursor_callback_absent_despite_callback_contract'
          ? 'no_verified_cursor_callback_despite_outbound_callback_contract'
          : phase === 'cursor_callback_absent_without_callback_contract'
            ? 'no_verified_cursor_callback_trigger_had_no_callback_contract'
            : 'no_verified_cursor_callback_within_timeout',
      callback_contract_present: contractPresent,
    },
  });
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
  const hasAcc =
    t.has_accepted_external_id === true ||
    (t.accepted_external_id != null && String(t.accepted_external_id).trim() !== '');
  return {
    response_top_level_keys: keys,
    accepted_response_top_level_keys: keys,
    http_status: typeof t.status === 'number' ? t.status : null,
    trigger_status: t.trigger_status != null ? String(t.trigger_status).slice(0, 80) : null,
    external_run_id_tail: tailExternalRunId(t.external_run_id),
    accepted_external_id_tail: tailExternalRunId(t.accepted_external_id),
    status_extracted:
      t.automation_status_raw != null
        ? stripSecretsAndUrlsFromString(String(t.automation_status_raw), 120)
        : null,
    branch_present: Boolean(t.automation_branch_raw != null && String(t.automation_branch_raw).trim()),
    url_present: Boolean(extUrl),
    has_run_id: Boolean(hasRun),
    has_status: Boolean(hasStat),
    has_url: Boolean(hasUrl),
    has_accepted_external_id: Boolean(hasAcc),
    selected_run_id_field_name:
      t.selected_run_id_field_name != null ? String(t.selected_run_id_field_name).slice(0, 120) : null,
    selected_status_field_name:
      t.selected_status_field_name != null ? String(t.selected_status_field_name).slice(0, 120) : null,
    selected_url_field_name:
      t.selected_url_field_name != null ? String(t.selected_url_field_name).slice(0, 120) : null,
    selected_accepted_id_field_name:
      t.selected_accepted_id_field_name != null
        ? String(t.selected_accepted_id_field_name).slice(0, 120)
        : null,
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
  'trigger_outbound_callback_contract',
  'cursor_trigger_recorded',
  'trigger_sent_without_callback_contract',
  'trigger_accepted_external_id_present',
  'trigger_accepted_external_id_missing',
  'trigger_accepted_external_run_id_absent',
  'trigger_accepted_callback_pending',
  'cursor_callback_absent_despite_callback_contract',
  'cursor_callback_absent_without_callback_contract',
  'cursor_callback_absent_within_timeout',
  'cursor_callback_observed_no_match',
  'cursor_direct_callback_correlated',
  'external_run_id_extracted',
  'external_callback_matched',
  'github_fallback_evidence',
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
  'trigger_accepted_external_id_present',
  'trigger_accepted_external_id_missing',
]);

function smokeSummaryPhaseFromRow(r) {
  const et = String(r.event_type || '');
  const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
  if (et === 'ops_smoke_phase' && pl.phase) return String(pl.phase);
  if (et === 'cos_pretrigger_tool_call' || et === 'cos_pretrigger_tool_call_blocked') return et;
  if (OPS_PHASE_LIKE_EVENT_TYPES.has(et)) return et;
  if (et === 'cos_github_fallback_evidence') return 'github_fallback_evidence';
  if (et === 'cos_cursor_webhook_ingress_safe') {
    const o = String(pl.correlation_outcome || '');
    if (o === 'no_match') return 'cursor_callback_observed_no_match';
    if (o === 'matched') return 'cursor_direct_callback_correlated';
    if (o === 'ignored_insufficient_payload') return 'cursor_callback_ingress_insufficient_payload';
    if (o === 'rejected_invalid_signature' || o === 'rejected_invalid_json') return 'cursor_callback_ingress_rejected';
    return 'cursor_direct_callback_ingress_received';
  }
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
  if (seen.has('cursor_trigger_recorded') && !seen.has('external_run_id_extracted')) {
    if (seen.has('trigger_accepted_external_id_present')) {
      final_status = 'trigger_accepted_external_id_present';
      breaksAt = 'external_run_id_extracted';
    } else if (seen.has('trigger_accepted_external_id_missing')) {
      final_status = 'trigger_accepted_external_id_missing';
      breaksAt = 'external_run_id_extracted';
    } else if (seen.has('trigger_accepted_external_run_id_absent')) {
      final_status = 'trigger_accepted_external_run_id_missing';
      breaksAt = 'external_run_id_extracted';
    }
  }

  if (seen.has('cursor_callback_absent_despite_callback_contract')) {
    final_status = 'cursor_callback_absent_despite_callback_contract';
    breaksAt = 'external_callback_matched';
  } else if (seen.has('cursor_callback_absent_without_callback_contract')) {
    final_status = 'cursor_callback_absent_without_callback_contract';
    breaksAt = 'external_callback_matched';
  } else if (seen.has('cursor_callback_absent_within_timeout')) {
    final_status = 'cursor_callback_absent_within_timeout';
    breaksAt = 'external_callback_matched';
  } else if (seen.has('cursor_callback_observed_no_match') && !seen.has('external_callback_matched')) {
    final_status = 'cursor_callback_observed_no_match';
    breaksAt = 'external_callback_matched';
  }

  if (final_status === 'unknown') {
    if (!breaksAt) final_status = 'full_pipeline_observed';
    else if (breaksAt === 'cursor_trigger_recorded') final_status = 'before_trigger';
    else final_status = `partial_stopped_before_${breaksAt}`;
  }

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
    selected_accepted_id_field_name: null,
    has_run_id: null,
    has_status: null,
    has_url: null,
    has_accepted_external_id: null,
    accepted_external_id: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestTrigger = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const ph = String(pl.phase || '');
    if (
      ph !== 'cursor_trigger_recorded' &&
      ph !== 'trigger_accepted_external_run_id_absent' &&
      ph !== 'trigger_accepted_external_id_present' &&
      ph !== 'trigger_accepted_external_id_missing'
    )
      continue;
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
    has_accepted_external_id:
      bestTrigger.has_accepted_external_id != null ? Boolean(bestTrigger.has_accepted_external_id) : null,
    selected_accepted_id_field_name:
      bestTrigger.selected_accepted_id_field_name != null
        ? String(bestTrigger.selected_accepted_id_field_name).slice(0, 120)
        : null,
    accepted_external_id:
      bestTrigger.accepted_external_id_tail != null
        ? String(bestTrigger.accepted_external_id_tail).slice(0, 32)
        : null,
  };
}

/**
 * Latest direct Cursor webhook ingress row for ops session summary (safe subset only).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractLatestCursorWebhookIngressFromRows(rows) {
  const empty = {
    cursor_callback_observed: null,
    observed_callback_schema_snapshot: null,
    cursor_ingress_correlation_outcome: null,
    cursor_ingress_signature_ok: null,
    cursor_ingress_json_ok: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let best = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'cos_cursor_webhook_ingress_safe') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const t = String(pl.at || r.created_at || '');
    if (t >= bestAt) {
      bestAt = t;
      best = pl;
    }
  }
  if (!best) return empty;
  const co = String(best.correlation_outcome || '');
  const verified =
    best.signature_verification_ok === true &&
    best.json_parse_ok === true &&
    co !== 'rejected_invalid_signature' &&
    co !== 'rejected_invalid_json';
  return {
    cursor_callback_observed: verified,
    observed_callback_schema_snapshot:
      best.observed_callback_schema_snapshot && typeof best.observed_callback_schema_snapshot === 'object'
        ? best.observed_callback_schema_snapshot
        : null,
    cursor_ingress_correlation_outcome: co || null,
    cursor_ingress_signature_ok: best.signature_verification_ok === true,
    cursor_ingress_json_ok: best.json_parse_ok === true,
  };
}

/**
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractGithubFallbackSummaryFromRows(rows) {
  const empty = {
    github_fallback_signal_seen: null,
    github_fallback_match_attempted: null,
    github_fallback_matched: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let best = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'cos_github_fallback_evidence') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const t = String(pl.at || r.created_at || '');
    if (t >= bestAt) {
      bestAt = t;
      best = pl;
    }
  }
  if (!best) return empty;
  return {
    github_fallback_signal_seen: best.github_fallback_signal_seen === true,
    github_fallback_match_attempted: best.github_fallback_match_attempted === true,
    github_fallback_matched: best.github_fallback_matched === true,
  };
}

/**
 * vNext.13.58 — GitHub push secondary result recovery (distinct from generic github_fallback advisory rows).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractResultRecoveryGithubSecondaryFromRows(rows) {
  const empty = {
    github_secondary_recovery_observed: false,
    github_secondary_recovery_outcome: null,
  };
  let bestAt = '';
  /** @type {string | null} */
  let outcome = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'result_recovery_github_secondary') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const t = String(pl.at || r.created_at || '');
    if (t >= bestAt) {
      bestAt = t;
      outcome = pl.recovery_outcome != null ? String(pl.recovery_outcome) : null;
    }
  }
  if (!bestAt) return empty;
  return {
    github_secondary_recovery_observed: true,
    github_secondary_recovery_outcome: outcome,
  };
}

/**
 * Latest trigger_outbound_callback_contract row (safe subset fields on payload).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractLatestCallbackContractEvidenceFromRows(rows) {
  const empty = {
    callback_contract_present: null,
    callback_url_field_name: null,
    callback_secret_field_name: null,
    callback_hints_field_names: null,
    callback_url_path_only: null,
    callback_secret_present: null,
    selected_trigger_endpoint_family: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let best = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (String(pl.phase || '') !== 'trigger_outbound_callback_contract') continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      best = pl;
    }
  }
  if (!best) return empty;
  const hints = Array.isArray(best.callback_hints_field_names)
    ? best.callback_hints_field_names.map(String).slice(0, 12)
    : null;
  return {
    callback_contract_present:
      best.callback_contract_present === true ? true : best.callback_contract_present === false ? false : null,
    callback_url_field_name:
      best.callback_url_field_name != null ? String(best.callback_url_field_name).slice(0, 120) : null,
    callback_secret_field_name:
      best.callback_secret_field_name != null ? String(best.callback_secret_field_name).slice(0, 120) : null,
    callback_hints_field_names: hints,
    callback_url_path_only:
      best.callback_url_path_only != null ? String(best.callback_url_path_only).slice(0, 200) : null,
    callback_secret_present: best.callback_secret_present === true ? true : best.callback_secret_present === false ? false : null,
    selected_trigger_endpoint_family:
      best.selected_trigger_endpoint_family != null
        ? String(best.selected_trigger_endpoint_family).slice(0, 80)
        : null,
  };
}

/**
 * Latest successful cursor_trigger_recorded invoke (primary accepted automation path).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractPrimaryAcceptedTriggerInvokeFromRows(rows) {
  let bestAt = '';
  /** @type {{ invoked_tool: string | null, invoked_action: string | null, trigger_ok: boolean } | null} */
  let best = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (String(pl.phase || '') !== 'cursor_trigger_recorded') continue;
    if (pl.trigger_ok !== true) continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      best = {
        invoked_tool: pl.invoked_tool != null ? String(pl.invoked_tool) : null,
        invoked_action: pl.invoked_action != null ? String(pl.invoked_action) : null,
        trigger_ok: true,
      };
    }
  }
  return best;
}

/**
 * Latest non-blocked pretrigger observe row (secondary to accepted trigger when both exist).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractLatestNonBlockedPretriggerSummaryFromRows(rows) {
  let bestAt = '';
  /** @type {{ selected_tool: string | null, selected_action: string | null } | null} */
  let best = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'cos_pretrigger_tool_call') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      best = {
        selected_tool: pl.selected_tool != null ? String(pl.selected_tool) : null,
        selected_action: pl.selected_action != null ? String(pl.selected_action) : null,
      };
    }
  }
  return best;
}

/**
 * All blocked pretrigger rows in session (chronological).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 * @param {{ useLineage?: boolean, primaryAttemptSeq?: number }} [opts]
 */
export function extractSecondaryBlockedActionsFromRows(rows, opts = {}) {
  const useLineage = opts.useLineage === true;
  const primaryAttemptSeq = opts.primaryAttemptSeq > 0 ? opts.primaryAttemptSeq : 0;
  /** @type {{ at: string, entry: Record<string, unknown> }[]} */
  const tmp = [];
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'cos_pretrigger_tool_call_blocked') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const seq = getRowAttemptSeq(r);
    if (useLineage && primaryAttemptSeq > 0) {
      if (seq === primaryAttemptSeq || seq <= 0) continue;
    }
    const at = String(pl.at || r.created_at || '');
    tmp.push({
      at,
      entry: {
        attempt_seq: seq > 0 ? seq : null,
        selected_tool: pl.selected_tool != null ? String(pl.selected_tool) : null,
        selected_action: pl.selected_action != null ? String(pl.selected_action) : null,
        blocked_reason: pl.blocked_reason != null ? String(pl.blocked_reason).slice(0, 120) : null,
        machine_hint: pl.machine_hint != null ? String(pl.machine_hint).slice(0, 200) : null,
        exact_failure_code: pl.exact_failure_code != null ? String(pl.exact_failure_code).slice(0, 120) : null,
        payload_provenance: pl.payload_provenance != null ? String(pl.payload_provenance).slice(0, 120) : null,
        builder_stage_last_reached:
          pl.builder_stage_last_reached != null ? String(pl.builder_stage_last_reached).slice(0, 120) : null,
      },
    });
  }
  tmp.sort((a, b) => a.at.localeCompare(b.at));
  return tmp.map((t) => t.entry);
}

/**
 * Latest emit_patch lineage fields from ops_smoke_phase rows (payload_origin on phase payload).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 */
export function extractLatestEmitPatchLineageFromOpsRows(rows) {
  let bestAt = '';
  /** @type {{ payload_origin: string | null, builder_stage_last_reached: string | null, exact_failure_code: string | null }} */
  const out = {
    payload_origin: null,
    builder_stage_last_reached: null,
    exact_failure_code: null,
  };
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (
      pl.payload_origin == null &&
      pl.builder_stage_last_reached == null &&
      pl.exact_failure_code == null
    )
      continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      if (pl.payload_origin != null) out.payload_origin = String(pl.payload_origin).slice(0, 120);
      if (pl.builder_stage_last_reached != null) {
        out.builder_stage_last_reached = String(pl.builder_stage_last_reached).slice(0, 120);
      }
      if (pl.exact_failure_code != null) out.exact_failure_code = String(pl.exact_failure_code).slice(0, 120);
    }
  }
  return out;
}

/**
 * @param {{ phases_seen?: string[], final_status?: string }} agg
 */
export function inferSelectedExecutionLaneFromAgg(agg) {
  const seen = new Set(Array.isArray(agg?.phases_seen) ? agg.phases_seen : []);
  if (seen.has('cursor_trigger_recorded')) return 'cloud_trigger_attempted';
  if (seen.has('emit_patch_payload_validated')) return 'cloud_emit_patch_contract_ok';
  if (seen.has('trigger_blocked_invalid_payload')) return 'cloud_emit_patch_assembly_failed';
  if (seen.has('live_payload_compilation_started')) return 'cloud_emit_patch_compilation_observed';
  const fs = String(agg?.final_status || '');
  if (fs === 'pre_trigger_blocked_invalid_payload') return 'pre_trigger_validation';
  return 'unknown';
}

/**
 * @param {string | null | undefined} final_status
 */
export function callbackAbsenceClassificationFromFinalStatus(final_status) {
  const fs = String(final_status || '');
  if (fs === 'cursor_callback_absent_despite_callback_contract') return 'absent_despite_contract';
  if (fs === 'cursor_callback_absent_without_callback_contract') return 'absent_without_contract';
  if (fs === 'cursor_callback_absent_within_timeout') return 'absent_timeout_legacy_unknown';
  return 'not_callback_absence';
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
    invalid_enum_fields: null,
    invalid_nested_fields: null,
    delegate_schema_valid: null,
    delegate_schema_error_fields: null,
    parent_smoke_session_id: null,
    exact_failure_code: null,
    payload_provenance: null,
    builder_stage_last_reached: null,
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
  const invE = Array.isArray(pl.invalid_enum_fields) ? pl.invalid_enum_fields.map(String) : null;
  const invN = Array.isArray(pl.invalid_nested_fields) ? pl.invalid_nested_fields.map(String) : null;
  const dErr = Array.isArray(pl.delegate_schema_error_fields)
    ? pl.delegate_schema_error_fields.map(String).slice(0, 48)
    : null;
  const dValid =
    pl.delegate_schema_valid === true || pl.delegate_schema_valid === false ? pl.delegate_schema_valid : null;
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
    invalid_enum_fields: invE,
    invalid_nested_fields: invN,
    delegate_schema_valid: dValid,
    delegate_schema_error_fields: dErr,
    parent_smoke_session_id:
      pl.parent_smoke_session_id != null ? String(pl.parent_smoke_session_id).slice(0, 120) : null,
    exact_failure_code: pl.exact_failure_code != null ? String(pl.exact_failure_code).slice(0, 120) : null,
    payload_provenance: pl.payload_provenance != null ? String(pl.payload_provenance).slice(0, 120) : null,
    builder_stage_last_reached:
      pl.builder_stage_last_reached != null ? String(pl.builder_stage_last_reached).slice(0, 120) : null,
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
    const { byAttempt, useLineage } = partitionSmokeSessionRowsByAttempt(rows);
    const primarySeq = choosePrimaryAttemptSeqFromPartition(byAttempt, useLineage);
    const primaryRows =
      useLineage && primarySeq > 0
        ? byAttempt.get(primarySeq) || []
        : !useLineage
          ? byAttempt.get(1) || rows
          : rows;

    const machine = extractOpsSmokeMachineSummaryFromRows(primaryRows);
    const triggerEv = extractLatestTriggerEvidenceFromRows(primaryRows);
    const cursorIngress = extractLatestCursorWebhookIngressFromRows(rows);
    const ghFb = extractGithubFallbackSummaryFromRows(rows);
    const recoveryGh = extractResultRecoveryGithubSecondaryFromRows(rows);
    const cbContract = extractLatestCallbackContractEvidenceFromRows(primaryRows);
    const primaryInvoke = extractPrimaryAcceptedTriggerInvokeFromRows(primaryRows);
    const preNonBlocked = extractLatestNonBlockedPretriggerSummaryFromRows(primaryRows);
    const secondary_blocked_actions = extractSecondaryBlockedActionsFromRows(rows, {
      useLineage,
      primaryAttemptSeq: primarySeq,
    });
    const opsLineage = extractLatestEmitPatchLineageFromOpsRows(primaryRows);
    const primary_selected_tool =
      primaryInvoke?.trigger_ok === true && primaryInvoke.invoked_tool
        ? primaryInvoke.invoked_tool
        : preNonBlocked?.selected_tool ?? machine.selected_tool;
    const primary_selected_action =
      primaryInvoke?.trigger_ok === true && primaryInvoke.invoked_action
        ? primaryInvoke.invoked_action
        : preNonBlocked?.selected_action ?? machine.selected_action;
    const emitPatchPrimary =
      primaryInvoke?.trigger_ok === true && String(primaryInvoke?.invoked_action || '') === 'emit_patch';
    const delegateSchemaPass = primaryRows.some((r) => {
      const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
      return (
        String(r.event_type || '') === 'ops_smoke_phase' &&
        (pl.phase === 'emit_patch_payload_validated' || pl.phase === 'delegate_packets_ready')
      );
    });
    const delegate_schema_valid =
      machine.delegate_schema_valid === false
        ? false
        : delegateSchemaPass
          ? true
          : machine.delegate_schema_valid;

    const attempt_count = useLineage ? [...byAttempt.keys()].filter((s) => s > 0).length || 1 : 1;
    const acceptanceMeta = extractAcceptanceCallbackMetadataFromRows(primaryRows);
    const outbound_callback_contract_attached = cbContract.callback_contract_present === true;
    const acceptance_response_has_callback_metadata = acceptanceMeta === true;
    const inbound_callback_observed = cursorIngress.cursor_callback_observed === true;
    const repository_reflection_observed = ghFb.github_fallback_signal_seen === true;

    /** @type {{ attempt_seq: number, status: string }[]} */
    const secondary_attempts = [];
    if (useLineage && primarySeq > 0) {
      for (const s of [...byAttempt.keys()].filter((x) => x > 0).sort((a, b) => a - b)) {
        if (s === primarySeq) continue;
        const sub = byAttempt.get(s) || [];
        let status = 'other';
        if (attemptRowsHaveAcceptedTrigger(sub)) status = 'accepted_trigger';
        else if (primaryRowsLookBlocked(sub)) status = 'blocked';
        secondary_attempts.push({ attempt_seq: s, status });
      }
    }

    const primary_attempt_status = derivePrimaryAttemptStatus(primaryRows);
    const primary_payload_origin = machine.payload_provenance ?? opsLineage.payload_origin ?? null;
    const primary_payload_top_level_keys = machine.payload_top_level_keys ?? null;
    const primary_delegate_schema_valid = delegate_schema_valid;
    const primary_missing_required_fields = machine.missing_required_fields ?? null;
    const primary_blocked_reason =
      emitPatchPrimary ? null : machine.blocked_reason != null ? machine.blocked_reason : null;

    const lastAt = rows.reduce((m, r) => {
      const t1 = String(r.payload?.at || '');
      const t2 = String(r.created_at || '');
      const best = t1 > t2 ? t1 : t2;
      return best > m ? best : m;
    }, '');

    const base = {
      smoke_session_id,
      run_id,
      lastAt,
      ...machine,
      selected_tool: primary_selected_tool ?? machine.selected_tool,
      selected_action: primary_selected_action ?? machine.selected_action,
      blocked_reason: emitPatchPrimary ? null : machine.blocked_reason,
      machine_hint: emitPatchPrimary ? null : machine.machine_hint,
      primary_selected_tool: primary_selected_tool ?? machine.selected_tool,
      primary_selected_action: primary_selected_action ?? machine.selected_action,
      primary_trigger_state: agg.final_status,
      secondary_blocked_actions,
      selected_execution_lane: inferSelectedExecutionLaneFromAgg(agg),
      payload_origin: primary_payload_origin,
      builder_stage_last_reached: machine.builder_stage_last_reached ?? opsLineage.builder_stage_last_reached,
      exact_failure_code: machine.exact_failure_code ?? opsLineage.exact_failure_code,
      callback_absence_classification: callbackAbsenceClassificationFromFinalStatus(agg.final_status),
      delegate_schema_valid,
      ...cbContract,
      ...triggerEv,
      ...cursorIngress,
      ...ghFb,
      ...agg,
      primary_attempt_seq: primarySeq > 0 ? primarySeq : null,
      attempt_count,
      primary_attempt_status,
      primary_payload_top_level_keys,
      primary_payload_origin,
      primary_delegate_schema_valid,
      primary_missing_required_fields,
      primary_blocked_reason,
      outbound_callback_contract_attached,
      acceptance_response_has_callback_metadata,
      inbound_callback_observed,
      repository_reflection_observed,
      github_secondary_recovery_observed: recoveryGh.github_secondary_recovery_observed,
      github_secondary_recovery_outcome: recoveryGh.github_secondary_recovery_outcome,
      secondary_attempts,
    };
    return {
      ...base,
      founder_facing_report_lines: formatOpsSmokeFounderFacingLines(base),
    };
  });
  sessions.sort((a, b) => String(b.lastAt).localeCompare(String(a.lastAt)));
  return sessions.slice(0, sessionLimit);
}

/**
 * Ops evidence: safe subset of outbound callback contract immediately before Cursor automation POST.
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   smoke_session_id?: string | null,
 *   invoked_tool?: string | null,
 *   invoked_action?: string | null,
 *   attempt_seq?: number | null,
 * }} p
 */
export async function recordOpsSmokeTriggerCallbackContract(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId || !threadKey) return;
  const smokeSid = String(p.smoke_session_id || '').trim() || null;
  const contract = describeTriggerCallbackContractForOps(env);
  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    smoke_session_id: smokeSid || undefined,
    attempt_seq: p.attempt_seq,
    phase: 'trigger_outbound_callback_contract',
    detail: {
      invoked_tool: p.invoked_tool != null ? String(p.invoked_tool).slice(0, 32) : null,
      invoked_action: p.invoked_action != null ? String(p.invoked_action).slice(0, 48) : null,
      ...contract,
      cursor_automation_side_effects_policy:
        'git_reflection_branch_push_pr_are_secondary; primary_completion_is_cos_callback_delivery_or_callback_metadata_unavailable_proof',
    },
  });
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   smoke_session_id?: string | null,
 *   tr: Record<string, unknown> | null,
 *   invoked_tool?: string | null,
 *   invoked_action?: string | null,
 *   callback_contract?: Record<string, unknown> | null,
 *   attempt_seq?: number | null,
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
  const cc =
    p.callback_contract && typeof p.callback_contract === 'object' && !Array.isArray(p.callback_contract)
      ? /** @type {Record<string, unknown>} */ (p.callback_contract)
      : describeTriggerCallbackContractForOps(env);
  const ccPresent = cc.callback_contract_present === true;
  const acceptance_response_has_callback_metadata = ok ? acceptanceResponseHasCallbackMetadataKeys(tr, env) : false;

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    smoke_session_id: smokeSid || undefined,
    attempt_seq: p.attempt_seq,
    phase: ok ? 'cursor_trigger_recorded' : 'cursor_trigger_failed',
    detail: {
      trigger: buildSafeTriggerSmokeDetail(tr, env),
      trigger_ok: ok,
      acceptance_response_has_callback_metadata,
      invoked_tool: p.invoked_tool != null ? String(p.invoked_tool).slice(0, 32) : null,
      invoked_action: p.invoked_action != null ? String(p.invoked_action).slice(0, 48) : null,
      callback_contract: {
        callback_contract_present: Boolean(cc.callback_contract_present),
        callback_url_field_name: cc.callback_url_field_name != null ? String(cc.callback_url_field_name) : null,
        callback_secret_field_name:
          cc.callback_secret_field_name != null ? String(cc.callback_secret_field_name) : null,
        callback_hints_field_names: Array.isArray(cc.callback_hints_field_names)
          ? cc.callback_hints_field_names.map(String).slice(0, 12)
          : null,
        callback_url_path_only:
          cc.callback_url_path_only != null ? String(cc.callback_url_path_only).slice(0, 200) : null,
        callback_secret_present: cc.callback_secret_present === true,
        selected_trigger_endpoint_family:
          cc.selected_trigger_endpoint_family != null ? String(cc.selected_trigger_endpoint_family) : null,
      },
    },
  });

  if (ok && !ext) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: 'trigger_accepted_external_run_id_absent',
      detail: {
        trigger: buildSafeTriggerSmokeDetail(tr, env),
      },
    });
  }

  if (ok) {
    const hasAcc = Boolean(
      tr &&
        (tr.has_accepted_external_id === true ||
          (tr.accepted_external_id != null && String(tr.accepted_external_id).trim() !== '')),
    );
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: hasAcc ? 'trigger_accepted_external_id_present' : 'trigger_accepted_external_id_missing',
      detail: {
        trigger: buildSafeTriggerSmokeDetail(tr, env),
      },
    });
    if (hasAcc && !ext) {
      await recordOpsSmokePhase({
        env,
        runId,
        threadKey,
        smoke_session_id: smokeSid || undefined,
        attempt_seq: p.attempt_seq,
        phase: 'trigger_accepted_callback_pending',
        detail: {
          trigger: buildSafeTriggerSmokeDetail(tr, env),
          callback_contract_present: ccPresent,
          machine_note:
            'trigger_accepted; awaiting verified direct cursor webhook; github evidence is advisory only',
        },
      });
      if (!ccPresent) {
        await recordOpsSmokePhase({
          env,
          runId,
          threadKey,
          smoke_session_id: smokeSid || undefined,
          attempt_seq: p.attempt_seq,
          phase: 'trigger_sent_without_callback_contract',
          detail: {
            callback_contract_present: false,
            classification: 'trigger_sent_without_callback_contract',
          },
        });
      }
    }
  }

  if (ok && ext) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
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
 *   merge_from_delegate?: boolean,
 *   attempt_seq?: number | null,
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
  const mergeFromDelegate = p.merge_from_delegate === true;
  const exact_failure_code = classifyEmitPatchAssemblyFailureCode(prep, mergeFromDelegate);
  const builder_stage_last_reached = builderStageLastReachedForEmitPatchPrep(prep);
  const payload_origin = mergeFromDelegate ? 'delegate_stash_merged' : 'invoke_external_tool_raw';

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    smoke_session_id: smokeSid || undefined,
    attempt_seq: p.attempt_seq,
    phase: 'live_payload_compilation_started',
    detail: {
      selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
      compilation_mode: prep.compilation,
      payload_origin,
      builder_stage_last_reached,
    },
  });

  if (prep.compilation === 'narrow') {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: 'delegate_packets_ready',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
        payload_origin,
        builder_stage_last_reached,
      },
    });
  }

  if (prep.narrow_incomplete) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: 'live_payload_compilation_failed',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        blocked_reason_code: 'narrow_live_patch_incomplete',
        exact_failure_code,
        payload_origin,
        builder_stage_last_reached,
      },
    });
  }

  if (prep.cloud_ok) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: 'emit_patch_payload_validated',
      detail: {
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
        payload_origin,
        builder_stage_last_reached,
      },
    });
  }

  if (!prep.cloud_ok) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      smoke_session_id: smokeSid || undefined,
      attempt_seq: p.attempt_seq,
      phase: 'trigger_blocked_invalid_payload',
      detail: {
        blocked_reason_code: 'emit_patch_contract_not_met',
        exact_failure_code,
        missing_required_fields: (prep.validation.missing_required_fields || []).slice(0, 24),
        selected_live_contract_name: EMIT_PATCH_CONTRACT_NAME,
        compilation_mode: prep.compilation,
        payload_origin,
        builder_stage_last_reached,
      },
    });
  }
}

export function __resetOpsSmokeSessionCacheForTests() {
  cachedSessionId = null;
  __resetOpsSmokeAttemptSeqForTests();
}
