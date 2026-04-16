/**
 * W8-C — 기본값은 smoke. COS_LIVE_BINDING_WRITERS!=1 이면 어떤 writer 도 fetch 호출 금지.
 */
import assert from 'node:assert/strict';

const gh = (await import('../src/founder/toolPlane/lanes/github/githubBindingWriter.js')).default;
const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;
const rw = (await import('../src/founder/toolPlane/lanes/railway/railwayBindingWriter.js')).default;
const sb = (await import('../src/founder/toolPlane/lanes/supabase/supabaseBindingWriter.js')).default;

let fetchCalled = 0;
const failFetch = () => {
  fetchCalled += 1;
  throw new Error('fetch must not be called when smoke');
};

const baseReq = {
  project_space_key: 'ps_alpha',
  binding_requirement_kind: 'env_requirement',
  secret_handling_mode: 'write_only',
  binding_name: 'OPENAI_API_KEY',
  dry_run: true,
};

for (const [label, w] of [
  ['github', gh],
  ['vercel', vc],
  ['railway', rw],
]) {
  const r = await w.write(
    { ...baseReq, source_system: 'cos', sink_system: label },
    { env: { /* no COS_LIVE_BINDING_WRITERS */ }, fetchImpl: failFetch },
  );
  assert.equal(r.live, false, `${label}: live must be false when flag off`);
  assert.equal(r.verification_result, 'ok', `${label}: smoke ok`);
  assert.equal(r.verification_kind, 'smoke');
  assert.equal(r.wrote_at, null);
  assert.equal(r.sink_ref, null);
}

// supabase 는 smoke_only mode 로도 flag off 면 smoke
const s = await sb.write(
  { ...baseReq, secret_handling_mode: 'smoke_only', source_system: 'cos', sink_system: 'supabase' },
  { env: {}, fetchImpl: failFetch },
);
assert.equal(s.live, false);
assert.equal(s.verification_result, 'ok');

assert.equal(fetchCalled, 0, 'no writer may call fetch under smoke default');
console.log('test-live-binding-writers-default-smoke: ok');
