/**
 * vNext.13.57 — Canonical Cursor emit_patch live dispatch preparation (single assembly entry).
 * Merge delegate stash + compile to automation contract shape in one place.
 */

import {
  builderStageLastReachedForEmitPatchPrep,
  classifyEmitPatchAssemblyFailureCode,
  formatEmitPatchMachineBlockedHints,
  prepareEmitPatchForCloudAutomation,
} from './livePatchPayload.js';

/** @type {Promise<typeof import('./delegateEmitPatchStash.js')> | null} */
let stashLoad = null;
function loadDelegateEmitPatchStash() {
  if (!stashLoad) stashLoad = import('./delegateEmitPatchStash.js');
  return stashLoad;
}

export const REJECTION_KIND_EXECUTION_PROFILE = 'execution_profile';
export const REJECTION_KIND_MISSING_CONTRACT_SOURCE = 'missing_contract_source';
export const REJECTION_KIND_ASSEMBLY_CONTRACT_NOT_MET = 'assembly_contract_not_met';

/** Explicit code when cloud lane cannot start — no narrow/ops source (before compile). */
export const EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE = 'emit_patch_missing_cloud_contract_source';

/**
 * @param {string} threadKey
 * @param {Record<string, unknown>} payload
 */
export async function mergeEmitPatchPayloadForDispatch(threadKey, payload) {
  const tk = String(threadKey || '').trim();
  const pl = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (!tk) return { payload: { ...pl }, mergedFromDelegate: false };
  const mod = await loadDelegateEmitPatchStash();
  return mod.tryMergeStashedDelegateEmitPatchPayload(tk, pl);
}

/**
 * Single compiler entry for cloud emit_patch after merge.
 * @param {Record<string, unknown>} payloadAfterMerge
 */
export function compileEmitPatchForCloudAutomation(payloadAfterMerge) {
  return prepareEmitPatchForCloudAutomation(payloadAfterMerge);
}

/**
 * @param {ReturnType<typeof prepareEmitPatchForCloudAutomation>} prep
 * @param {boolean} mergedFromDelegate
 */
export function describeEmitPatchAssemblyBlock(prep, mergedFromDelegate) {
  return {
    exact_failure_code: classifyEmitPatchAssemblyFailureCode(prep, mergedFromDelegate),
    builder_stage_last_reached: builderStageLastReachedForEmitPatchPrep(prep),
    payload_provenance: mergedFromDelegate ? 'delegate_stash_merged' : 'invoke_external_tool_raw',
    machine_hints: formatEmitPatchMachineBlockedHints(prep),
    missing_required_fields: prep.validation.missing_required_fields || [],
  };
}
