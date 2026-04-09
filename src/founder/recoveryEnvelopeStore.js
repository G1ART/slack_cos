/**
 * vNext.13.58 — In-memory recovery envelopes after Cursor emit_patch trigger acceptance.
 * Secondary GitHub push matching consults this store (same process; tests reset explicitly).
 */

/** @typedef {'pending_callback'|'primary_callback_observed'|'recovered_github_secondary'} RecoveryEnvelopeStatus */

/**
 * @typedef {{
 *   envelope_id: string,
 *   run_id: string,
 *   thread_key: string,
 *   packet_id: string | null,
 *   smoke_session_id: string | null,
 *   accepted_external_id: string | null,
 *   repository_full_name: string,
 *   requested_paths: string[],
 *   requested_content_sha256_prefixes: string[],
 *   ops_summary: string,
 *   created_at: string,
 *   updated_at: string,
 *   recovery_status: RecoveryEnvelopeStatus,
 *   truth: {
 *     execution_accepted: boolean,
 *     callback_observed: boolean,
 *     github_secondary_recovered: boolean,
 *   },
 *   secondary_recovery_outcome: string | null,
 * }} RecoveryEnvelope */

/** @type {Map<string, RecoveryEnvelope>} */
const byRunId = new Map();

/**
 * @param {string} p
 */
function normPath(p) {
  const s = String(p || '').trim().replace(/^.\//, '');
  return s.split('/').filter(Boolean).join('/');
}

/**
 * @param {RecoveryEnvelope} row
 */
export function upsertRecoveryEnvelope(row) {
  const rid = String(row.run_id || '').trim();
  if (!rid) return;
  byRunId.set(rid, row);
}

/**
 * @param {string} runId
 * @returns {RecoveryEnvelope | null}
 */
export function getRecoveryEnvelopeForRun(runId) {
  const rid = String(runId || '').trim();
  if (!rid) return null;
  return byRunId.get(rid) || null;
}

/**
 * @returns {RecoveryEnvelope[]}
 */
export function listRecoveryEnvelopesPendingGithubSecondary() {
  const out = [];
  for (const e of byRunId.values()) {
    if (e.recovery_status === 'pending_callback') out.push(e);
  }
  return out;
}

/**
 * @param {string} runId
 * @param {Partial<RecoveryEnvelope>} patch
 */
export function patchRecoveryEnvelope(runId, patch) {
  const cur = getRecoveryEnvelopeForRun(runId);
  if (!cur) return null;
  const next = {
    ...cur,
    ...patch,
    truth: { ...cur.truth, ...(patch.truth && typeof patch.truth === 'object' ? patch.truth : {}) },
    updated_at: new Date().toISOString(),
  };
  upsertRecoveryEnvelope(next);
  return next;
}

export function __resetRecoveryEnvelopeStoreForTests() {
  byRunId.clear();
}

export { normPath as normalizeRecoveryEnvelopePath };
