/**
 * vNext.13.47b — After delegate stash merge, pre-trigger audit summary shows non-empty payload_top_level_keys.
 */
import assert from 'node:assert';
import { summarizeToolArgsForAudit } from '../src/founder/pretriggerAudit.js';
import {
  stashDelegateEmitPatchContext,
  tryMergeStashedDelegateEmitPatchPayload,
  __resetDelegateEmitPatchStashForTests,
} from '../src/founder/delegateEmitPatchStash.js';

__resetDelegateEmitPatchStashForTests();

const tk = 'thread:payload_keys:1';
stashDelegateEmitPatchContext(tk, {
  ok: true,
  status: 'accepted',
  dispatch_id: 'd_pk',
  objective: 'o',
  handoff_order: ['engineering'],
  packets: [
    {
      packet_id: 'p_pk',
      packet_status: 'running',
      persona: 'engineering',
      preferred_tool: 'cursor',
      preferred_action: 'emit_patch',
      mission: 'm',
      live_patch: {
        path: 'a.txt',
        operation: 'replace',
        content: 'body',
        live_only: true,
        no_fallback: true,
      },
    },
  ],
});

const { payload } = tryMergeStashedDelegateEmitPatchPayload(tk, {});
const sum = summarizeToolArgsForAudit('invoke_external_tool', {
  tool: 'cursor',
  action: 'emit_patch',
  payload,
});
assert.ok(Array.isArray(sum.payload_top_level_keys) && sum.payload_top_level_keys.length > 0);
assert.equal(sum.delegate_packets_present, false);
assert.equal(sum.delegate_live_patch_present, true);

console.log('test-minimal-live-smoke-produces-nonempty-payload-top-level-keys: ok');
