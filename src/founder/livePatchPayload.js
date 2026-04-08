/**
 * vNext.13.45 — Deterministic emit_patch payload for Cursor Automation (cloud lane).
 * Narrow path requires live_patch.live_only + live_patch.no_fallback (delegate / invoke payload only).
 */

/** Matches automation body.payload expected by in-repo validation (trigger sends { action, payload, request_id, source }). */
export const EMIT_PATCH_CONTRACT_NAME = 'cursor_automation_emit_patch_v1';

/**
 * @param {Record<string, unknown>} pl
 * @returns {boolean}
 */
export function isNarrowLivePatchIncomplete(pl) {
  const p = pl && typeof pl === 'object' && !Array.isArray(pl) ? pl : {};
  const lp = p.live_patch;
  if (!lp || typeof lp !== 'object' || Array.isArray(lp)) return false;
  return detectNarrowLivePatchFromPayload(p) == null;
}

/**
 * @param {unknown} lp
 * @returns {boolean}
 */
function narrowConstraintFlagsOk(lp) {
  if (!lp || typeof lp !== 'object' || Array.isArray(lp)) return false;
  return lp.live_only === true && lp.no_fallback === true;
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {{ path: string, operation: 'create'|'replace', content: string } | null}
 */
export function detectNarrowLivePatchFromPayload(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const lp = pl.live_patch;
  if (!lp || typeof lp !== 'object' || Array.isArray(lp)) return null;
  if (!narrowConstraintFlagsOk(lp)) return null;
  const filePath = String(lp.path ?? lp.target_path ?? '').trim();
  const operation = String(lp.operation ?? lp.op ?? '').trim().toLowerCase();
  const content = lp.content != null ? String(lp.content) : '';
  if (!filePath) return null;
  if (operation !== 'create' && operation !== 'replace') return null;
  if (!content.length) return null;
  return { path: filePath, operation: operation === 'create' ? 'create' : 'replace', content };
}

/**
 * True when payload can satisfy cloud emit_patch contract (narrow live_patch or pre-built ops).
 * @param {Record<string, unknown> | null | undefined} payload
 */
export function emitPatchHasCloudContractSource(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (detectNarrowLivePatchFromPayload(pl)) return true;
  if (Array.isArray(pl.ops) && pl.ops.length > 0) return true;
  return false;
}

/**
 * Compiler entry: structured harness packet only (no founder raw text).
 * @param {Record<string, unknown> | null | undefined} delegatePacket
 * @returns {ReturnType<typeof prepareEmitPatchForCloudAutomation>}
 */
export function prepareEmitPatchFromStructuredDelegatePacket(delegatePacket) {
  const pkt = delegatePacket && typeof delegatePacket === 'object' && !Array.isArray(delegatePacket) ? delegatePacket : {};
  const titleBase = String(pkt.mission || '').trim().slice(0, 200);
  const pl = {
    title: titleBase || 'patch',
    live_patch:
      pkt.live_patch && typeof pkt.live_patch === 'object' && !Array.isArray(pkt.live_patch) ? { ...pkt.live_patch } : undefined,
  };
  if (!pl.live_patch) {
    return prepareEmitPatchForCloudAutomation({ title: pl.title });
  }
  return prepareEmitPatchForCloudAutomation(pl);
}

/**
 * @param {{ path: string, operation: 'create'|'replace', content: string }} narrow
 * @param {string} [titleHint]
 */
export function compileNarrowLivePatchToContractPayload(narrow, titleHint) {
  const baseTitle = String(titleHint || '').trim().slice(0, 200);
  const tail = narrow.path.split('/').filter(Boolean).pop() || 'file';
  const title = baseTitle || `patch:${tail}`;
  return {
    title,
    ops: [{ op: narrow.operation, path: narrow.path, content: narrow.content }],
  };
}

/**
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {{ ok: boolean, missing_required_fields: string[] }}
 */
export function validateEmitPatchContractPayload(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  /** @type {string[]} */
  const missing = [];
  if (!String(pl.title || pl.name || '').trim()) missing.push('title');
  const ops = pl.ops;
  if (!Array.isArray(ops) || ops.length === 0) missing.push('ops');
  else {
    for (let i = 0; i < ops.length; i += 1) {
      const row = ops[i];
      if (!row || typeof row !== 'object' || Array.isArray(row)) {
        missing.push(`ops[${i}]`);
        break;
      }
      const op = String(row.op ?? row.operation ?? '').trim().toLowerCase();
      if (op !== 'create' && op !== 'replace') missing.push(`ops[${i}].op`);
      if (!String(row.path ?? '').trim()) missing.push(`ops[${i}].path`);
      if (row.content === undefined || row.content === null) missing.push(`ops[${i}].content`);
    }
  }
  return { ok: missing.length === 0, missing_required_fields: missing };
}

/**
 * @param {Record<string, unknown>} payload
 * @returns {{
 *   payload: Record<string, unknown>,
 *   cloud_ok: boolean,
 *   compilation: 'narrow'|'already_has_ops'|'none',
 *   validation: { ok: boolean, missing_required_fields: string[] },
 *   narrow_incomplete: boolean,
 * }}
 */
export function prepareEmitPatchForCloudAutomation(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? { ...payload } : {};
  const hadOps = Array.isArray(pl.ops) && pl.ops.length > 0;
  const narrow = detectNarrowLivePatchFromPayload(pl);
  const narrowIncomplete = isNarrowLivePatchIncomplete(pl);

  let merged = pl;
  let compilation = 'none';
  if (narrow) {
    const compiled = compileNarrowLivePatchToContractPayload(narrow, String(pl.title || pl.name || ''));
    merged = { ...pl, ...compiled };
    compilation = 'narrow';
  } else if (hadOps) {
    compilation = 'already_has_ops';
  }

  const validation = validateEmitPatchContractPayload(merged);
  return {
    payload: merged,
    cloud_ok: validation.ok,
    compilation,
    validation,
    narrow_incomplete: narrowIncomplete,
  };
}

/**
 * Machine token for ops / founder-safe hints (emit_patch cloud assembly only).
 * @param {ReturnType<typeof prepareEmitPatchForCloudAutomation>} prep
 * @param {boolean} mergeFromDelegate
 */
export function classifyEmitPatchAssemblyFailureCode(prep, mergeFromDelegate) {
  if (prep.narrow_incomplete) return 'live_patch_incomplete_after_normalization';
  if (prep.compilation === 'none' && !mergeFromDelegate) {
    return 'invoke_payload_missing_narrow_live_patch_or_ops';
  }
  if (prep.compilation === 'none' && mergeFromDelegate) {
    return 'delegate_merge_still_no_contract_source';
  }
  const miss = prep.validation?.missing_required_fields || [];
  if (miss.includes('title')) return 'compiled_payload_missing_title';
  if (miss.some((m) => String(m).startsWith('ops'))) return 'compiled_payload_missing_or_invalid_ops';
  return 'emit_patch_contract_validation_failed';
}

/**
 * @param {ReturnType<typeof prepareEmitPatchForCloudAutomation>} prep
 */
export function builderStageLastReachedForEmitPatchPrep(prep) {
  if (prep.narrow_incomplete) return 'narrow_live_patch_incomplete';
  if (prep.compilation === 'none') return 'no_narrow_or_ops_compilation_source';
  if (!prep.cloud_ok) return 'emit_patch_contract_validate_failed';
  return 'emit_patch_payload_validated';
}

/**
 * @param {{ validation: { missing_required_fields: string[] }, compilation: string }} prep
 */
export function formatEmitPatchCloudGateSummary(prep) {
  const fields = (prep.validation?.missing_required_fields || []).slice(0, 12).join(', ');
  const machine = formatEmitPatchMachineBlockedHints(prep);
  const tail = machine.length ? ` ${machine.join(' ')}` : '';
  return `emit_patch automation: contract ${EMIT_PATCH_CONTRACT_NAME} not met (compilation=${prep.compilation}); missing: ${fields || '(none listed)'}${tail}`;
}

/**
 * Short, log-safe hints (no secrets / raw payload).
 * @param {ReturnType<typeof prepareEmitPatchForCloudAutomation>} prep
 * @returns {string[]}
 */
export function formatEmitPatchMachineBlockedHints(prep) {
  const out = [];
  const miss = prep?.validation?.missing_required_fields || [];
  for (const f of miss.slice(0, 8)) {
    out.push(`emit_patch required field missing: ${f}`);
  }
  if (prep?.narrow_incomplete) {
    const lp = prep.payload?.live_patch;
    const o = lp && typeof lp === 'object' && !Array.isArray(lp) ? lp : {};
    if (!String(o.path ?? '').trim()) out.push('target path unresolved');
    else if (!(o.content != null && String(o.content).trim())) out.push('exact content unresolved');
    else if (o.live_only !== true || o.no_fallback !== true) out.push('live-only / no-fallback constraints missing');
    else out.push('narrow live patch incomplete');
  }
  return out;
}
