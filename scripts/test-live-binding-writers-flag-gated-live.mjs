/**
 * W8-C (rev W13-A) — COS_LIVE_BINDING_WRITERS=1 + 토큰/sink_ref + (value-from-env) 조건 일치 시에만 live=true.
 * W13-A 반영:
 *   - github: libsodium encrypt + PUT → existence_only
 *   - vercel: listEnv → 없으면 POST, 있으면 PATCH → existence_only + requires_redeploy_to_apply
 *   - railway: live write 불가 → existence_only fallback (this epic non-goal)
 *   - supabase: smoke ping 만 (management API probe-only)
 */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sodium = require('libsodium-wrappers');

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;
const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;
const sb = (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default;

await sodium.ready;
const kp = sodium.crypto_box_keypair();
const GH_PUBLIC_KEY_B64 = sodium.to_base64(kp.publicKey, sodium.base64_variants.ORIGINAL);

function mkRes({ status = 200, ok = status >= 200 && status < 300, body = {} } = {}) {
  return {
    status,
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// --- GitHub: public-key GET → PUT 201 → metadata GET 200 = ok
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || 'GET' });
    if (u.endsWith('/actions/secrets/public-key')) {
      return mkRes({ body: { key: GH_PUBLIC_KEY_B64, key_id: 'kid_123' } });
    }
    if (u.endsWith('/actions/secrets/FOO') && init?.method === 'PUT') {
      return mkRes({ status: 201 });
    }
    if (u.endsWith('/actions/secrets/FOO') && (!init?.method || init.method === 'GET')) {
      return mkRes({ body: { name: 'FOO', created_at: 'x', updated_at: 'y' } });
    }
    return mkRes({ status: 418 });
  };
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't', FOO: 'super-secret-value' }, fetchImpl: f },
  );
  assert.equal(r.live, true, 'github live=true');
  assert.equal(r.verification_kind, 'existence_only');
  assert.equal(r.verification_result, 'ok');
  assert.equal(r.write_only_reminder, true);
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes('PUT'), 'github PUT must be invoked');
}

// --- GitHub: public-key 404 → sink_target_missing
{
  const f = async (url) => {
    const u = String(url);
    if (u.endsWith('/actions/secrets/public-key')) return mkRes({ status: 404 });
    return mkRes({ status: 200 });
  };
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't', FOO: 'v' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'sink_target_missing');
}

// --- GitHub: network throw → tool_adapter_unavailable
{
  const f = async () => {
    throw new Error('net');
  };
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't', FOO: 'v' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'tool_adapter_unavailable');
}

// --- GitHub: binding_name 값이 env 에 없으면 binding_missing
{
  const f = async () => mkRes({ status: 200, body: { key: GH_PUBLIC_KEY_B64, key_id: 'kid' } });
  const r = await gh.write(
    { binding_name: 'MISSING_VALUE', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}

// --- Vercel: listEnv 에 key 없음 → POST 생성 → ok + requires_redeploy_to_apply
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || 'GET' });
    if (u.includes('/env') && (!init?.method || init.method === 'GET')) {
      return mkRes({ body: { envs: [{ key: 'OTHER', id: 'o_1' }] } });
    }
    if (u.includes('/env') && init?.method === 'POST') {
      return mkRes({ status: 201, body: { id: 'env_new' } });
    }
    return mkRes({ status: 418 });
  };
  const r = await vc.write(
    { binding_name: 'MATCH_ME', sink_ref: 'prj_123', secret_handling_mode: 'write_only' },
    {
      env: {
        COS_LIVE_BINDING_WRITERS: '1',
        VERCEL_TOKEN: 't',
        MATCH_ME: 'plain-value',
      },
      fetchImpl: f,
    },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_kind, 'existence_only');
  assert.equal(r.verification_result, 'ok');
  assert.equal(r.requires_redeploy_to_apply, true);
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes('POST'), 'vercel POST must be invoked for new key');
}

// --- Vercel: listEnv 에 key 있음 → PATCH 업데이트
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || 'GET' });
    if (u.includes('/env') && (!init?.method || init.method === 'GET')) {
      return mkRes({ body: { envs: [{ key: 'UPDATE_ME', id: 'env_old' }] } });
    }
    if (u.includes('/env/env_old') && init?.method === 'PATCH') {
      return mkRes({ status: 200, body: { id: 'env_old' } });
    }
    return mkRes({ status: 418 });
  };
  const r = await vc.write(
    { binding_name: 'UPDATE_ME', sink_ref: 'prj_123', secret_handling_mode: 'write_only' },
    {
      env: {
        COS_LIVE_BINDING_WRITERS: '1',
        VERCEL_TOKEN: 't',
        UPDATE_ME: 'plain-value',
      },
      fetchImpl: f,
    },
  );
  assert.equal(r.verification_result, 'ok');
  assert.equal(r.requires_redeploy_to_apply, true);
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes('PATCH'), 'vercel PATCH must be invoked for existing key');
}

// --- Vercel: binding_name 값이 env 에 없으면 binding_missing
{
  const f = async () => mkRes({ body: { envs: [] } });
  const r = await vc.write(
    { binding_name: 'MISSING', sink_ref: 'prj_123', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}

// --- Supabase: smoke_only; REST ping ok → live:true smoke
{
  const f = async () => ({ ok: true, status: 200 });
  const r = await sb.write(
    {
      binding_name: 'SUPABASE_ANON_KEY',
      sink_ref: 'https://x.supabase.co',
      secret_handling_mode: 'smoke_only',
    },
    { env: { COS_LIVE_BINDING_WRITERS: '1', SUPABASE_SERVICE_ROLE_KEY: 'sk' }, fetchImpl: f },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_kind, 'smoke');
  assert.equal(r.verification_result, 'ok');
}
{
  const f = async () => ({ ok: false, status: 500 });
  const r = await sb.write(
    {
      binding_name: 'SUPABASE_ANON_KEY',
      sink_ref: 'https://x.supabase.co',
      secret_handling_mode: 'smoke_only',
    },
    { env: { COS_LIVE_BINDING_WRITERS: '1', SUPABASE_SERVICE_ROLE_KEY: 'sk' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'tool_adapter_unavailable');
}

console.log('test-live-binding-writers-flag-gated-live: ok');
