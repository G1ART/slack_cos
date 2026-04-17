/**
 * W11-A — liveBindingCapabilityRegistry schema/shape 회귀.
 *
 * - 4 sink (github/vercel/railway/supabase) row 존재
 * - 각 row 의 필드 shape
 * - unknown sink 는 fail-closed default
 * - deriveLegacySinkCapabilities 가 plan 이 기대하는 legacy shape 을 돌려줌
 */
import assert from 'node:assert/strict';

process.env.COS_RUN_STORE = 'memory';

const {
  getCapabilityForSink,
  listAllCapabilities,
  deriveLegacySinkCapabilities,
  VERIFICATION_MODES,
  isVerificationKindSupported,
} = await import('../src/founder/liveBindingCapabilityRegistry.js');

const registry = listAllCapabilities();
for (const sink of ['github', 'vercel', 'railway', 'supabase']) {
  assert.ok(Object.prototype.hasOwnProperty.call(registry, sink), `registry has ${sink}`);
  const cap = registry[sink];
  assert.equal(typeof cap.can_write, 'boolean', `${sink}.can_write boolean`);
  assert.equal(typeof cap.can_verify_existence, 'boolean', `${sink}.can_verify_existence boolean`);
  assert.equal(typeof cap.can_read_back_value, 'boolean', `${sink}.can_read_back_value boolean`);
  assert.equal(
    typeof cap.requires_manual_confirmation,
    'boolean',
    `${sink}.requires_manual_confirmation boolean`,
  );
  assert.ok(typeof cap.notes === 'string' && cap.notes.length > 0, `${sink}.notes nonempty`);
  assert.ok(
    Array.isArray(cap.verification_modes_supported) &&
      cap.verification_modes_supported.length > 0,
    `${sink}.verification_modes_supported non-empty`,
  );
  for (const mode of cap.verification_modes_supported) {
    assert.ok(
      VERIFICATION_MODES.includes(mode),
      `${sink} mode ${mode} in VERIFICATION_MODES`,
    );
  }
}

// Supabase specifically must require manual confirmation (plan 결정)
assert.equal(registry.supabase.can_write, false);
assert.equal(registry.supabase.requires_manual_confirmation, true);

// GitHub write 가능 + existence check 가능, 값 read-back 불가
assert.equal(registry.github.can_write, true);
assert.equal(registry.github.can_verify_existence, true);
assert.equal(registry.github.can_read_back_value, false);

// Unknown sink → fail-closed default
const unknown = getCapabilityForSink('definitely-not-a-sink');
assert.equal(unknown.can_write, false);
assert.equal(unknown.requires_manual_confirmation, true);
assert.deepEqual(unknown.verification_modes_supported, ['none']);

// Legacy shape 유지 (envSecretPropagationPlan 이 기대하는 필드)
const legacy = deriveLegacySinkCapabilities();
for (const sink of ['github', 'vercel', 'railway', 'supabase']) {
  assert.ok(Object.prototype.hasOwnProperty.call(legacy, sink));
  assert.equal(typeof legacy[sink].supports_secret_write, 'boolean');
  assert.equal(typeof legacy[sink].supports_read_back, 'boolean');
}
assert.equal(legacy.supabase.supports_secret_write, false);
assert.equal(legacy.github.supports_secret_write, true);

// isVerificationKindSupported sanity
assert.equal(isVerificationKindSupported('github', 'existence_only'), true);
assert.equal(isVerificationKindSupported('supabase', 'existence_only'), false);
assert.equal(isVerificationKindSupported('unknown-sink', 'smoke'), false);

console.log('test-live-binding-capability-registry-schema: ok');
