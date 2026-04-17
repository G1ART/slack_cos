/**
 * W13-A — qualify-live-binding-capability live probe 가 실제로 공식 read-only 엔드포인트를 치고
 * 성공 시 live_verified, 실패 시 verification_failed 를 기록하는지 검증.
 * 이 테스트는 fetch 를 주입해 네트워크 없이 동작한다 (CI-safe).
 */
import assert from 'node:assert/strict';

const { probeLive } = await import('../scripts/qualify-live-binding-capability.mjs');

async function run(sink, envSet, fetchImpl) {
  const savedEnv = {};
  for (const [k, v] of Object.entries(envSet)) {
    savedEnv[k] = process.env[k];
    if (v === null || v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await probeLive(sink, { fetchImpl });
  } finally {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// GitHub: public-key GET 200 → live_verified
{
  const f = async (url) => {
    assert.ok(String(url).endsWith('/actions/secrets/public-key'));
    return { status: 200, ok: true, json: async () => ({ key: 'k', key_id: 'i' }) };
  };
  const res = await run(
    'github',
    { GITHUB_TOKEN: 'tk', GITHUB_DEFAULT_OWNER: 'o', GITHUB_DEFAULT_REPO: 'r' },
    f,
  );
  assert.equal(res.outcome, 'live_verified');
}

// GitHub: 404 → verification_failed
{
  const f = async () => ({ status: 404, ok: false, json: async () => ({}) });
  const res = await run(
    'github',
    { GITHUB_TOKEN: 'tk', GITHUB_DEFAULT_OWNER: 'o', GITHUB_DEFAULT_REPO: 'r' },
    f,
  );
  assert.equal(res.outcome, 'verification_failed');
}

// GitHub: default repo 없음 → skipped
{
  const res = await run(
    'github',
    { GITHUB_TOKEN: 'tk', GITHUB_DEFAULT_OWNER: null, GITHUB_DEFAULT_REPO: null, GITHUB_DEFAULT_BINDING_REPO: null },
    async () => ({ status: 200, ok: true, json: async () => ({}) }),
  );
  assert.equal(res.outcome, 'skipped');
}

// Vercel: GET env 200 → live_verified
{
  const f = async (url) => {
    assert.ok(String(url).includes('/v9/projects/prj_1/env'));
    return { status: 200, ok: true, json: async () => ({ envs: [] }) };
  };
  const res = await run(
    'vercel',
    { VERCEL_TOKEN: 'tk', VERCEL_DEFAULT_PROJECT_ID: 'prj_1' },
    f,
  );
  assert.equal(res.outcome, 'live_verified');
}

// Vercel: project id 없음 → skipped
{
  const res = await run(
    'vercel',
    { VERCEL_TOKEN: 'tk', VERCEL_DEFAULT_PROJECT_ID: null },
    async () => ({ status: 200, ok: true, json: async () => ({}) }),
  );
  assert.equal(res.outcome, 'skipped');
}

// Railway: 항상 verification_failed (no_write_support_in_this_epic)
{
  const res = await run(
    'railway',
    { RAILWAY_TOKEN: 'tk' },
    async () => ({ status: 200, ok: true, json: async () => ({}) }),
  );
  assert.equal(res.outcome, 'verification_failed');
  assert.match(res.reason, /no_write_support|railway/);
}

// Supabase: GET /v1/projects 200 → live_verified_read_only
{
  const f = async (url) => {
    assert.ok(String(url).endsWith('/v1/projects'));
    return { status: 200, ok: true, json: async () => ([]) };
  };
  const res = await run(
    'supabase',
    { SUPABASE_ACCESS_TOKEN: 'tk' },
    f,
  );
  assert.equal(res.outcome, 'live_verified_read_only');
}

// No credentials → skipped
{
  const res = await run(
    'github',
    { GITHUB_TOKEN: null, GH_TOKEN: null },
    async () => ({ status: 200, ok: true, json: async () => ({}) }),
  );
  assert.equal(res.outcome, 'skipped');
  assert.equal(res.reason, 'no_credentials');
}

console.log('test-qualify-live-binding-capability-live-probe-github-vercel: ok');
