/**
 * W13-A1 — GitHub Actions secrets actual live PUT write.
 *
 * COS_LIVE_BINDING_WRITERS=1 + GITHUB_TOKEN + sink_ref(owner/repo) + env[name] 조건 충족 시,
 *   (1) GET /actions/secrets/public-key 호출
 *   (2) libsodium crypto_box_seal 로 encrypt (원문 누출 없음)
 *   (3) PUT /actions/secrets/{name} 호출 (body 에 encrypted_value + key_id)
 *   (4) GET /actions/secrets/{name} → existence 확인
 * 를 수행하고 WriterResult 가 live=true, verification_kind='existence_only',
 * verification_result='ok', write_only_reminder=true 이어야 한다.
 *
 * 또한 PUT body 에는 원문 secret 이 절대 포함되지 않아야 한다.
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers');

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;

await sodium.ready;
const kp = sodium.crypto_box_keypair();
const GH_PUBLIC_KEY_B64 = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);

const PLAIN = 'sk-super-secret-plaintext-xyz-987';

function mkRes({ status = 200, ok = status >= 200 && status < 300, body = {} } = {}) {
  return {
    status,
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

const calls = [];
const fetchImpl = async (url, init) => {
  const u = String(url);
  const method = init?.method || 'GET';
  calls.push({ url: u, method, body: init?.body ?? null });
  if (u.endsWith('/actions/secrets/public-key')) {
    return mkRes({ body: { key: GH_PUBLIC_KEY_B64, key_id: 'kid_abc' } });
  }
  if (u.endsWith('/actions/secrets/MY_KEY') && method === 'PUT') {
    return mkRes({ status: 201 });
  }
  if (u.endsWith('/actions/secrets/MY_KEY') && method === 'GET') {
    return mkRes({ body: { name: 'MY_KEY', created_at: 'a', updated_at: 'b' } });
  }
  return mkRes({ status: 418 });
};

const r = await gh.write(
  { binding_name: 'MY_KEY', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
  {
    env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 'ghtk', MY_KEY: PLAIN },
    fetchImpl,
  },
);

assert.equal(r.live, true, 'live=true');
assert.equal(r.verification_kind, 'existence_only');
assert.equal(r.verification_result, 'ok');
assert.equal(r.write_only_reminder, true);
assert.equal(r.sink_ref, 'owner/repo');

const hasPublicKeyGet = calls.some(
  (c) => c.url.endsWith('/actions/secrets/public-key') && c.method === 'GET',
);
const putCall = calls.find(
  (c) => c.url.endsWith('/actions/secrets/MY_KEY') && c.method === 'PUT',
);
const existenceGet = calls.find(
  (c) => c.url.endsWith('/actions/secrets/MY_KEY') && c.method === 'GET',
);
assert.ok(hasPublicKeyGet, 'public-key GET called');
assert.ok(putCall, 'PUT called');
assert.ok(existenceGet, 'existence GET called');

assert.equal(typeof putCall.body, 'string');
assert.ok(
  !putCall.body.includes(PLAIN),
  'PUT body must NOT contain raw plaintext secret',
);
const parsed = JSON.parse(putCall.body);
assert.equal(typeof parsed.encrypted_value, 'string');
assert.equal(parsed.key_id, 'kid_abc');
assert.ok(parsed.encrypted_value.length > 20, 'encrypted_value must be non-trivial base64');

// Decrypt round-trip to verify correctness of encryption.
const ct = sodium.from_base64(parsed.encrypted_value, sodium.base64_variants.ORIGINAL);
const pt = sodium.crypto_box_seal_open(ct, kp.publicKey, kp.privateKey);
assert.equal(sodium.to_string(pt), PLAIN, 'encrypted value decrypts to plaintext');

console.log('test-github-secrets-actual-live-put-write: ok');
