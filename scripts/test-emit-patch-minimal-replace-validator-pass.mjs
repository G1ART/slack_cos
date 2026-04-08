/**
 * vNext.13.45 — Golden minimal payload: validateEmitPatchContractPayload (replace).
 */
import assert from 'node:assert';
import { validateEmitPatchContractPayload } from '../src/founder/livePatchPayload.js';

/** Fixture locked to current validator (cursor_automation_emit_patch_v1). */
export const MINIMAL_EMIT_PATCH_REPLACE_FIXTURE = {
  title: 'smoke-minimal-replace',
  ops: [{ op: 'replace', path: 'docs/smoke-minimal-replace.txt', content: 'replaced\n' }],
};

const v = validateEmitPatchContractPayload(MINIMAL_EMIT_PATCH_REPLACE_FIXTURE);
assert.equal(v.ok, true, v.missing_required_fields.join(','));

console.log('test-emit-patch-minimal-replace-validator-pass: ok');
