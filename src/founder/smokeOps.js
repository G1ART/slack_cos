/**
 * Ops-only Cursor cloud smoke evidence (vNext.13.42). No founder UX.
 * Stores safe subsets in cos_run_events as event_type ops_smoke_phase when COS_OPS_SMOKE_ENABLED=1.
 */

import crypto from 'node:crypto';
import { appendCosRunEventForRun, appendSmokeSummaryOrphanRow, listCosRunEventsForRun } from './runCosEvents.js';
import {
  acceptanceResponseHasCallbackMetadataKeys,
  deriveOutboundCallbackContractReason,
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
import {
  buildSmokeSessionBucketsFromFlatRows,
  ensureOpsSmokeSessionIdOnRunHarness,
  filterRowsForSessionAggregateTopline,
  getRowAttemptSeq,
  partitionPhasesSeenForParcelDisplay,
} from './opsSmokeParcelGate.js';

export {
  getRowAttemptSeq,
  filterRowsForSessionAggregateTopline,
  partitionPhasesSeenForParcelDisplay,
} from './opsSmokeParcelGate.js';

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
 * 멀티 제품·배포가 동일 Supabase를 쓸 때 요약·CLI 필터(`--session-prefix`)와 맞추기 위한 선택 접두사.
 * `COS_OPS_SMOKE_SESSION_ID`가 비어 있고 자동 `smoke_<ts>_<hex>`만 쓸 때만 앞에 붙는다.
 * @param {NodeJS.ProcessEnv} [env]
 */
export function smokeSessionIdAutoPrefixFromEnv(env = process.env) {
  const raw = String(env.COS_OPS_SMOKE_SESSION_ID_PREFIX || '').trim();
  if (!raw) return '';
  const safe = raw
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 32);
  return safe ? `${safe}_` : '';
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 */
export function resolveSmokeSessionId(env = process.env) {
  const explicit = String(env.COS_OPS_SMOKE_SESSION_ID || '').trim();
  if (explicit) return explicit;
  if (!isOpsSmokeEnabled(env)) return null;
  if (!cachedSessionId) {
    const pref = smokeSessionIdAutoPrefixFromEnv(env);
    cachedSessionId = `${pref}smoke_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
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
  const provIn = s.provider_callback_ingress_observed === true;
  const synIn = s.synthetic_callback_ingress_observed === true;
  const manIn = s.manual_probe_callback_ingress_observed === true;
  const unkIn = s.unknown_source_callback_ingress_observed === true;
  const cbState = s.callback_completion_state != null ? String(s.callback_completion_state) : '';
  lines.push(
    `콜백: 아웃바운드_계약=${s.outbound_callback_contract_attached} · 응답_메타=${s.acceptance_response_has_callback_metadata} · 프로바이더=${provIn} · 합성오케스트레이터=${synIn} · 수동프로브=${manIn} · 출처미상=${unkIn}`,
  );
  lines.push(
    cbState
      ? `콜백_완료_상태: ${cbState.slice(0, 120)}`
      : '콜백_완료_상태: (미분류)',
  );
  if (cbState === 'provider_callback_ingress_matched_not_closed') {
    lines.push('(내부) 프로바이더_인그레스_매칭만_됨 — 구조적_클로저_미적용');
  }
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
  const adv = Array.isArray(s.advisory_phases_seen)
    ? s.advisory_phases_seen.map((x) => String(x || '').trim()).filter(Boolean)
    : [];
  if (adv.length) {
    const shown = adv.slice(0, 8);
    const tail = adv.length > 8 ? '…' : '';
    lines.push(`부차 관측 페이즈(1차 완료 권위 아님): ${shown.join(', ')}${tail}`);
  }
  return lines.slice(0, 12);
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

  try {
    await ensureOpsSmokeSessionIdOnRunHarness(runId, sid);
  } catch (e) {
    console.error('[ops_smoke_harness_anchor]', e);
  }

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
 *   ingress_callback_gate?: Record<string, unknown> | null,
 *   callback_source_kind?: string | null,
 *   callback_verification_kind?: string | null,
 *   callback_match_basis?: string | null,
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
    ingress_callback_gate:
      p.ingress_callback_gate && typeof p.ingress_callback_gate === 'object'
        ? p.ingress_callback_gate
        : null,
    callback_source_kind:
      p.callback_source_kind != null ? String(p.callback_source_kind).slice(0, 32) : null,
    callback_verification_kind:
      p.callback_verification_kind != null ? String(p.callback_verification_kind).slice(0, 32) : null,
    callback_match_basis:
      p.callback_match_basis != null ? String(p.callback_match_basis).slice(0, 40) : null,
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
 * vNext.13.59a — Safe subset for cos_github_fallback_evidence recovery_diagnostics.
 * @param {Record<string, unknown>} d
 */
function sanitizeRecoveryDiagnosticsForOps(d) {
  const o = d && typeof d === 'object' ? d : {};
  const sample = (v) =>
    Array.isArray(v) ? v.map((x) => String(x).slice(0, 120)).slice(0, 12) : [];
  return {
    recovery_candidate_count:
      o.recovery_candidate_count != null ? Math.min(9999, Math.max(0, Number(o.recovery_candidate_count) || 0)) : 0,
    recovery_pending_envelope_count:
      o.recovery_pending_envelope_count != null
        ? Math.min(9999, Math.max(0, Number(o.recovery_pending_envelope_count) || 0))
        : 0,
    recovery_repo_match_count:
      o.recovery_repo_match_count != null ? Math.min(9999, Math.max(0, Number(o.recovery_repo_match_count) || 0)) : 0,
    recovery_requested_paths_sample: sample(o.recovery_requested_paths_sample),
    recovery_paths_touched_sample: sample(o.recovery_paths_touched_sample),
    recovery_matched_paths_sample: sample(o.recovery_matched_paths_sample),
    recovery_head_sha_prefix:
      o.recovery_head_sha_prefix != null ? String(o.recovery_head_sha_prefix).slice(0, 16) : '',
    recovery_no_match_reason:
      o.recovery_no_match_reason != null ? String(o.recovery_no_match_reason).slice(0, 80) : 'unknown',
    recovery_anchor_run_id:
      o.recovery_anchor_run_id != null ? String(o.recovery_anchor_run_id).trim().slice(0, 64) : null,
  };
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
 *   recovery_diagnostics?: Record<string, unknown> | null,
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
    ...(p.recovery_diagnostics && typeof p.recovery_diagnostics === 'object'
      ? {
          recovery_diagnostics: sanitizeRecoveryDiagnosticsForOps(p.recovery_diagnostics),
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
    run_id_source: t.run_id_source != null ? String(t.run_id_source).slice(0, 24) : null,
    accepted_external_id_source:
      t.accepted_external_id_source != null ? String(t.accepted_external_id_source).slice(0, 24) : null,
    status_source: t.status_source != null ? String(t.status_source).slice(0, 24) : null,
    url_source: t.url_source != null ? String(t.url_source).slice(0, 24) : null,
    branch_source: t.branch_source != null ? String(t.branch_source).slice(0, 24) : null,
    automation_response_env_absent_notes: Array.isArray(t.automation_response_env_absent_notes)
      ? t.automation_response_env_absent_notes.map((x) => String(x).slice(0, 160)).slice(0, 12)
      : null,
  };
}

/**
 * @param {{
 *   canonical: Record<string, unknown>,
 *   matched_by: string | null | undefined,
 *   canonical_status: string | null | undefined,
 *   payload_fingerprint_prefix: string | null | undefined,
 *   ingressEvidence: Record<string, unknown>,
 *   callback_source_kind?: string | null | undefined,
 *   callback_match_basis?: string | null | undefined,
 *   callback_verification_kind?: string | null | undefined,
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
    callback_source_kind:
      p.callback_source_kind != null ? String(p.callback_source_kind).slice(0, 32) : null,
    callback_match_basis:
      p.callback_match_basis != null ? String(p.callback_match_basis).slice(0, 40) : null,
    callback_verification_kind:
      p.callback_verification_kind != null ? String(p.callback_verification_kind).slice(0, 32) : null,
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
  'cursor_callback_ingress_insufficient_payload',
  'cursor_callback_ingress_rejected',
  'cursor_direct_callback_ingress_received',
  'cursor_provider_callback_correlated',
  'cursor_non_provider_callback_ingress',
  'cursor_unknown_source_callback_correlated',
  'cursor_manual_probe_callback_correlated',
  'cursor_direct_callback_correlated',
  'external_run_id_extracted',
  'manual_probe_external_callback_matched',
  'non_provider_callback_closure_observed',
  'external_callback_matched',
  'path_fingerprint_callback_evidence_only',
  'authoritative_callback_closure_applied',
  'callback_correlated_but_closure_not_applied',
  'github_secondary_recovery_matched',
  'github_fallback_evidence',
  'callback_orchestrator_pending',
  'callback_orchestrator_delivery_observed',
  'callback_orchestrator_timeout',
  'callback_orchestrator_unavailable',
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
  if (et === 'result_recovery_github_secondary') return 'github_secondary_recovery_matched';
  if (et === 'cos_cursor_webhook_ingress_safe') {
    const o = String(pl.correlation_outcome || '');
    const src = String(pl.callback_source_kind || '').trim().toLowerCase();
    if (o === 'no_match') return 'cursor_callback_observed_no_match';
    if (o === 'matched') {
      if (src === 'manual_probe') return 'cursor_manual_probe_callback_correlated';
      if (src === 'synthetic_orchestrator') return 'cursor_non_provider_callback_ingress';
      if (src === 'provider_runtime') return 'cursor_provider_callback_correlated';
      return 'cursor_unknown_source_callback_correlated';
    }
    if (o === 'ignored_insufficient_payload') return 'cursor_callback_ingress_insufficient_payload';
    if (o === 'rejected_invalid_signature' || o === 'rejected_invalid_json') return 'cursor_callback_ingress_rejected';
    return 'cursor_direct_callback_ingress_received';
  }
  if (et === 'cursor_receive_intake_committed') return 'run_packet_progression_patched';
  return '';
}

/**
 * Break pointer: external_run_id_extracted is strict (phase row only); later gates accept ingress aliases.
 * @param {string} step
 * @param {Set<string>} seen
 */
function strictPipelineBreak(step, seen) {
  switch (step) {
    case 'cursor_trigger_recorded':
      return seen.has('cursor_trigger_recorded');
    case 'external_run_id_extracted':
      return seen.has('external_run_id_extracted');
    case 'external_callback_matched':
      return (
        seen.has('external_callback_matched') ||
        seen.has('non_provider_callback_closure_observed') ||
        seen.has('cursor_provider_callback_correlated') ||
        seen.has('cursor_non_provider_callback_ingress') ||
        seen.has('cursor_unknown_source_callback_correlated') ||
        seen.has('cursor_direct_callback_correlated') ||
        seen.has('github_secondary_recovery_matched')
      );
    case 'run_packet_progression_patched':
      return seen.has('run_packet_progression_patched');
    case 'supervisor_wake_enqueued':
      return seen.has('supervisor_wake_enqueued');
    case 'founder_milestone_sent':
      return seen.has('founder_milestone_sent');
    default:
      return false;
  }
}

/**
 * Relaxed gates for recomputing breaks_at after provider/GitHub closure (vNext.13.67).
 * @param {string} step
 * @param {Set<string>} seen
 */
function relaxedPipelineBreak(step, seen) {
  switch (step) {
    case 'cursor_trigger_recorded':
      return seen.has('cursor_trigger_recorded');
    case 'external_run_id_extracted':
      return (
        seen.has('external_run_id_extracted') || seen.has('trigger_accepted_external_id_present')
      );
    case 'external_callback_matched':
      return (
        seen.has('external_callback_matched') ||
        seen.has('non_provider_callback_closure_observed') ||
        seen.has('cursor_provider_callback_correlated') ||
        seen.has('cursor_non_provider_callback_ingress') ||
        seen.has('cursor_unknown_source_callback_correlated') ||
        seen.has('cursor_direct_callback_correlated') ||
        seen.has('github_secondary_recovery_matched')
      );
    case 'run_packet_progression_patched':
      return seen.has('run_packet_progression_patched');
    case 'supervisor_wake_enqueued':
      return seen.has('supervisor_wake_enqueued');
    case 'founder_milestone_sent':
      return seen.has('founder_milestone_sent');
    default:
      return false;
  }
}

/**
 * @param {Set<string>} seen
 */
function recomputeBreaksAtRelaxed(seen) {
  for (let i = 0; i < PIPELINE_BREAK_ORDER.length; i += 1) {
    const step = PIPELINE_BREAK_ORDER[i];
    if (!relaxedPipelineBreak(step, seen)) return step;
  }
  return null;
}

/**
 * @param {Set<string>} seen
 */
function providerCallbackClosureSeen(seen) {
  return (
    seen.has('external_callback_matched') ||
    seen.has('cursor_provider_callback_correlated') ||
    seen.has('cursor_direct_callback_correlated')
  );
}

/**
 * @param {Set<string>} seen
 */
function syntheticCallbackClosureSeen(seen) {
  return false;
}

/**
 * @param {Set<string>} seen
 */
function computeCallbackCompletionState(seen) {
  if (seen.has('authoritative_callback_closure_applied')) {
    return 'authoritative_callback_closure_applied';
  }
  if (seen.has('callback_correlated_but_closure_not_applied')) {
    return 'callback_correlated_but_closure_not_applied';
  }
  if (seen.has('cursor_provider_callback_correlated') || seen.has('external_callback_matched')) {
    return 'provider_callback_ingress_matched_not_closed';
  }
  if (seen.has('non_provider_callback_closure_observed') || seen.has('cursor_non_provider_callback_ingress')) {
    return 'non_provider_callback_observed';
  }
  if (seen.has('github_secondary_recovery_matched')) return 'github_secondary_recovery_matched';
  if (
    seen.has('cursor_manual_probe_callback_correlated') ||
    seen.has('manual_probe_external_callback_matched')
  ) {
    return 'manual_probe_callback_matched';
  }
  if (seen.has('cursor_unknown_source_callback_correlated')) return 'unknown_source_callback_correlated';
  return null;
}

const AGG_EXTRA_KEYS = {
  authoritative_closure_source: null,
  emit_patch_structural_closure_complete: false,
};

/**
 * Single authority tier for ops aggregate (manual probe never ranks as provider).
 * @param {Set<string>} seen
 * @param {{
 *   provOnly: boolean,
 *   synOnly: boolean,
 *   ghClosed: boolean,
 *   manualOnlyClosed: boolean,
 *   callback_completion_state: string | null,
 * }} ctx
 */
export function computeAuthoritativeClosureSource(seen, ctx) {
  if (ctx.manualOnlyClosed) return 'manual_probe';
  if (ctx.provOnly) return 'provider_runtime';
  if (ctx.ghClosed) return 'github_secondary_recovery';
  if (seen.has('callback_orchestrator_unavailable')) return 'callback_unavailable';
  if (
    seen.has('callback_orchestrator_timeout') ||
    seen.has('cursor_callback_absent_within_timeout') ||
    ctx.callback_completion_state === 'callback_timeout_or_absent'
  ) {
    return 'callback_timeout_or_failed';
  }
  return null;
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

  if (seen.has('path_fingerprint_callback_evidence_only')) {
    return {
      phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
      ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
      breaks_at: 'run_packet_progression_patched',
      final_status: 'callback_correlated_path_fingerprint_not_authoritative',
      callback_completion_state: 'path_fingerprint_not_authoritative',
      ...AGG_EXTRA_KEYS,
    };
  }

  if (!seen.size) {
    return {
      phases_seen: [],
      ordered_events: [],
      breaks_at: null,
      final_status: 'no_ops_smoke_events',
      callback_completion_state: null,
      ...AGG_EXTRA_KEYS,
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
      callback_completion_state: computeCallbackCompletionState(seen),
      ...AGG_EXTRA_KEYS,
    };
  }

  if (seen.has('cursor_trigger_failed')) {
    return {
      phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
      ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
      breaks_at: 'cursor_trigger_recorded',
      final_status: 'trigger_failed',
      callback_completion_state: computeCallbackCompletionState(seen),
      ...AGG_EXTRA_KEYS,
    };
  }

  let breaksAt = null;
  for (let i = 0; i < PIPELINE_BREAK_ORDER.length; i += 1) {
    const step = PIPELINE_BREAK_ORDER[i];
    if (!strictPipelineBreak(step, seen)) {
      breaksAt = step;
      break;
    }
  }

  let final_status = 'unknown';
  const provOnly = providerCallbackClosureSeen(seen);
  const synOnly = false;
  const ghClosed =
    seen.has('github_secondary_recovery_matched') && !providerCallbackClosureSeen(seen);
  const manualOnlyClosed =
    !provOnly &&
    !synOnly &&
    (seen.has('cursor_manual_probe_callback_correlated') || seen.has('manual_probe_external_callback_matched'));

  if (provOnly) {
    breaksAt = recomputeBreaksAtRelaxed(seen);
    const staleAcceptPending =
      seen.has('trigger_accepted_external_id_present') && !seen.has('external_run_id_extracted');
    if (!breaksAt) {
      final_status = 'unknown';
    } else if (staleAcceptPending) {
      final_status = 'cursor_callback_correlated';
    } else {
      final_status = `partial_stopped_before_${breaksAt}`;
    }
  } else if (ghClosed) {
    breaksAt = recomputeBreaksAtRelaxed(seen);
    const staleAcceptPending =
      seen.has('trigger_accepted_external_id_present') && !seen.has('external_run_id_extracted');
    if (!breaksAt) {
      final_status = 'unknown';
    } else if (staleAcceptPending) {
      final_status = 'github_secondary_recovery_closed';
    } else {
      final_status = `partial_stopped_before_${breaksAt}`;
    }
  } else if (manualOnlyClosed) {
    final_status = 'manual_probe_callback_matched_without_provider_closure';
    breaksAt = 'external_callback_matched';
  } else if (seen.has('cursor_trigger_recorded') && !seen.has('external_run_id_extracted')) {
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

  if (!provOnly && !synOnly && !ghClosed && !manualOnlyClosed) {
    if (seen.has('cursor_callback_absent_despite_callback_contract')) {
      final_status = 'cursor_callback_absent_despite_callback_contract';
      breaksAt = 'external_callback_matched';
    } else if (seen.has('cursor_callback_absent_without_callback_contract')) {
      final_status = 'cursor_callback_absent_without_callback_contract';
      breaksAt = 'external_callback_matched';
    } else if (seen.has('cursor_callback_absent_within_timeout')) {
      final_status = 'cursor_callback_absent_within_timeout';
      breaksAt = 'external_callback_matched';
    } else if (
      seen.has('cursor_callback_observed_no_match') &&
      !relaxedPipelineBreak('external_callback_matched', seen)
    ) {
      final_status = 'cursor_callback_observed_no_match';
      breaksAt = 'external_callback_matched';
    }
  }

  if (final_status === 'unknown') {
    if (!breaksAt) final_status = 'full_pipeline_observed';
    else if (breaksAt === 'cursor_trigger_recorded') final_status = 'before_trigger';
    else final_status = `partial_stopped_before_${breaksAt}`;
  }

  let cbState = computeCallbackCompletionState(seen);
  if (!cbState) {
    if (
      seen.has('cursor_callback_absent_within_timeout') ||
      String(final_status || '').includes('callback_absent')
    ) {
      cbState = 'callback_timeout_or_absent';
    } else if (seen.has('cursor_trigger_recorded')) {
      cbState = 'callback_pending';
    }
  }

  if (seen.has('callback_correlated_but_closure_not_applied')) {
    final_status = 'callback_correlated_but_closure_not_applied';
  } else if (seen.has('authoritative_callback_closure_applied')) {
    final_status = 'authoritative_callback_closure_applied';
  } else if (provOnly && !seen.has('run_packet_progression_patched')) {
    if (final_status === 'cursor_callback_correlated') {
      final_status = 'callback_correlated_without_progression_patch';
    }
  }

  const authoritative_closure_source = computeAuthoritativeClosureSource(seen, {
    provOnly,
    synOnly,
    ghClosed,
    manualOnlyClosed,
    callback_completion_state: cbState,
  });
  const emit_patch_structural_closure_complete = Boolean(
    (seen.has('authoritative_callback_closure_applied') || ghClosed) &&
      seen.has('run_packet_progression_patched') &&
      (seen.has('supervisor_wake_enqueued') || seen.has('authoritative_callback_closure_applied')),
  );

  return {
    phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
    ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
    breaks_at: breaksAt,
    final_status: final_status,
    callback_completion_state: cbState,
    authoritative_closure_source,
    emit_patch_structural_closure_complete,
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
    provider_callback_ingress_observed: null,
    synthetic_callback_ingress_observed: null,
    unknown_source_callback_ingress_observed: null,
    manual_probe_callback_ingress_observed: null,
    cursor_ingress_provider_match_basis: null,
    cursor_ingress_synthetic_match_basis: null,
    cursor_ingress_unknown_match_basis: null,
    cursor_ingress_manual_probe_match_basis: null,
  };
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let best = null;
  let bestProvAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestProv = null;
  let bestSynAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestSyn = null;
  let bestUnkAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestUnk = null;
  let bestManAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestMan = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'cos_cursor_webhook_ingress_safe') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    const t = String(pl.at || r.created_at || '');
    if (t >= bestAt) {
      bestAt = t;
      best = pl;
    }
    const co = String(pl.correlation_outcome || '');
    const verifiedMatch =
      pl.signature_verification_ok === true &&
      pl.json_parse_ok === true &&
      co !== 'rejected_invalid_signature' &&
      co !== 'rejected_invalid_json' &&
      co === 'matched';
    if (verifiedMatch) {
      const sk = String(pl.callback_source_kind || '').trim().toLowerCase();
      if (sk === 'manual_probe') {
        if (t >= bestManAt) {
          bestManAt = t;
          bestMan = pl;
        }
      } else if (sk === 'synthetic_orchestrator') {
        if (t >= bestSynAt) {
          bestSynAt = t;
          bestSyn = pl;
        }
      } else if (sk === 'provider_runtime') {
        if (t >= bestProvAt) {
          bestProvAt = t;
          bestProv = pl;
        }
      } else if (t >= bestUnkAt) {
        bestUnkAt = t;
        bestUnk = pl;
      }
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
    provider_callback_ingress_observed: bestProv != null,
    synthetic_callback_ingress_observed: bestSyn != null,
    unknown_source_callback_ingress_observed: bestUnk != null,
    manual_probe_callback_ingress_observed: bestMan != null,
    cursor_ingress_provider_match_basis:
      bestProv?.callback_match_basis != null ? String(bestProv.callback_match_basis).slice(0, 40) : null,
    cursor_ingress_synthetic_match_basis:
      bestSyn?.callback_match_basis != null ? String(bestSyn.callback_match_basis).slice(0, 40) : null,
    cursor_ingress_unknown_match_basis:
      bestUnk?.callback_match_basis != null ? String(bestUnk.callback_match_basis).slice(0, 40) : null,
    cursor_ingress_manual_probe_match_basis:
      bestMan?.callback_match_basis != null ? String(bestMan.callback_match_basis).slice(0, 40) : null,
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
 * vNext.13.59a — Callback contract proof on the same accepted attempt as cursor_trigger_recorded (not session-wide trigger_outbound row).
 * @param {Array<{ event_type?: string, payload?: Record<string, unknown>, created_at?: string }>} rows
 * @returns {Record<string, unknown> | null} null → caller falls back to extractLatestCallbackContractEvidenceFromRows
 */
export function extractLatestAcceptedAttemptCallbackContractFromRows(rows) {
  let bestAt = '';
  /** @type {Record<string, unknown> | null} */
  let bestPl = null;
  for (const r of rows || []) {
    if (String(r.event_type || '') !== 'ops_smoke_phase') continue;
    const pl = r.payload && typeof r.payload === 'object' ? r.payload : {};
    if (String(pl.phase || '') !== 'cursor_trigger_recorded' || pl.trigger_ok !== true) continue;
    if (pl.outbound_callback_contract_present === undefined) continue;
    const at = String(pl.at || r.created_at || '');
    if (at >= bestAt) {
      bestAt = at;
      bestPl = pl;
    }
  }
  if (!bestPl) return null;
  const pres = bestPl.outbound_callback_contract_present === true;
  const hints = Array.isArray(bestPl.outbound_callback_field_names)
    ? bestPl.outbound_callback_field_names.map(String).slice(0, 16)
    : typeof bestPl.outbound_callback_field_names === 'string'
      ? String(bestPl.outbound_callback_field_names)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
          .slice(0, 16)
      : null;
  return {
    callback_contract_present: pres,
    callback_url_field_name: bestPl.callback_url_field_name != null ? String(bestPl.callback_url_field_name).slice(0, 120) : null,
    callback_secret_field_name:
      bestPl.callback_secret_field_name != null ? String(bestPl.callback_secret_field_name).slice(0, 120) : null,
    callback_hints_field_names: hints,
    callback_url_path_only:
      bestPl.outbound_callback_url_path_only != null
        ? String(bestPl.outbound_callback_url_path_only).slice(0, 200)
        : null,
    callback_secret_present:
      typeof bestPl.callback_secret_present === 'boolean' ? bestPl.callback_secret_present : null,
    selected_trigger_endpoint_family:
      bestPl.selected_trigger_endpoint_family != null
        ? String(bestPl.selected_trigger_endpoint_family).slice(0, 80)
        : null,
    outbound_callback_contract_reason:
      bestPl.outbound_callback_contract_reason != null
        ? String(bestPl.outbound_callback_contract_reason).slice(0, 80)
        : null,
    accepted_attempt_accepted_external_id:
      bestPl.accepted_attempt_accepted_external_id != null
        ? String(bestPl.accepted_attempt_accepted_external_id).slice(0, 64)
        : null,
    accepted_attempt_response_top_level_keys: Array.isArray(bestPl.accepted_attempt_response_top_level_keys)
      ? bestPl.accepted_attempt_response_top_level_keys.map(String).slice(0, 60)
      : null,
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
  const fs = String(agg?.final_status || '');
  if (
    fs === 'authoritative_callback_closure_applied' ||
    fs === 'callback_correlated_but_closure_not_applied' ||
    fs === 'cursor_callback_correlated' ||
    fs === 'callback_correlated_without_progression_patch' ||
    fs === 'github_secondary_recovery_closed'
  ) {
    return 'cloud_trigger_attempted';
  }
  if (seen.has('cursor_trigger_recorded')) return 'cloud_trigger_attempted';
  if (seen.has('emit_patch_payload_validated')) return 'cloud_emit_patch_contract_ok';
  if (seen.has('trigger_blocked_invalid_payload')) return 'cloud_emit_patch_assembly_failed';
  if (seen.has('live_payload_compilation_started')) return 'cloud_emit_patch_compilation_observed';
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

/**
 * @param {Array<Record<string, unknown>>} summaries
 * @param {string | null | undefined} prefix
 */
export function filterOpsSmokeSummariesBySessionIdPrefix(summaries, prefix) {
  const p = String(prefix || '').trim();
  if (!p) return summaries;
  return summaries.filter((s) => String(s.smoke_session_id || '').startsWith(p));
}

/**
 * @param {Array<Record<string, unknown>>} flatRows
 * @param {{
 *   sessionLimit?: number,
 *   preferredSmokeSessionByRunId?: Map<string, string>,
 *   intakeOrphanReplication?: 'all' | 'dominant',
 * }} [opts]
 * — `preferredSmokeSessionByRunId`: 런 하니스 `ops_smoke_session_id` 등, orphan intake 귀속 우선.
 * — `intakeOrphanReplication`: 기본 `dominant`(다중 세션 시 단일 귀속). 레거시 전 구간이면 `all`.
 */
export function summarizeOpsSmokeSessionsFromFlatRows(flatRows, opts = {}) {
  const sessionLimit = opts.sessionLimit != null ? Math.max(1, Number(opts.sessionLimit)) : 50;
  const bySession = buildSmokeSessionBucketsFromFlatRows(flatRows, SMOKE_SESSION_ROW_EVENT_TYPES, {
    preferredSmokeSessionByRunId: opts.preferredSmokeSessionByRunId,
    intakeOrphanReplication: opts.intakeOrphanReplication,
  });
  const sessions = [...bySession.entries()].map(([smoke_session_id, { run_ids, rows }]) => {
    const nonOrphan = run_ids.filter((r) => r && r !== '_orphan');
    const orphanOnly = run_ids.filter((r) => r === '_orphan');
    const primary_run_id = nonOrphan[0] || orphanOnly[0] || 'unknown';
    const related_run_ids = [...nonOrphan.slice(1), ...orphanOnly];
    const { byAttempt, useLineage } = partitionSmokeSessionRowsByAttempt(rows);
    const primarySeq = choosePrimaryAttemptSeqFromPartition(byAttempt, useLineage);
    const primaryRows =
      useLineage && primarySeq > 0
        ? byAttempt.get(primarySeq) || []
        : !useLineage
          ? byAttempt.get(1) || rows
          : rows;

    const rowsForAgg =
      useLineage && primarySeq > 0 ? filterRowsForSessionAggregateTopline(rows, primarySeq) : rows;
    const agg = aggregateSmokeSessionProgress(rowsForAgg);
    const parcelPhaseSplit = partitionPhasesSeenForParcelDisplay(agg.phases_seen);

    const machine = extractOpsSmokeMachineSummaryFromRows(primaryRows);
    const triggerEv = extractLatestTriggerEvidenceFromRows(primaryRows);
    const cursorIngress = extractLatestCursorWebhookIngressFromRows(rows);
    const ghFb = extractGithubFallbackSummaryFromRows(rows);
    const recoveryGh = extractResultRecoveryGithubSecondaryFromRows(rows);
    const cbAccept = extractLatestAcceptedAttemptCallbackContractFromRows(primaryRows);
    const cbLegacy = extractLatestCallbackContractEvidenceFromRows(primaryRows);
    const cbContract = cbAccept || cbLegacy;
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
    const acceptedAutomationPrimary = primaryInvoke?.trigger_ok === true;
    const emitPatchPrimary =
      acceptedAutomationPrimary && String(primaryInvoke?.invoked_action || '') === 'emit_patch';
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
    const inbound_callback_observed = cursorIngress.provider_callback_ingress_observed === true;
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
      acceptedAutomationPrimary ? null : machine.blocked_reason != null ? machine.blocked_reason : null;

    const lastAt = rows.reduce((m, r) => {
      const t1 = String(r.payload?.at || '');
      const t2 = String(r.created_at || '');
      const best = t1 > t2 ? t1 : t2;
      return best > m ? best : m;
    }, '');

    const base = {
      smoke_session_id,
      run_id: primary_run_id,
      primary_run_id,
      related_run_ids,
      lastAt,
      ...machine,
      selected_tool: primary_selected_tool ?? machine.selected_tool,
      selected_action: primary_selected_action ?? machine.selected_action,
      blocked_reason: acceptedAutomationPrimary ? null : machine.blocked_reason,
      machine_hint: acceptedAutomationPrimary ? null : machine.machine_hint,
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
      primary_phases_seen: parcelPhaseSplit.primary_phases_seen,
      advisory_phases_seen: parcelPhaseSplit.advisory_phases_seen,
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
  const outboundReason = deriveOutboundCallbackContractReason(env);
  const nameList = [
    cc.callback_url_field_name,
    cc.callback_secret_field_name,
    ...(Array.isArray(cc.callback_hints_field_names) ? cc.callback_hints_field_names.map(String) : []),
  ].filter((x) => x != null && String(x).trim());
  const trObj = tr && typeof tr === 'object' ? tr : {};
  const accKeys = Array.isArray(trObj.response_top_level_keys)
    ? trObj.response_top_level_keys.map(String).slice(0, 60)
    : null;

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
      ...(ok
        ? {
            outbound_callback_contract_present: ccPresent,
            outbound_callback_contract_reason: outboundReason,
            outbound_callback_url_path_only:
              cc.callback_url_path_only != null ? String(cc.callback_url_path_only).slice(0, 200) : null,
            outbound_callback_field_names: nameList.slice(0, 16),
            callback_url_field_name: cc.callback_url_field_name != null ? String(cc.callback_url_field_name) : null,
            callback_secret_field_name:
              cc.callback_secret_field_name != null ? String(cc.callback_secret_field_name) : null,
            callback_secret_present: cc.callback_secret_present === true,
            selected_trigger_endpoint_family:
              cc.selected_trigger_endpoint_family != null ? String(cc.selected_trigger_endpoint_family) : null,
            accepted_attempt_accepted_external_id:
              trObj.accepted_external_id != null
                ? tailExternalRunId(trObj.accepted_external_id)
                : trObj.has_accepted_external_id === true
                  ? '(present)'
                  : null,
            accepted_attempt_response_top_level_keys: accKeys,
          }
        : {}),
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
 *   progression_skipped_reason?: string | null,
 *   authoritative_closure_applied?: boolean,
 *   closure_not_applied_reason?: string | null,
 *   emit_patch_authoritative_path?: boolean,
 *   supervisor_wake_enqueued?: boolean,
 *   idempotent_closure_repeat?: boolean,
 * }} p
 */
export async function recordOpsSmokeAfterExternalMatch(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId) return;

  const meta = p.ingressMeta && typeof p.ingressMeta === 'object' ? p.ingressMeta : {};
  const src = String(meta.callback_source_kind || '').trim().toLowerCase();
  const mb = String(meta.matched_by || '').trim();
  let phaseMatch = 'external_callback_matched';
  if (mb === 'automation_request_path_fp') {
    phaseMatch = 'path_fingerprint_callback_evidence_only';
  } else if (src === 'manual_probe') {
    phaseMatch = 'manual_probe_external_callback_matched';
  } else if (src === 'synthetic_orchestrator') {
    phaseMatch = 'non_provider_callback_closure_observed';
  }

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    phase: phaseMatch,
    detail: {
      callback: buildSafeCursorCallbackSmokeDetail({
        canonical: p.canonical,
        matched_by: meta.matched_by,
        canonical_status: p.canonForOut?.bucket != null ? String(p.canonForOut.bucket) : null,
        payload_fingerprint_prefix: meta.payload_fingerprint_prefix,
        ingressEvidence: p.ingressEvidence,
        callback_source_kind: meta.callback_source_kind != null ? String(meta.callback_source_kind) : null,
        callback_match_basis: meta.callback_match_basis != null ? String(meta.callback_match_basis) : null,
        callback_verification_kind:
          meta.callback_verification_kind != null ? String(meta.callback_verification_kind) : null,
      }),
      ...(p.cursorPacketPatched
        ? {}
        : p.progression_skipped_reason != null && String(p.progression_skipped_reason).trim()
          ? { progression_skipped_reason: String(p.progression_skipped_reason).slice(0, 120) }
          : {}),
    },
  });

  const emitPatchPath = p.emit_patch_authoritative_path === true;
  const authApplied = p.authoritative_closure_applied === true;
  const idem = p.idempotent_closure_repeat === true;

  if (emitPatchPath && authApplied && !idem) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      phase: 'authoritative_callback_closure_applied',
      detail: {},
    });
  } else if (emitPatchPath && !authApplied) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      phase: 'callback_correlated_but_closure_not_applied',
      detail: {
        closure_not_applied_reason:
          p.closure_not_applied_reason != null
            ? String(p.closure_not_applied_reason).slice(0, 120)
            : 'unknown',
      },
    });
  }

  if (p.cursorPacketPatched && !p.idempotent_closure_repeat) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      phase: 'run_packet_progression_patched',
      detail: {},
    });
  }

  const wake = p.supervisor_wake_enqueued !== false;
  const skipWakePhase = idem && !p.cursorPacketPatched;
  if (wake && !skipWakePhase) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
      phase: 'supervisor_wake_enqueued',
      detail: {},
    });
  }
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
