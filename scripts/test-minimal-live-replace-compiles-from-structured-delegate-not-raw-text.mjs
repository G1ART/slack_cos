/**
 * vNext.13.45 — Replace path: structured delegate packet only.
 */
import assert from 'node:assert';
import { prepareEmitPatchFromStructuredDelegatePacket } from '../src/founder/livePatchPayload.js';

const delegatePacket = {
  mission: 'replace chunk',
  live_patch: {
    path: 'README.md',
    operation: 'replace',
    content: '# new root\n',
    live_only: true,
    no_fallback: true,
  },
};

const prep = prepareEmitPatchFromStructuredDelegatePacket(delegatePacket);
assert.equal(prep.compilation, 'narrow');
assert.equal(prep.cloud_ok, true);
assert.equal(prep.payload.ops[0].op, 'replace');

console.log('test-minimal-live-replace-compiles-from-structured-delegate-not-raw-text: ok');
