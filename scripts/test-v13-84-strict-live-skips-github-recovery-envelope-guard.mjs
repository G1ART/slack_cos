/**
 * vNext.13.84 — Strict live emit_patch: optional skip of GitHub secondary recovery envelope registration.
 */
import assert from 'node:assert';
import { shouldSkipGithubRecoveryEnvelopeRegistration } from '../src/founder/livePatchPayload.js';

const narrow = {
  live_patch: {
    live_only: true,
    no_fallback: true,
    path: 'src/x.txt',
    operation: 'create',
    content: 'y',
  },
};

assert.equal(shouldSkipGithubRecoveryEnvelopeRegistration({}, narrow), false);
assert.equal(shouldSkipGithubRecoveryEnvelopeRegistration({ COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY: '0' }, narrow), false);
assert.equal(shouldSkipGithubRecoveryEnvelopeRegistration({ COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY: '1' }, narrow), true);
assert.equal(
  shouldSkipGithubRecoveryEnvelopeRegistration({ COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY: '1' }, {
    live_patch: { live_only: true, no_fallback: false, path: 'a', operation: 'create', content: 'b' },
  }),
  false,
);
assert.equal(shouldSkipGithubRecoveryEnvelopeRegistration({ COS_STRICT_LIVE_EMIT_PATCH_PROVIDER_ONLY: '1' }, {}), false);

console.log('test-v13-84-strict-live-skips-github-recovery-envelope-guard: ok');
