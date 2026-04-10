/**
 * vNext.13.58–13.59a — Recovery envelopes (durable run row + memory), GitHub push secondary match + diagnostics.
 */

import crypto from 'node:crypto';
import { resolveGithubRepositoryString } from './toolsBridge.js';
import {
  getRecoveryEnvelopeForRun,
  upsertRecoveryEnvelope,
  patchRecoveryEnvelope,
  listRecoveryEnvelopesPendingGithubSecondary,
  normalizeRecoveryEnvelopePath,
} from './recoveryEnvelopeStore.js';
import { appendCosRunEventForRun } from './runCosEvents.js';
import {
  patchRunById,
  signalSupervisorWakeForRun,
  getRunById,
  listRunsWithPendingRecoveryEnvelope,
} from './executionRunStore.js';
import { applyExternalPacketProgressStateForRun } from './canonicalExternalEvent.js';

export const SECONDARY_OUTCOME_PATH_MATCH_ONLY = 'repository_reflection_path_match_only';

const RECOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

/**
 * @param {string} runId
 */
export async function syncRecoveryEnvelopeToRunRow(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return;
  const e = getRecoveryEnvelopeForRun(rid);
  await patchRunById(rid, { recovery_envelope_pending: e ? { ...e } : null });
}

/**
 * @returns {Promise<import('./recoveryEnvelopeStore.js').RecoveryEnvelope[]>}
 */
async function listAllPendingRecoveryEnvelopesMerged() {
  /** @type {Map<string, Record<string, unknown>>} */
  const byRun = new Map();
  for (const e of listRecoveryEnvelopesPendingGithubSecondary()) {
    const rid = String(e.run_id || '').trim();
    if (rid) byRun.set(rid, /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (e)));
  }
  const runs = await listRunsWithPendingRecoveryEnvelope(280);
  for (const r of runs) {
    const rid = String(r.id || '').trim();
    if (!rid || byRun.has(rid)) continue;
    const raw = r.recovery_envelope_pending;
    if (raw && typeof raw === 'object' && !Array.isArray(raw) && String(raw.recovery_status) === 'pending_callback') {
      byRun.set(rid, { ...raw, run_id: rid });
    }
  }
  return /** @type {import('./recoveryEnvelopeStore.js').RecoveryEnvelope[]} */ ([...byRun.values()]);
}

/**
 * @param {Record<string, unknown>} payload
 */
export function extractEmitPatchPathsAndContentPrefixes(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const ops = Array.isArray(pl.ops) ? pl.ops : [];
  /** @type {string[]} */
  const requested_paths = [];
  /** @type {string[]} */
  const requested_content_sha256_prefixes = [];
  for (const row of ops) {
    if (!row || typeof row !== 'object') continue;
    const p = normalizeRecoveryEnvelopePath(String(row.path ?? ''));
    if (!p) continue;
    requested_paths.push(p);
    const c = row.content;
    const body = c === undefined || c === null ? '' : String(c);
    const h = crypto.createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16);
    requested_content_sha256_prefixes.push(h);
  }
  const narrow = pl.live_patch && typeof pl.live_patch === 'object' ? pl.live_patch : null;
  if (!requested_paths.length && narrow) {
    const p = normalizeRecoveryEnvelopePath(String(narrow.path ?? narrow.target_path ?? ''));
    if (p) {
      requested_paths.push(p);
      const body = narrow.content === undefined || narrow.content === null ? '' : String(narrow.content);
      requested_content_sha256_prefixes.push(
        crypto.createHash('sha256').update(body, 'utf8').digest('hex').slice(0, 16),
      );
    }
  }
  return { requested_paths, requested_content_sha256_prefixes };
}

/**
 * @param {{
 *   env: NodeJS.ProcessEnv,
 *   runId: string,
 *   threadKey: string,
 *   packetId: string | null,
 *   acceptedExternalId: string | null,
 *   smoke_session_id?: string | null,
 *   payload: Record<string, unknown>,
 * }} p
 */
export async function registerRecoveryEnvelopeFromEmitPatchAccept(p) {
  const runId = String(p.runId || '').trim();
  const threadKey = String(p.threadKey || '').trim();
  if (!runId || !threadKey) return;

  const repo = resolveGithubRepositoryString(p.env || process.env).trim();
  if (!repo) return;

  const { requested_paths, requested_content_sha256_prefixes } = extractEmitPatchPathsAndContentPrefixes(p.payload);
  if (!requested_paths.length) return;

  const now = new Date().toISOString();
  const envelope_id = `re_${runId.slice(-12)}_${crypto.randomBytes(4).toString('hex')}`;
  const ops = Array.isArray(p.payload?.ops) ? p.payload.ops : [];
  const ops_summary =
    ops.length > 0
      ? ops
          .slice(0, 4)
          .map((o) => `${String(o?.op || '?')}:${normalizeRecoveryEnvelopePath(String(o?.path || ''))}`)
          .join(';')
      : 'narrow_live_patch';

  upsertRecoveryEnvelope({
    envelope_id,
    run_id: runId,
    thread_key: threadKey,
    packet_id: p.packetId != null && String(p.packetId).trim() ? String(p.packetId).trim() : null,
    smoke_session_id:
      p.smoke_session_id != null && String(p.smoke_session_id).trim()
        ? String(p.smoke_session_id).trim()
        : null,
    accepted_external_id: p.acceptedExternalId != null && String(p.acceptedExternalId).trim()
      ? String(p.acceptedExternalId).trim()
      : null,
    repository_full_name: repo,
    requested_paths,
    requested_content_sha256_prefixes,
    ops_summary: ops_summary.slice(0, 400),
    created_at: now,
    updated_at: now,
    recovery_status: 'pending_callback',
    truth: {
      execution_accepted: true,
      callback_observed: false,
      github_secondary_recovered: false,
    },
    secondary_recovery_outcome: null,
  });
  await syncRecoveryEnvelopeToRunRow(runId);
}

/**
 * @param {string} runId
 */
export async function markRecoveryEnvelopePrimaryCallbackObserved(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return;
  let cur = getRecoveryEnvelopeForRun(rid);
  if (!cur) {
    const run = await getRunById(rid);
    const raw = run?.recovery_envelope_pending;
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
      upsertRecoveryEnvelope(
        /** @type {import('./recoveryEnvelopeStore.js').RecoveryEnvelope} */ (
          /** @type {unknown} */ ({ ...raw, run_id: rid })
        ),
      );
      cur = getRecoveryEnvelopeForRun(rid);
    }
  }
  if (!cur) return;
  patchRecoveryEnvelope(rid, {
    recovery_status: 'primary_callback_observed',
    truth: { callback_observed: true },
  });
  await syncRecoveryEnvelopeToRunRow(rid);
}

/**
 * @param {Record<string, unknown>} norm
 * @param {{
 *   pending: import('./recoveryEnvelopeStore.js').RecoveryEnvelope[],
 *   repo: string,
 *   touched: Set<string>,
 *   headSha: string,
 *   recvMs: number,
 * }} ctx
 * @returns {{ recovered: boolean, run_id?: string, outcome?: string, matched_paths?: string[], diagnostics?: Record<string, unknown> }}
 */
async function runGithubPushRecoveryLoop(norm, ctx) {
  const { pending, repo, touched, headSha, recvMs } = ctx;
  const shaPrefix = headSha ? headSha.slice(0, 12) : '';

  /** @type {Record<string, unknown>} */
  const diagnostics = {
    recovery_candidate_count: 0,
    recovery_pending_envelope_count: pending.length,
    recovery_repo_match_count: 0,
    recovery_requested_paths_sample: [],
    recovery_paths_touched_sample: [...touched].slice(0, 8).map((s) => String(s).slice(0, 120)),
    recovery_matched_paths_sample: [],
    recovery_head_sha_prefix: shaPrefix,
    recovery_no_match_reason: 'no_pending_envelope',
    recovery_anchor_run_id:
      pending[0]?.run_id != null ? String(pending[0].run_id).trim().slice(0, 64) : null,
  };

  if (!pending.length) {
    return { recovered: false, diagnostics };
  }

  if (!touched.size) {
    diagnostics.recovery_no_match_reason = 'missing_paths_touched';
    return { recovered: false, diagnostics };
  }

  let repoMatch = 0;
  let bestOverlap = 0;
  /** @type {string[]} */
  let sampleReq = [];

  for (const envRow of pending) {
    upsertRecoveryEnvelope(
      /** @type {import('./recoveryEnvelopeStore.js').RecoveryEnvelope} */ (
        /** @type {unknown} */ (envRow)
      ),
    );
    diagnostics.recovery_candidate_count = Number(diagnostics.recovery_candidate_count) + 1;
    if (String(envRow.repository_full_name || '').toLowerCase() !== repo.toLowerCase()) continue;
    repoMatch += 1;
    const reqPaths = Array.isArray(envRow.requested_paths) ? envRow.requested_paths.map(String) : [];
    if (!reqPaths.length) {
      diagnostics.recovery_no_match_reason = 'missing_requested_paths';
      sampleReq = [];
      continue;
    }
    sampleReq = reqPaths.slice(0, 8).map((s) => normalizeRecoveryEnvelopePath(s).slice(0, 120));

    const createdMs = Date.parse(String(envRow.created_at || ''));
    if (!Number.isFinite(createdMs) || !Number.isFinite(recvMs)) {
      diagnostics.recovery_no_match_reason = 'outside_time_window';
      continue;
    }
    if (recvMs < createdMs) {
      diagnostics.recovery_no_match_reason = 'outside_time_window';
      continue;
    }
    if (recvMs - createdMs > RECOVERY_MAX_AGE_MS) {
      diagnostics.recovery_no_match_reason = 'outside_time_window';
      continue;
    }

    if (String(envRow.recovery_status || '') !== 'pending_callback') {
      diagnostics.recovery_no_match_reason = 'candidate_not_pending_callback';
      continue;
    }

    /** @type {string[]} */
    const matched_paths = [];
    for (const rp of reqPaths) {
      const np = normalizeRecoveryEnvelopePath(rp);
      if (np && touched.has(np)) matched_paths.push(np);
    }
    bestOverlap = Math.max(bestOverlap, matched_paths.length);

    if (!matched_paths.length) continue;

    const runId = String(envRow.run_id || '').trim();
    const threadKey = String(envRow.thread_key || '').trim();
    const outcome = SECONDARY_OUTCOME_PATH_MATCH_ONLY;

    patchRecoveryEnvelope(runId, {
      recovery_status: 'recovered_github_secondary',
      secondary_recovery_outcome: outcome,
      truth: { github_secondary_recovered: true },
    });
    await syncRecoveryEnvelopeToRunRow(runId);

    const external_id = String(norm.external_id || 'github:push:unknown');
    const now = new Date().toISOString();

    await appendCosRunEventForRun(
      runId,
      'result_recovery_github_secondary',
      {
        at: now,
        smoke_session_id: envRow.smoke_session_id,
        recovery_outcome: outcome,
        matched_paths,
        github_external_id: external_id,
        head_sha: headSha ? headSha.slice(0, 40) : null,
        ref:
          norm.payload && typeof norm.payload === 'object' && norm.payload.ref != null
            ? String(norm.payload.ref).slice(0, 200)
            : null,
        is_primary_completion_authority: false,
        envelope_id: envRow.envelope_id,
        accepted_external_id_tail:
          envRow.accepted_external_id != null && String(envRow.accepted_external_id).length > 8
            ? String(envRow.accepted_external_id).slice(-8)
            : envRow.accepted_external_id,
      },
      {
        matched_by: 'github_push_secondary_recovery',
        payload_fingerprint_prefix: ctx.fp,
      },
    );

    await patchRunById(runId, {
      result_recovery_bridge_last: {
        at: now,
        outcome,
        github_external_id: external_id,
        matched_paths,
        source: 'github_push',
      },
    });

    const pkt = envRow.packet_id != null ? String(envRow.packet_id).trim() : '';
    if (pkt) {
      await applyExternalPacketProgressStateForRun(runId, pkt, 'review_required');
    }

    if (threadKey) {
      await signalSupervisorWakeForRun(threadKey, runId);
    }

    return { recovered: true, run_id: runId, outcome, matched_paths, diagnostics: null };
  }

  diagnostics.recovery_repo_match_count = repoMatch;
  diagnostics.recovery_requested_paths_sample = sampleReq;
  if (repoMatch === 0) diagnostics.recovery_no_match_reason = 'repo_mismatch';
  else if (bestOverlap === 0) diagnostics.recovery_no_match_reason = 'no_path_overlap';

  return { recovered: false, diagnostics };
}

/**
 * @param {Record<string, unknown>} norm normalizeGithubWebhookPayload result for push
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null} payloadFingerprintPrefix
 * @returns {Promise<{ recovered: boolean, run_id?: string, outcome?: string, matched_paths?: string[], diagnostics?: Record<string, unknown> | null }>}
 */
export async function tryGithubPushSecondaryRecovery(norm, env, payloadFingerprintPrefix) {
  const n = norm && typeof norm === 'object' ? norm : {};
  if (String(n.event_type || '') !== 'push') return { recovered: false, diagnostics: null };

  const ck = n.correlation_keys && typeof n.correlation_keys === 'object' ? n.correlation_keys : {};
  const repo = String(ck.repository_full_name || '').trim();
  const pay = n.payload && typeof n.payload === 'object' ? /** @type {Record<string, unknown>} */ (n.payload) : {};
  const pathsRaw = Array.isArray(pay.paths_touched) ? pay.paths_touched : [];
  const touched = new Set(pathsRaw.map((x) => normalizeRecoveryEnvelopePath(String(x))));
  const headSha = pay.head_sha != null ? String(pay.head_sha) : '';
  const receivedAt = String(n.received_at || new Date().toISOString());
  const recvMs = Date.parse(receivedAt);

  const pending = await listAllPendingRecoveryEnvelopesMerged();
  const out = await runGithubPushRecoveryLoop(n, {
    pending,
    repo,
    touched,
    headSha,
    recvMs,
    fp: payloadFingerprintPrefix,
  });
  if (out.recovered) return { recovered: true, run_id: out.run_id, outcome: out.outcome, matched_paths: out.matched_paths, diagnostics: null };
  return {
    recovered: false,
    diagnostics: out.diagnostics || null,
  };
}
