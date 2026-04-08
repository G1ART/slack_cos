import assert from 'node:assert';
import {
  compileNarrowLivePatchToContractPayload,
  validateEmitPatchContractPayload,
  EMIT_PATCH_CONTRACT_NAME,
} from '../src/founder/livePatchPayload.js';

const compiled = compileNarrowLivePatchToContractPayload(
  { path: 'docs/smoke-minimal.txt', operation: 'create', content: 'hello\n' },
  'smoke title',
);
assert.equal(compiled.ops.length, 1);
assert.equal(compiled.ops[0].op, 'create');
assert.equal(compiled.ops[0].path, 'docs/smoke-minimal.txt');
assert.equal(compiled.ops[0].content, 'hello\n');

const v = validateEmitPatchContractPayload(compiled);
assert.equal(v.ok, true, v.missing_required_fields.join(','));
assert.equal(EMIT_PATCH_CONTRACT_NAME, 'cursor_automation_emit_patch_v1');

console.log('test-minimal-single-file-create-compiles-live-payload: ok');
