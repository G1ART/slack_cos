/**
 * vNext.13.62 — Callback gate helpers: emit_patch path fingerprint, ingress diagnostics.
 * Intentionally does not import cursorWebhookIngress (avoid cycles).
 */

import crypto from 'node:crypto';
import { normalizeRecoveryEnvelopePath } from './recoveryEnvelopeStore.js';

export function computePathsArrayFingerprint(paths) {
  const arr = Array.isArray(paths) ? paths.map((x) => String(x).trim()).filter(Boolean) : [];
  if (!arr.length) return '';
  const joined = [...new Set(arr)].sort().join('\0');
  return crypto.createHash('sha256').update(joined, 'utf8').digest('hex').slice(0, 16);
}

function collectEmitPatchPathsForFingerprint(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const ops = Array.isArray(pl.ops) ? pl.ops : [];
  /** @type {string[]} */
  const requested_paths = [];
  for (const row of ops) {
    if (!row || typeof row !== 'object') continue;
    const p = normalizeRecoveryEnvelopePath(String(row.path ?? ''));
    if (p) requested_paths.push(p);
  }
  const narrow = pl.live_patch && typeof pl.live_patch === 'object' ? pl.live_patch : null;
  if (!requested_paths.length && narrow) {
    const p = normalizeRecoveryEnvelopePath(String(narrow.path ?? narrow.target_path ?? ''));
    if (p) requested_paths.push(p);
  }
  return requested_paths;
}

/**
 * Stable 16-hex fingerprint for emit_patch payload paths (matches recovery envelope path set).
 * @param {Record<string, unknown>} payload
 */
export function computeEmitPatchPayloadPathFingerprint(payload) {
  return computePathsArrayFingerprint(collectEmitPatchPathsForFingerprint(payload));
}

/**
 * Safe diagnostics when normalization returns null (ops smoke / ledger).
 * @param {Record<string, unknown>} sel — return shape of computeCursorWebhookFieldSelection
 */
export function buildCursorCallbackInsufficientDiagnostics(sel) {
  const run_id = Boolean(String(sel.externalRunId || '').trim());
  const thread = Boolean(String(sel.threadKeyHint || '').trim());
  const packet = Boolean(String(sel.packetIdHint || '').trim());
  const run_uuid = Boolean(String(sel.runUuidHint || '').trim());
  const accepted = Boolean(String(sel.acceptedExternalIdHint || '').trim());
  const request_id = Boolean(String(sel.callbackRequestIdHint || '').trim());
  const path_fp = Boolean(String(sel.callbackPathFingerprintHint || '').trim());
  const status = Boolean(String(sel.statusPick?.value || '').trim());

  const would_accept = Boolean(run_id || thread || (run_uuid && packet) || accepted);

  return {
    callback_normalization_candidate_fields_present: {
      run_id,
      thread,
      packet,
      run_uuid,
      accepted_external_id: accepted,
      request_id,
      path_fingerprint: path_fp,
      status,
    },
    callback_minimum_match_basis_failed: !would_accept,
    normalization_requires_one_of: 'external_run_id|thread_key|run_uuid+packet|accepted_external_id',
  };
}
