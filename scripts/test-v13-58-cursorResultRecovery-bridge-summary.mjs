/**
 * vNext.13.58 — cursorResultRecovery helper for push secondary bridge payloads.
 */
import assert from 'node:assert';
import { summarizeRecoveryFromGithubPushSecondaryBridge } from '../src/founder/cursorResultRecovery.js';

const x = summarizeRecoveryFromGithubPushSecondaryBridge({
  recovery_outcome: 'repository_reflection_path_match_only',
  is_primary_completion_authority: false,
});
assert.equal(x.recovery_path, 'github_push_secondary_bridge');
assert.equal(x.recovery_outcome, 'repository_reflection_path_match_only');
assert.equal(x.is_primary_completion_authority, false);

console.log('test-v13-58-cursorResultRecovery-bridge-summary: ok');
