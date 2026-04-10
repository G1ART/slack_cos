/**
 * vNext.13.64 — Inspectable override vs heuristic vs absent for Cursor automation response + webhook picks.
 */

/** @typedef {'override' | 'heuristic' | 'absent'} CursorFieldWinningSource */

/**
 * @param {boolean} wonFromEnvPath first successful read used env-configured dot path
 * @param {boolean} hasValue
 * @param {boolean} wonFromHeuristic fallback scan produced the value
 */
export function deriveAutomationResponseWinningSource(wonFromEnvPath, hasValue, wonFromHeuristic) {
  if (!hasValue) return /** @type {const} */ ('absent');
  if (wonFromEnvPath) return /** @type {const} */ ('override');
  if (wonFromHeuristic) return /** @type {const} */ ('heuristic');
  return /** @type {const} */ ('absent');
}

/**
 * Webhook accepted-id: env override key set vs heuristic label vs absent.
 * @param {string} acceptedIdSource from computeCursorWebhookFieldSelection (env key or heuristic:… or '')
 * @param {boolean} hasValue
 */
export function deriveWebhookAcceptedIdSourceKind(acceptedIdSource, hasValue) {
  if (!hasValue) return /** @type {const} */ ('absent');
  if (String(acceptedIdSource || '').startsWith('CURSOR_WEBHOOK_')) return /** @type {const} */ ('override');
  if (String(acceptedIdSource || '').includes('heuristic')) return /** @type {const} */ ('heuristic');
  return /** @type {const} */ ('heuristic');
}
