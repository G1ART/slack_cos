/**
 * W12-A — static registry + ops ledger 병합본이 정확한지.
 *
 * - ledger 없을 때: qualification_status='conservative' (등록 sink)
 * - ledger 있을 때: ledger 값으로 덮어씀
 * - 존재하지 않는 sink: fail-closed 'unverified'
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const { getQualifiedCapabilityForSink } = await import(
  '../src/founder/liveBindingCapabilityRegistry.js'
);

const noLedgerGithub = getQualifiedCapabilityForSink('github', { ledger: null, ledgerPath: null });
assert.equal(noLedgerGithub.qualification_status, 'conservative');
assert.equal(noLedgerGithub.can_write, true);

const fakeLedger = {
  schema_version: 1,
  sinks: {
    github: {
      qualification_status: 'live_verified',
      last_verified_at: new Date().toISOString(),
      last_verified_mode: 'live',
      verified_by: 'op_test',
      verification_notes: 'probe success',
      evidence_ref: null,
    },
  },
};
const merged = getQualifiedCapabilityForSink('github', { ledger: fakeLedger });
assert.equal(merged.qualification_status, 'live_verified');
assert.equal(merged.last_verified_mode, 'live');
assert.equal(merged.verified_by, 'op_test');
assert.equal(merged.can_write, true, 'static fields preserved');

const unknown = getQualifiedCapabilityForSink('totally-fake-sink', { ledger: fakeLedger });
assert.equal(unknown.qualification_status, 'unverified');
assert.equal(unknown.can_write, false);

console.log('test-live-binding-capability-registry-merge: ok');
