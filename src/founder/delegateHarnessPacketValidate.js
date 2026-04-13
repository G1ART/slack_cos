/**
 * `delegate_harness_team` — 런타임은 **기능(운송·컴파일) 안전**만 검증한다.
 * 패킷 봉투 필드·페르소나 enum 등은 OpenAI strict 도구 스키마 + COS·하네스 지시에 맡긴다.
 * `live_patch`가 비null이면 단일 파일 자동화에 필요한 형식만 본다.
 */

/**
 * Validates `live_patch` sub-object only (when non-null). For local preflight / tests.
 * @param {unknown} lp
 * @param {string} pathPrefix e.g. packets[0].live_patch
 */
export function validateDelegateHarnessPacketForLivePatch(lp, pathPrefix = 'live_patch') {
  const missing = [];
  const invalid_enum = [];
  const invalid_nested = [];
  if (lp == null) {
    return {
      ok: true,
      missing_required_fields: [],
      invalid_enum_fields: [],
      invalid_nested_fields: [],
    };
  }
  if (!lp || typeof lp !== 'object' || Array.isArray(lp)) {
    return {
      ok: false,
      missing_required_fields: [],
      invalid_enum_fields: [],
      invalid_nested_fields: [pathPrefix],
    };
  }
  const p = /** @type {Record<string, unknown>} */ (lp);
  const fpath = String(p.path || '').trim();
  const op = String(p.operation || '').trim().toLowerCase();
  const c = p.content != null ? String(p.content) : '';
  if (!fpath) missing.push(`${pathPrefix}.path`);
  if (op !== 'create' && op !== 'replace') invalid_enum.push(`${pathPrefix}.operation`);
  if (!c.trim()) missing.push(`${pathPrefix}.content`);
  if (p.live_only !== true) invalid_nested.push(`${pathPrefix}.live_only`);
  if (p.no_fallback !== true) invalid_nested.push(`${pathPrefix}.no_fallback`);
  const ok = !missing.length && !invalid_enum.length && !invalid_nested.length;
  return { ok, missing_required_fields: missing, invalid_enum_fields: invalid_enum, invalid_nested_fields: invalid_nested };
}

/**
 * @param {unknown} pkt
 * @param {number} index
 */
function validateFunctionalPacketSlot(pkt, index) {
  const px = `packets[${index}]`;
  if (!pkt || typeof pkt !== 'object' || Array.isArray(pkt)) {
    return {
      ok: false,
      missing_required_fields: [px],
      invalid_enum_fields: [],
      invalid_nested_fields: [],
    };
  }
  const p = /** @type {Record<string, unknown>} */ (pkt);
  if (p.live_patch == null) {
    return { ok: true, missing_required_fields: [], invalid_enum_fields: [], invalid_nested_fields: [] };
  }
  const lpRes = validateDelegateHarnessPacketForLivePatch(p.live_patch, `${px}.live_patch`);
  return {
    ok: lpRes.ok,
    missing_required_fields: lpRes.missing_required_fields,
    invalid_enum_fields: lpRes.invalid_enum_fields,
    invalid_nested_fields: lpRes.invalid_nested_fields,
  };
}

/**
 * @param {Record<string, unknown>} args
 */
export function validateDelegateHarnessTeamToolArgs(args) {
  const a = args && typeof args === 'object' ? args : {};
  const objective = a.objective;
  if (typeof objective !== 'string' || !objective.trim()) {
    return {
      blocked: true,
      reason: 'invalid_payload',
      blocked_reason: 'delegate_schema_invalid_missing_objective',
      machine_hint: 'objective required',
      missing_required_fields: ['objective'],
      invalid_enum_fields: [],
      invalid_nested_fields: [],
      delegate_schema_valid: false,
      delegate_schema_error_fields: ['objective'],
    };
  }

  if (a.packets == null) {
    return { blocked: false, delegate_schema_valid: true };
  }

  if (!Array.isArray(a.packets)) {
    return {
      blocked: true,
      reason: 'invalid_payload',
      blocked_reason: 'delegate_schema_invalid_packets_not_array',
      machine_hint: 'packets must be array or null',
      missing_required_fields: [],
      invalid_enum_fields: [],
      invalid_nested_fields: ['packets'],
      delegate_schema_valid: false,
      delegate_schema_error_fields: ['packets'],
    };
  }

  /** @type {string[]} */
  const missing_required_fields = [];
  /** @type {string[]} */
  const invalid_enum_fields = [];
  /** @type {string[]} */
  const invalid_nested_fields = [];

  for (let i = 0; i < a.packets.length; i += 1) {
    const one = validateFunctionalPacketSlot(a.packets[i], i);
    missing_required_fields.push(...one.missing_required_fields);
    invalid_enum_fields.push(...one.invalid_enum_fields);
    invalid_nested_fields.push(...one.invalid_nested_fields);
  }

  if (missing_required_fields.length || invalid_enum_fields.length || invalid_nested_fields.length) {
    const delegate_schema_error_fields = [
      ...missing_required_fields,
      ...invalid_enum_fields,
      ...invalid_nested_fields,
    ].slice(0, 48);
    const allLivePatchPaths =
      delegate_schema_error_fields.length > 0 &&
      delegate_schema_error_fields.every((f) => String(f).includes('.live_patch'));
    const blocked_reason = allLivePatchPaths
      ? 'delegate_schema_invalid_live_patch_shape'
      : 'delegate_schema_invalid_packets_transport';
    return {
      blocked: true,
      reason: 'invalid_payload',
      blocked_reason,
      machine_hint: allLivePatchPaths
        ? 'live_patch compiler shape mismatch'
        : 'packets array must contain only objects',
      missing_required_fields: missing_required_fields.slice(0, 24),
      invalid_enum_fields: invalid_enum_fields.slice(0, 24),
      invalid_nested_fields: invalid_nested_fields.slice(0, 24),
      delegate_schema_valid: false,
      delegate_schema_error_fields,
    };
  }

  return { blocked: false, delegate_schema_valid: true };
}
