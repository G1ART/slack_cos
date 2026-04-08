/**
 * vNext.13.44 — Deterministic emit_patch payload for Cursor Automation (cloud lane).
 * Only narrows already-closed tasks (live_patch or valid ops[]); does not infer open-world intent.
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
 * @param {Record<string, unknown> | null | undefined} payload
 * @returns {{ path: string, operation: 'create'|'replace', content: string } | null}
 */
export function detectNarrowLivePatchFromPayload(payload) {
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const lp = pl.live_patch;
  if (!lp || typeof lp !== 'object' || Array.isArray(lp)) return null;
  const filePath = String(lp.path ?? lp.target_path ?? '').trim();
  const operation = String(lp.operation ?? lp.op ?? '').trim().toLowerCase();
  const content = lp.content != null ? String(lp.content) : '';
  if (!filePath) return null;
  if (operation !== 'create' && operation !== 'replace') return null;
  if (!content.length) return null;
  return { path: filePath, operation: operation === 'create' ? 'create' : 'replace', content };
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
 * @param {{ validation: { missing_required_fields: string[] }, compilation: string }} prep
 */
export function formatEmitPatchCloudGateSummary(prep) {
  const fields = (prep.validation?.missing_required_fields || []).slice(0, 12).join(', ');
  return `emit_patch automation: contract ${EMIT_PATCH_CONTRACT_NAME} not met (compilation=${prep.compilation}); missing: ${fields || '(none listed)'}`;
}
