/**
 * vNext.13.58 — Register recovery envelopes on emit_patch acceptance; conservative GitHub push secondary match.
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
import { patchRunById, signalSupervisorWakeForRun } from './executionRunStore.js';
import { applyExternalPacketProgressStateForRun } from './canonicalExternalEvent.js';

export const SECONDARY_OUTCOME_PATH_MATCH_ONLY = 'repository_reflection_path_match_only';

const RECOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1000;

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
}

/**
 * @param {string} runId
 */
export function markRecoveryEnvelopePrimaryCallbackObserved(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return;
  const cur = getRecoveryEnvelopeForRun(rid);
  if (!cur) return;
  patchRecoveryEnvelope(rid, {
    recovery_status: 'primary_callback_observed',
    truth: { callback_observed: true },
  });
}

/**
 * @param {Record<string, unknown>} norm normalizeGithubWebhookPayload result for push
 * @param {NodeJS.ProcessEnv} env
 * @param {string | null} payloadFingerprintPrefix
 * @returns {Promise<{ recovered: boolean, run_id?: string, outcome?: string, matched_paths?: string[] }>}
 */
export async function tryGithubPushSecondaryRecovery(norm, env, payloadFingerprintPrefix) {
  const n = norm && typeof norm === 'object' ? norm : {};
  if (String(n.event_type || '') !== 'push') return { recovered: false };

  const ck = n.correlation_keys && typeof n.correlation_keys === 'object' ? n.correlation_keys : {};
  const repo = String(ck.repository_full_name || '').trim();
  if (!repo) return { recovered: false };

  const pay = n.payload && typeof n.payload === 'object' ? /** @type {Record<string, unknown>} */ (n.payload) : {};
  const pathsRaw = Array.isArray(pay.paths_touched) ? pay.paths_touched : [];
  const touched = new Set(pathsRaw.map((x) => normalizeRecoveryEnvelopePath(String(x))));

  const receivedAt = String(n.received_at || new Date().toISOString());
  const recvMs = Date.parse(receivedAt);

  const candidates = listRecoveryEnvelopesPendingGithubSecondary();
  for (const envRow of candidates) {
    if (String(envRow.repository_full_name || '').toLowerCase() !== repo.toLowerCase()) continue;
    const createdMs = Date.parse(String(envRow.created_at || ''));
    if (!Number.isFinite(createdMs) || !Number.isFinite(recvMs)) continue;
    if (recvMs < createdMs) continue;
    if (recvMs - createdMs > RECOVERY_MAX_AGE_MS) continue;

    /** @type {string[]} */
    const matched_paths = [];
    for (const rp of envRow.requested_paths) {
      const np = normalizeRecoveryEnvelopePath(rp);
      if (np && touched.has(np)) matched_paths.push(np);
    }
    if (!matched_paths.length) continue;

    const runId = String(envRow.run_id || '').trim();
    const threadKey = String(envRow.thread_key || '').trim();
    const outcome = SECONDARY_OUTCOME_PATH_MATCH_ONLY;

    patchRecoveryEnvelope(runId, {
      recovery_status: 'recovered_github_secondary',
      secondary_recovery_outcome: outcome,
      truth: { github_secondary_recovered: true },
    });

    const external_id = String(n.external_id || 'github:push:unknown');
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
        head_sha: pay.head_sha != null ? String(pay.head_sha).slice(0, 40) : null,
        ref: pay.ref != null ? String(pay.ref).slice(0, 200) : null,
        is_primary_completion_authority: false,
        envelope_id: envRow.envelope_id,
        accepted_external_id_tail:
          envRow.accepted_external_id != null && String(envRow.accepted_external_id).length > 8
            ? String(envRow.accepted_external_id).slice(-8)
            : envRow.accepted_external_id,
      },
      {
        matched_by: 'github_push_secondary_recovery',
        payload_fingerprint_prefix: payloadFingerprintPrefix,
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

    return { recovered: true, run_id: runId, outcome, matched_paths };
  }

  return { recovered: false };
}
