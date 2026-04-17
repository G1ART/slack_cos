/**
 * W11-C — resume_target_kind/resume_target_ref 는 반드시 함께 존재하거나 함께 null 이어야 한다.
 * 둘 중 하나만 주면 fail-closed throw.
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const store = await import('../src/founder/projectSpaceBindingStore.js');
const runtime = await import('../src/founder/humanGateRuntime.js');

const { upsertProjectSpace, __resetProjectSpaceBindingMemoryForTests } = store;
const { openResumableGate, RESUME_TARGET_KINDS } = runtime;

__resetProjectSpaceBindingMemoryForTests();
await upsertProjectSpace({ project_space_key: 'ps_w11c_inv', display_name: 'inv' });

assert.deepEqual([...RESUME_TARGET_KINDS], ['packet', 'run', 'thread']);

// only kind → reject
await assert.rejects(
  () =>
    openResumableGate({
      project_space_key: 'ps_w11c_inv',
      gate_kind: 'manual_secret_entry',
      resume_target_kind: 'packet',
    }),
  /resume_target_kind and resume_target_ref must be provided together/,
);

// only ref → reject
await assert.rejects(
  () =>
    openResumableGate({
      project_space_key: 'ps_w11c_inv',
      gate_kind: 'manual_secret_entry',
      resume_target_ref: 'pkt_xyz',
    }),
  /resume_target_kind and resume_target_ref must be provided together/,
);

// invalid kind → reject
await assert.rejects(
  () =>
    openResumableGate({
      project_space_key: 'ps_w11c_inv',
      gate_kind: 'manual_secret_entry',
      resume_target_kind: 'bogus',
      resume_target_ref: 'pkt_xyz',
    }),
  /resume_target_kind must be one of/,
);

// both absent → ok (legacy shape)
const okLegacy = await openResumableGate({
  project_space_key: 'ps_w11c_inv',
  gate_kind: 'manual_secret_entry',
});
assert.equal(okLegacy.resume_target_kind, null);
assert.equal(okLegacy.resume_target_ref, null);
assert.equal(okLegacy.reopened_count, 0);

// both present → ok
const ok = await openResumableGate({
  project_space_key: 'ps_w11c_inv',
  gate_kind: 'manual_secret_entry',
  resume_target_kind: 'packet',
  resume_target_ref: 'pkt_xyz',
});
assert.equal(ok.resume_target_kind, 'packet');
assert.equal(ok.resume_target_ref, 'pkt_xyz');

console.log('test-human-gate-resume-target-invariant: ok');
