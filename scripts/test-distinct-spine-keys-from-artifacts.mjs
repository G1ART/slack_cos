import assert from 'node:assert';
import { distinctSpineKeysFromLedgerArtifacts } from '../src/founder/canonicalExecutionEnvelope.js';

const out = distinctSpineKeysFromLedgerArtifacts(
  [
    { payload: { thread_key: 'dm:a', product_key: 'p1' } },
    { payload: { thread_key: 'dm:a', run_id: 'r1' } },
  ],
  8,
);
assert.deepEqual(out.thread_key, ['dm:a']);
assert.deepEqual(out.product_key, ['p1']);
assert.deepEqual(out.run_id, ['r1']);

console.log('test-distinct-spine-keys-from-artifacts: ok');
