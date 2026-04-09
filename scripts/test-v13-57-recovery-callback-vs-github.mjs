/**
 * vNext.13.57 — Recovery layer: primary webhook vs secondary GitHub (dispatch-independent summaries).
 */
import assert from 'node:assert';
import {
  summarizeRecoveryFromPrimaryCursorIngress,
  summarizeRecoveryFromGithubSecondaryEvidence,
} from '../src/founder/cursorResultRecovery.js';

const cb = summarizeRecoveryFromPrimaryCursorIngress({
  signature_verification_ok: true,
  json_parse_ok: true,
  correlation_outcome: 'matched',
});
assert.equal(cb.recovery_path, 'primary_cursor_webhook');
assert.equal(cb.verified_ingress, true);

const gh = summarizeRecoveryFromGithubSecondaryEvidence({
  github_fallback_signal_seen: true,
  github_fallback_matched: true,
});
assert.equal(gh.recovery_path, 'github_secondary_advisory');
assert.equal(gh.is_primary_completion_authority, false);
assert.equal(gh.matched, true);

console.log('test-v13-57-recovery-callback-vs-github: ok');
