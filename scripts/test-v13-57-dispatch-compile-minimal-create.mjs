/**
 * vNext.13.57 — Canonical dispatch compile: minimal narrow create reaches cloud_ok (no duplicate assembly sites).
 */
import assert from 'node:assert';
import { compileEmitPatchForCloudAutomation } from '../src/founder/cursorLivePatchDispatch.js';

const prep = compileEmitPatchForCloudAutomation({
  title: 'add file',
  live_patch: {
    path: 'src/x.txt',
    operation: 'create',
    content: 'hello',
    live_only: true,
    no_fallback: true,
  },
});
assert.equal(prep.cloud_ok, true);
assert.equal(prep.compilation, 'narrow');
assert.ok(Array.isArray(prep.payload.ops) && prep.payload.ops.length > 0);

console.log('test-v13-57-dispatch-compile-minimal-create: ok');
