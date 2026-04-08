/**
 * Structured delegate_harness_team packet validation (machine-only).
 * Aligns with DELEGATE_PACKET_ITEM_SCHEMA in runFounderDirectConversation.js — no founder text parsing.
 */

const PERSONA_ENUM_ARR = ['research', 'pm', 'engineering', 'design', 'qa', 'data'];
const PREFERRED_TOOL_ENUM = ['cursor', 'github', 'supabase', 'vercel', 'railway'];
const INVOKE_ACTION_ENUM = [
  'create_spec',
  'emit_patch',
  'create_issue',
  'open_pr',
  'apply_sql',
  'deploy',
  'inspect_logs',
];

const REQUIRED_PACKET_KEYS = [
  'packet_id',
  'persona',
  'mission',
  'inputs',
  'deliverables',
  'definition_of_done',
  'handoff_to',
  'artifact_format',
  'preferred_tool',
  'preferred_action',
  'review_required',
  'review_focus',
  'packet_status',
  'live_patch',
];

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
function validateOneDelegatePacket(pkt, index) {
  const missing = [];
  const invalid_enum = [];
  const invalid_nested = [];
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

  for (const k of REQUIRED_PACKET_KEYS) {
    if (!(k in p)) missing.push(`${px}.${k}`);
  }
  if (missing.length) {
    return { ok: false, missing_required_fields: missing, invalid_enum_fields: [], invalid_nested_fields: [] };
  }

  if (p.packet_id != null && typeof p.packet_id !== 'string') {
    invalid_nested.push(`${px}.packet_id`);
  }

  const persona = String(p.persona || '').toLowerCase();
  if (!PERSONA_ENUM_ARR.includes(persona)) invalid_enum.push(`${px}.persona`);

  if (typeof p.mission !== 'string' || !p.mission.trim()) missing.push(`${px}.mission`);

  if (p.inputs !== undefined && p.inputs !== null) {
    if (!Array.isArray(p.inputs)) invalid_nested.push(`${px}.inputs`);
    else if (!p.inputs.every((x) => typeof x === 'string')) invalid_nested.push(`${px}.inputs`);
  }

  if (!Array.isArray(p.deliverables)) invalid_nested.push(`${px}.deliverables`);
  if (!Array.isArray(p.definition_of_done)) invalid_nested.push(`${px}.definition_of_done`);

  if (typeof p.handoff_to !== 'string') invalid_nested.push(`${px}.handoff_to`);

  if (typeof p.artifact_format !== 'string' || !p.artifact_format.trim()) {
    missing.push(`${px}.artifact_format`);
  }

  if (p.preferred_tool != null) {
    const pt = String(p.preferred_tool);
    if (!PREFERRED_TOOL_ENUM.includes(pt)) invalid_enum.push(`${px}.preferred_tool`);
  }
  if (p.preferred_action != null) {
    const pa = String(p.preferred_action);
    if (!INVOKE_ACTION_ENUM.includes(pa)) invalid_enum.push(`${px}.preferred_action`);
  }

  if (p.review_required !== undefined && p.review_required !== null && typeof p.review_required !== 'boolean') {
    invalid_nested.push(`${px}.review_required`);
  }

  if (p.review_focus !== undefined && p.review_focus !== null) {
    if (!Array.isArray(p.review_focus)) invalid_nested.push(`${px}.review_focus`);
    else if (!p.review_focus.every((x) => typeof x === 'string')) invalid_nested.push(`${px}.review_focus`);
  }

  if (p.packet_status != null && p.packet_status !== 'draft' && p.packet_status !== 'ready') {
    invalid_enum.push(`${px}.packet_status`);
  }

  if (p.live_patch != null) {
    const lpRes = validateDelegateHarnessPacketForLivePatch(p.live_patch, `${px}.live_patch`);
    for (const x of lpRes.missing_required_fields) missing.push(x);
    for (const x of lpRes.invalid_enum_fields) invalid_enum.push(x);
    for (const x of lpRes.invalid_nested_fields) invalid_nested.push(x);
  }

  const ok = !missing.length && !invalid_enum.length && !invalid_nested.length;
  return {
    ok,
    missing_required_fields: missing,
    invalid_enum_fields: invalid_enum,
    invalid_nested_fields: invalid_nested,
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
    const one = validateOneDelegatePacket(a.packets[i], i);
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
    const allLivePatchShaped =
      delegate_schema_error_fields.length > 0 &&
      delegate_schema_error_fields.every((f) => String(f).includes('.live_patch'));
    const blocked_reason = allLivePatchShaped
      ? 'delegate_schema_invalid_live_patch_shape'
      : 'delegate_schema_invalid_packet_envelope';
    return {
      blocked: true,
      reason: 'invalid_payload',
      blocked_reason,
      machine_hint: 'delegate packet schema mismatch',
      missing_required_fields: missing_required_fields.slice(0, 24),
      invalid_enum_fields: invalid_enum_fields.slice(0, 24),
      invalid_nested_fields: invalid_nested_fields.slice(0, 24),
      delegate_schema_valid: false,
      delegate_schema_error_fields,
    };
  }

  return { blocked: false, delegate_schema_valid: true };
}
