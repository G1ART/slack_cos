/**
 * W13-A2 — Vercel Project Env Variables actual live POST / PATCH write.
 *
 * COS_LIVE_BINDING_WRITERS=1 + VERCEL_TOKEN + sink_ref(projectId) + env[name] 조건 충족 시:
 *   - 기존 env 에 name 없음 → POST 로 생성 → live=true / existence_only / ok / requires_redeploy_to_apply
 *   - 기존 env 에 name 있음 → PATCH 로 업데이트 → live=true / existence_only / ok / requires_redeploy_to_apply
 *   - HTTP 401 → external_auth_gate
 *   - 네트워크 throw → tool_adapter_unavailable
 */
import assert from 'node:assert/strict';

const vc = (await import('../src/founder/toolPlane/lanes/vercel/vercelBindingWriter.js')).default;

function mkRes({ status = 200, ok = status >= 200 && status < 300, body = {} } = {}) {
  return {
    status,
    ok,
    json: async () => body,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  };
}

// (1) Create path: POST
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';
    calls.push({ url: u, method, body: init?.body ?? null });
    if (u.includes('/v9/projects/prj_1/env?limit=') || (u.includes('/v9/projects/prj_1/env') && method === 'GET')) {
      return mkRes({ body: { envs: [{ key: 'OTHER', id: 'e_other' }] } });
    }
    if (u.includes('/v10/projects/prj_1/env') && method === 'POST') {
      return mkRes({ status: 201, body: { id: 'env_new' } });
    }
    return mkRes({ status: 418 });
  };
  const r = await vc.write(
    { binding_name: 'NEW_KEY', sink_ref: 'prj_1', secret_handling_mode: 'write_only' },
    {
      env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't', NEW_KEY: 'plain-1' },
      fetchImpl: f,
    },
  );
  assert.equal(r.live, true);
  assert.equal(r.verification_kind, 'existence_only');
  assert.equal(r.verification_result, 'ok');
  assert.equal(r.requires_redeploy_to_apply, true);
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes('POST'), 'POST must be invoked');
  const postCall = calls.find((c) => c.method === 'POST');
  const parsed = JSON.parse(postCall.body);
  assert.equal(parsed.key, 'NEW_KEY');
  assert.equal(parsed.value, 'plain-1');
  assert.equal(parsed.type, 'encrypted');
}

// (2) Update path: PATCH
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    const method = init?.method || 'GET';
    calls.push({ url: u, method, body: init?.body ?? null });
    if (u.includes('/v9/projects/prj_2/env') && method === 'GET') {
      return mkRes({ body: { envs: [{ key: 'MY_KEY', id: 'env_old' }] } });
    }
    if (u.includes('/v9/projects/prj_2/env/env_old') && method === 'PATCH') {
      return mkRes({ status: 200, body: { id: 'env_old' } });
    }
    return mkRes({ status: 418 });
  };
  const r = await vc.write(
    { binding_name: 'MY_KEY', sink_ref: 'prj_2', secret_handling_mode: 'write_only' },
    {
      env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't', MY_KEY: 'plain-2' },
      fetchImpl: f,
    },
  );
  assert.equal(r.verification_result, 'ok');
  assert.equal(r.requires_redeploy_to_apply, true);
  const methods = calls.map((c) => c.method);
  assert.ok(methods.includes('PATCH'), 'PATCH must be invoked');
}

// (3) 401 on listEnv → external_auth_gate
{
  const f = async () => mkRes({ status: 401, ok: false, body: {} });
  const r = await vc.write(
    { binding_name: 'X', sink_ref: 'prj_3', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't', X: 'v' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'external_auth_gate');
}

// (4) Network throw → tool_adapter_unavailable
{
  const f = async () => {
    throw new Error('timeout');
  };
  const r = await vc.write(
    { binding_name: 'X', sink_ref: 'prj_4', secret_handling_mode: 'write_only' },
    { env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't', X: 'v' }, fetchImpl: f },
  );
  assert.equal(r.verification_result, 'failed');
  assert.equal(r.failure_resolution_class, 'tool_adapter_unavailable');
}

// (5) team 소유 프로젝트 — teamId 포함 검증
{
  const calls = [];
  const f = async (url, init) => {
    const u = String(url);
    calls.push(u);
    if (u.includes('/v9/projects/prj_5/env') && (!init?.method || init.method === 'GET')) {
      return mkRes({ body: { envs: [] } });
    }
    if (u.includes('/v10/projects/prj_5/env') && init?.method === 'POST') {
      return mkRes({ status: 201, body: { id: 'new' } });
    }
    return mkRes({ status: 418 });
  };
  await vc.write(
    { binding_name: 'K', sink_ref: 'prj_5', secret_handling_mode: 'write_only' },
    {
      env: { COS_LIVE_BINDING_WRITERS: '1', VERCEL_TOKEN: 't', VERCEL_TEAM_ID: 'team_xyz', K: 'v' },
      fetchImpl: f,
    },
  );
  assert.ok(
    calls.some((u) => u.includes('teamId=team_xyz')),
    'teamId must be passed as query param',
  );
}

console.log('test-vercel-env-actual-live-post-patch-write: ok');
