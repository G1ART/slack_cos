/**
 * vNext.13.47b — Stashed delegate narrow live_patch merges into founder invoke payload (structured source only).
 */
import assert from 'node:assert';
import { emitPatchHasCloudContractSource } from '../src/founder/livePatchPayload.js';
import {
  stashDelegateEmitPatchContext,
  tryMergeStashedDelegateEmitPatchPayload,
  __resetDelegateEmitPatchStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

__resetDelegateEmitPatchStashForTests();

const tk = 'thread:delegate_merge:1';
const dispatch = {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_dm',
  objective: 'narrow patch',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_dm',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'add file',
      live_patch: {
        path: 'docs/merged.txt',
        operation: 'create',
        content: 'x',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
};

stashDelegateEmitPatchContext(tk, dispatch);
const { payload, mergedFromDelegate } = tryMergeStashedDelegateEmitPatchPayload(tk, {});
assert.equal(mergedFromDelegate, true);
assert.equal(emitPatchHasCloudContractSource(payload), true);

console.log('test-structured-delegate-live-packet-reaches-invoke-payload: ok');
