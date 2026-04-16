/**
 * Cursor emit_patch: merge delegate stash payload before dispatch (lane-local).
 */

import { mergeEmitPatchPayloadForDispatch } from '../../../cursorLivePatchDispatch.js';

/** @type {Promise<typeof import('../../../delegateEmitPatchStash.js')> | null} */
let delegateEmitPatchStashLoad = null;
function loadDelegateEmitPatchStash() {
  if (!delegateEmitPatchStashLoad) delegateEmitPatchStashLoad = import('../../../delegateEmitPatchStash.js');
  return delegateEmitPatchStashLoad;
}

/**
 * @param {string} threadKey
 * @param {string} tool
 * @param {string} action
 * @param {Record<string, unknown>} payload
 */
export async function prepareEmitPatchPayloadWithDelegate(threadKey, tool, action, payload) {
  let delegateEmitPatchModule = null;
  let emitPatchMergedFromDelegate = false;
  let out = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  if (tool === 'cursor' && action === 'emit_patch' && threadKey) {
    delegateEmitPatchModule = await loadDelegateEmitPatchStash();
    const merged = await mergeEmitPatchPayloadForDispatch(threadKey, out);
    out = merged.payload;
    emitPatchMergedFromDelegate = merged.mergedFromDelegate;
  }
  return {
    payload: out,
    emitPatchMergedFromDelegate,
    delegateEmitPatchModule,
  };
}
