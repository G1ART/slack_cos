/**
 * Cursor callback orchestrator status → coarse delivery state (lane-local helper).
 */

/**
 * @param {string} status
 * @returns {'delivered'|'pending'|'timeout'|'unavailable'|'unknown'}
 */
export function mapOrchestratorStatusToDeliveryState(status) {
  const s = String(status || '').trim();
  if (!s) return 'unknown';
  if (s === 'provider_callback_matched' || s === 'manual_probe_closure_observed') {
    return 'delivered';
  }
  if (s === 'callback_timeout') return 'timeout';
  if (
    s === 'skipped_no_contract' ||
    s === 'skipped_url_not_allowlisted' ||
    s === 'skipped_no_fetch' ||
    s === 'skipped_missing_inputs'
  ) {
    return 'unavailable';
  }
  if (s === 'skipped_idempotent') return 'delivered';
  return 'pending';
}
