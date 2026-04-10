/**
 * vNext.13.62–13.64 — Callback gate: emit_patch path fingerprint, ingress diagnostics.
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

/** Normalized emit_patch paths (same set as fingerprint); for durable run anchor + GitHub recovery. */
export function listNormalizedEmitPatchPathsForAnchor(payload) {
  return collectEmitPatchPathsForFingerprint(payload);
}

/**
 * Safe diagnostics when normalization returns null (ops smoke / ledger).
 * v13.64: request_id alone is never sufficient; request_id+path_fp is a separate closeable pair.
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

  const request_id_paired_with_path_fp = Boolean(request_id && path_fp);
  const would_accept = Boolean(
    run_id ||
      thread ||
      (run_uuid && packet) ||
      accepted ||
      request_id_paired_with_path_fp,
  );

  /** @type {string[]} */
  const callback_missing_basis = [];
  if (!run_id) callback_missing_basis.push('external_run_id');
  if (!thread) callback_missing_basis.push('thread_key');
  if (!(run_uuid && packet)) callback_missing_basis.push('run_uuid_and_packet_id_pair');
  if (!accepted) callback_missing_basis.push('accepted_external_id');
  if (!request_id_paired_with_path_fp) {
    if (request_id && !path_fp) callback_missing_basis.push('path_fingerprint_required_with_request_id');
    else if (!request_id && !path_fp) callback_missing_basis.push('request_id_and_path_fingerprint_pair');
    else if (!request_id && path_fp) callback_missing_basis.push('request_id_required_with_path_fingerprint');
  }

  return {
    request_id_present: request_id,
    path_fingerprint_present: path_fp,
    accepted_external_id_present: accepted,
    run_id_present: run_id,
    thread_key_present: thread,
    packet_id_present: packet,
    run_uuid_present: run_uuid,
    status_present: status,
    normalization_would_accept: would_accept,
    request_id_without_path_fingerprint: Boolean(request_id && !path_fp),
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
    callback_missing_basis,
    normalization_requires_one_of:
      'external_run_id|thread_key|run_uuid+packet|accepted_external_id|request_id+path_fingerprint(+durable_row)',
  };
}

/**
 * @param {ReturnType<typeof buildCursorCallbackInsufficientDiagnostics>} gate
 */
export function pickCursorWebhookInsufficientRejectionReason(gate) {
  if (gate.request_id_without_path_fingerprint) {
    return 'callback_request_id_requires_path_fingerprint_pair';
  }
  return 'normalization_requires_closeable_callback_basis';
}
