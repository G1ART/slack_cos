/**
 * W12-A — stale_after_days 경과 시 qualification_status='stale' 로 강등되고
 * isLiveWriteAllowed=false, maxAllowedVerificationKind='none'.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const {
  getQualifiedCapabilityForSink,
  isLiveWriteAllowed,
  maxAllowedVerificationKind,
} = await import('../src/founder/liveBindingCapabilityRegistry.js');

const longAgo = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();
const ledger = {
  schema_version: 1,
  sinks: {
    github: {
      qualification_status: 'live_verified',
      last_verified_at: longAgo,
      last_verified_mode: 'live',
      verified_by: 'op',
      verification_notes: null,
      evidence_ref: null,
    },
  },
};

const merged = getQualifiedCapabilityForSink('github', { ledger });
assert.equal(merged.qualification_status, 'stale', 'stale degrade');
assert.equal(isLiveWriteAllowed(merged), false, 'no live write when stale');
assert.equal(maxAllowedVerificationKind(merged), 'none', 'no verification when stale');

// 방금 검증된 건 stale 아님
const recent = getQualifiedCapabilityForSink('github', {
  ledger: {
    sinks: {
      github: {
        qualification_status: 'live_verified',
        last_verified_at: new Date().toISOString(),
        last_verified_mode: 'live',
        verified_by: 'op',
        verification_notes: null,
        evidence_ref: null,
      },
    },
  },
});
assert.equal(recent.qualification_status, 'live_verified');
assert.equal(isLiveWriteAllowed(recent), true);

console.log('test-live-binding-capability-stale-fails-closed: ok');
