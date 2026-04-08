import assert from 'node:assert';
import {
  detectNarrowLivePatchFromPayload,
  prepareEmitPatchForCloudAutomation,
} from '../src/founder/livePatchPayload.js';

assert.equal(detectNarrowLivePatchFromPayload({ mission: 'refactor everything' }), null);
assert.equal(detectNarrowLivePatchFromPayload({ live_patch: { path: '', operation: 'create', content: 'x' } }), null);

const open = prepareEmitPatchForCloudAutomation({
  title: 'patch',
  body: 'context only',
  content: 'vague',
});
assert.equal(open.compilation, 'none');
assert.equal(open.cloud_ok, false);
assert.ok(open.validation.missing_required_fields.includes('ops'));

const narrow = prepareEmitPatchForCloudAutomation({
  title: 't',
  live_patch: { path: 'a/b.txt', operation: 'create', content: 'body', live_only: true, no_fallback: true },
});
assert.equal(narrow.compilation, 'narrow');
assert.equal(narrow.cloud_ok, true);

console.log('test-narrow-task-detector-does-not-coerce-open-world-requests: ok');
