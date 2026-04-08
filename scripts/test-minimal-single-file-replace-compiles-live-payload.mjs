import assert from 'node:assert';
import {
  compileNarrowLivePatchToContractPayload,
  validateEmitPatchContractPayload,
} from '../src/founder/livePatchPayload.js';

const compiled = compileNarrowLivePatchToContractPayload(
  { path: 'README.md', operation: 'replace', content: '# replaced\n' },
  '',
);
assert.equal(compiled.ops[0].op, 'replace');
assert.ok(compiled.title.length > 0);
const v = validateEmitPatchContractPayload(compiled);
assert.equal(v.ok, true);

console.log('test-minimal-single-file-replace-compiles-live-payload: ok');
