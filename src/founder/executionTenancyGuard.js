/**
 * W3-A — durable execution truth 경로에 필요한 테넌시 4축 검증 (fail-closed).
 */

const REQUIRED_KEYS = /** @type {const} */ ([
  'workspace_key',
  'product_key',
  'project_space_key',
  'parcel_deployment_key',
]);

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {Record<string, string>}
 */
export function extractRequiredExecutionTenancy(record) {
  const r = record && typeof record === 'object' && !Array.isArray(record) ? record : {};
  /** @type {Record<string, string>} */
  const out = {};
  for (const k of REQUIRED_KEYS) {
    const v = r[k];
    const s = v != null ? String(v).trim() : '';
    if (s) out[k] = s;
  }
  return out;
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @returns {{ ok: true } | { ok: false, reason: 'missing_required_execution_tenancy', missing_keys: string[] }}
 */
export function validateRequiredExecutionTenancy(record) {
  const missing = [];
  for (const k of REQUIRED_KEYS) {
    const v = record?.[k];
    if (v == null || !String(v).trim()) missing.push(k);
  }
  if (missing.length) {
    return { ok: false, reason: 'missing_required_execution_tenancy', missing_keys: missing };
  }
  return { ok: true };
}

/**
 * @param {Record<string, unknown> | null | undefined} record
 * @param {{ logEvent?: string }} [opts]
 * @returns {boolean}
 */
export function assertRequiredExecutionTenancy(record, opts = {}) {
  const v = validateRequiredExecutionTenancy(record);
  if (v.ok) return true;
  console.error(
    JSON.stringify({
      event: opts.logEvent || 'required_execution_tenancy_assert_failed',
      reason: v.reason,
      missing_keys: v.missing_keys,
    }),
  );
  return false;
}
