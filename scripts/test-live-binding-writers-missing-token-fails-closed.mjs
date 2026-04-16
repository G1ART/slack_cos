/**
 * W8-C — flag=1 인데 토큰이나 sink_ref 가 없으면 fail-closed (binding_missing).
 * fetch 는 호출되지 않아야 한다.
 */
import assert from 'node:assert/strict';

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;
const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;
const rw = (await import('../src/founder/toolPlane/lanes/railway/railwayBindingWriter.js')).default;
const sb = (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default;

let fetchCalled = 0;
const failFetch = () => { fetchCalled += 1; throw new Error('no'); };

// github: missing token
{
  const r = await gh.write(
    { binding_name: 'X', sink_ref: 'o/r', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1' }, fetchImpl: failFetch },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'binding_missing');
}
// github: missing sink_ref
{
  const r = await gh.write(
    { binding_name: 'X', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', GITHUB_TOKEN: 't' }, fetchImpl: failFetch },
  );
  assert.equal(r.failure_resolution_class, 'binding_missing');
}
// vercel: missing VERCEL_TOKEN
{
  const r = await vc.write(
    { binding_name: 'X', sink_ref: 'prj', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1' }, fetchImpl: failFetch },
  );
  assert.equal(r.failure_resolution_class, 'binding_missing');
}
// railway: missing project id
{
  const r = await rw.write(
    { binding_name: 'X', sink_ref: 'svc', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', RAILWAY_TOKEN: 't' }, fetchImpl: failFetch },
  );
  assert.equal(r.failure_resolution_class, 'binding_missing');
}
// supabase: missing SUPABASE_SERVICE_ROLE_KEY
{
  const r = await sb.write(
    { binding_name: 'X', sink_ref: 'https://x.supabase.co', secret_handling_mode: 'smoke_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1' }, fetchImpl: failFetch },
  );
  assert.equal(r.failure_resolution_class, 'binding_missing');
}

assert.equal(fetchCalled, 0, 'no writer may call fetch when fail-closed');
console.log('test-live-binding-writers-missing-token-fails-closed: ok');
