/**
 * W8-C — COS_LIVE_BINDING_WRITERS=1 이고 토큰/sink_ref 이 다 있을 때만 live=true 경로 수행.
 * fetch 모의 결과에 따라 ok/binding_missing/tool_adapter_unavailable 로 분류해야 한다.
 */
import assert from 'node:assert/strict';

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;
const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;
const rw = (await import('../src/founder/toolPlane/lanes/railway/railwayBindingWriter.js')).default;
const sb = (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default;

function makeFetch(calls, handler) {
  return async (url, init) => {
    calls.push({ url: String(url), method: init?.method || 'GET' });
    return handler(String(url), init);
  };
}

// --- GitHub: 200 = ok, 404 = binding_missing, 500 = tool_adapter_unavailable
{
  const calls = [];
  const f = makeFetch(calls, () => ({ status: 200, ok: true, json: async () => ({}), text: async () => '' }));
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_result, 'ok');
  assert.ok(calls[0].url.includes('/actions/secrets/FOO'));
}
{
  const f = async () => ({ status: 404, ok: false, json: async () => ({}), text: async () => '' });
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.live, false);
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}
{
  const f = async () => { throw new Error('net'); };
  const r = await gh.write(
    { binding_name: 'FOO', sink_ref: 'owner/repo', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'tool_adapter_unavailable');
}

// --- Vercel: env 목록에 key 포함 = ok, 미포함 = binding_missing
{
  const f = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ envs: [{ key: 'ALREADY' }, { key: 'MATCH_ME' }] }),
  });
  const r = await vc.write(
    { binding_name: 'MATCH_ME', sink_ref: 'prj_123', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_result, 'ok');
}
{
  const f = async () => ({ ok: true, status: 200, json: async () => ({ envs: [] }) });
  const r = await vc.write(
    { binding_name: 'MISSING', sink_ref: 'prj_123', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}

// --- Railway: variables 맵에 key 포함 = ok
{
  const f = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { variables: { DATABASE_URL: '***', OPENAI_API_KEY: '***' } } }),
  });
  const r = await rw.write(
    { binding_name: 'OPENAI_API_KEY', sink_ref: 'svc_1', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', RAILWAY_TOKEN: 't', RAILWAY_PROJECT_ID: 'p' }, fetchImpl: f },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_result, 'ok');
}
{
  const f = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ data: { variables: {} } }),
  });
  const r = await rw.write(
    { binding_name: 'OPENAI_API_KEY', sink_ref: 'svc_1', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', RAILWAY_TOKEN: 't', RAILWAY_PROJECT_ID: 'p' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}

// --- Supabase: smoke_only; REST ping ok → live:true smoke
{
  const f = async () => ({ ok: true, status: 200 });
  const r = await sb.write(
    { binding_name: 'SUPABASE_ANON_KEY', sink_ref: 'https://x.supabase.co', secret_handling_mode: 'smoke_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', SUPABASE_SERVICE_ROLE_KEY: 'sk' }, fetchImpl: f },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_kind, 'smoke');
  assert.equal(r.verification_result, 'ok');
}
{
  const f = async () => ({ ok: false, status: 500 });
  const r = await sb.write(
    { binding_name: 'SUPABASE_ANON_KEY', sink_ref: 'https://x.supabase.co', secret_handling_mode: 'smoke_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', SUPABASE_SERVICE_ROLE_KEY: 'sk' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'tool_adapter_unavailable');
}

console.log('test-live-binding-writers-flag-gated-live: ok');
