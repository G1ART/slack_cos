/**
 * vNext.13.58 — emit_patch payload → recovery envelope path / content prefix extraction.
 */
import assert from 'node:assert';
import crypto from 'node:crypto';
import { extractEmitPatchPathsAndContentPrefixes } from '../src/founder/resultRecoveryBridge.js';

const content = 'hello';
const h = crypto.createHash('sha256').update(content, 'utf8').digest('hex').slice(0, 16);
const { requested_paths, requested_content_sha256_prefixes } = extractEmitPatchPathsAndContentPrefixes({
  ops: [{ op: 'create', path: '/src/x.txt', content }],
});
assert.deepEqual(requested_paths, ['src/x.txt']);
assert.equal(requested_content_sha256_prefixes[0], h);

console.log('test-v13-58-recovery-envelope-extract-paths: ok');
