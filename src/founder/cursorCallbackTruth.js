/**
 * vNext.13.67 — Callback truth plane: provider vs manual probe vs unknown.
 */

/** @typedef {'provider_runtime' | 'manual_probe' | 'unknown'} CursorCallbackSourceKind */
/** @typedef {'verified_signature' | 'invalid_signature' | 'unsigned'} CursorCallbackVerificationKind */
/** @typedef {'external_run_id' | 'accepted_external_id' | 'automation_request_path_fp' | 'thread_key_packet' | 'run_uuid_packet' | 'none'} CursorCallbackMatchBasis */

/**
 * @param {Record<string, string | undefined> | null | undefined} headers lower-case keys
 */
export function deriveCursorCallbackSourceKindFromHeaders(headers) {
  const h = headers && typeof headers === 'object' ? headers : {};
  const v = String(h['x-cos-callback-probe'] || h['x-cos-callback-source'] || '').trim().toLowerCase();
  if (v === '1' || v === 'true' || v === 'manual' || v === 'manual_probe') return 'manual_probe';
  if (v === 'provider' || v === 'provider_runtime') return 'provider_runtime';
  return 'unknown';
}

/**
 * @param {string | null | undefined} matchedBy from correlation meta
 * @returns {CursorCallbackMatchBasis}
 */
export function mapMatchedByToCallbackMatchBasis(matchedBy) {
  const m = String(matchedBy || '').trim();
  if (m === 'external_run_id') return 'external_run_id';
  if (m === 'accepted_external_id') return 'accepted_external_id';
  if (m === 'automation_request_path_fp') return 'automation_request_path_fp';
  if (m === 'thread_key_packet_id') return 'thread_key_packet';
  if (m === 'run_uuid_packet') return 'run_uuid_packet';
  return 'none';
}
