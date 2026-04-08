/**
 * vNext.13.45 — Compiler input is structured delegate packet only (no founder raw string routing).
 */
import assert from 'node:assert';
import { prepareEmitPatchFromStructuredDelegatePacket } from '../src/founder/livePatchPayload.js';

const delegatePacket = {
  mission: 'internal dispatch title',
  live_patch: {
    path: 'docs/from-delegate.txt',
    operation: 'create',
    content: 'exact-bytes\n',
    live_only: true,
    no_fallback: true,
  },
};

const prep = prepareEmitPatchFromStructuredDelegatePacket(delegatePacket);
assert.equal(prep.compilation, 'narrow');
assert.equal(prep.cloud_ok, true);
assert.ok(Array.isArray(prep.payload.ops) && prep.payload.ops.length === 1);
assert.equal(prep.payload.ops[0].op, 'create');
assert.equal(prep.payload.ops[0].path, 'docs/from-delegate.txt');

console.log('test-minimal-live-create-compiles-from-structured-delegate-not-raw-text: ok');
