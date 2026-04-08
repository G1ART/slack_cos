/**
 * vNext.13.45 — Golden minimal payload: validateEmitPatchContractPayload (create).
 */
import assert from 'node:assert';
import {
  validateEmitPatchContractPayload,
  EMIT_PATCH_CONTRACT_NAME,
} from '../src/founder/livePatchPayload.js';

/** Fixture locked to current validator (cursor_automation_emit_patch_v1). */
export const MINIMAL_EMIT_PATCH_CREATE_FIXTURE = {
  title: 'smoke-minimal-create',
  ops: [{ op: 'create', path: 'docs/smoke-minimal-create.txt', content: 'hello\n' }],
};

const v = validateEmitPatchContractPayload(MINIMAL_EMIT_PATCH_CREATE_FIXTURE);
assert.equal(v.ok, true, v.missing_required_fields.join(','));
assert.equal(EMIT_PATCH_CONTRACT_NAME, 'cursor_automation_emit_patch_v1');

console.log('test-emit-patch-minimal-create-validator-pass: ok');
