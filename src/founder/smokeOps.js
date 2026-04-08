/**
 * Ops-only Cursor cloud smoke evidence (vNext.13.42). No founder UX.
 * Stores safe subsets in cos_run_events as event_type ops_smoke_phase when COS_OPS_SMOKE_ENABLED=1.
 */

import crypto from 'node:crypto';
import { appendCosRunEventForRun } from './runCosEvents.js';
import { listAutomationResponseOverrideKeys } from './cursorCloudAdapter.js';

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
 *   phase: string,
 *   detail?: Record<string, unknown>,
 *   env?: NodeJS.ProcessEnv,
 * }} p
 */
export async function recordOpsSmokePhase(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const sid = resolveSmokeSessionId(env);
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

const PIPELINE_PHASE_ORDER = [
  'cursor_trigger_recorded',
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
export function aggregateSmokeSessionProgress(rows) {
  const phases = (rows || [])
    .filter((r) => String(r.event_type || '') === 'ops_smoke_phase')
    .map((r) => (r.payload && typeof r.payload === 'object' ? r.payload : {}))
    .filter((pl) => pl.phase);

  const seen = new Set(phases.map((p) => String(p.phase || '')));
  const orderIdx = (ph) => {
    const i = PIPELINE_PHASE_ORDER.indexOf(ph);
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

  if (seen.has('cursor_trigger_failed')) {
    return {
      phases_seen: [...seen].sort((a, b) => orderIdx(a) - orderIdx(b)),
      ordered_events: sorted.map((pl) => ({ phase: pl.phase, at: pl.at })),
      breaks_at: 'cursor_trigger_recorded',
      final_status: 'trigger_failed',
    };
  }

  let breaksAt = null;
  for (let i = 0; i < PIPELINE_PHASE_ORDER.length; i += 1) {
    const step = PIPELINE_PHASE_ORDER[i];
    if (!seen.has(step)) {
      breaksAt = step;
      break;
    }
  }

  let final_status = 'unknown';
  if (!breaksAt) final_status = 'full_pipeline_observed';
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
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
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

  await recordOpsSmokePhase({
    env,
    runId,
    threadKey,
    phase: ok ? 'cursor_trigger_recorded' : 'cursor_trigger_failed',
    detail: {
      trigger: buildSafeTriggerSmokeDetail(tr, env),
      trigger_ok: ok,
    },
  });

  if (ok && ext) {
    await recordOpsSmokePhase({
      env,
      runId,
      threadKey,
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

export function __resetOpsSmokeSessionCacheForTests() {
  cachedSessionId = null;
}
