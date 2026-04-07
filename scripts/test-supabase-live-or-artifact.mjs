import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, SUPABASE_APPLY_SQL_RPC } from '../src/founder/toolsBridge.js';
import { clearExecutionArtifacts } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-supabase-tool');

const tk = `dm:sb-${Date.now()}`;
await clearExecutionArtifacts(tk);

const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

const a = await invokeExternalTool(
  { tool: 'supabase', action: 'apply_sql', payload: { sql: 'select 1' } },
  { threadKey: tk },
);
assert.equal(a.execution_mode, 'artifact');
assert.ok(String(a.result_summary).includes('artifact'));

process.env.SUPABASE_URL = 'https://testproj.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-test';

const prevFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes(`/rest/v1/rpc/${SUPABASE_APPLY_SQL_RPC}`)) {
    assert.ok(init?.body, 'rpc POST body');
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (prevFetch) return prevFetch(url, init);
  return new Response('not mocked', { status: 500 });
};

const b = await invokeExternalTool(
  { tool: 'supabase', action: 'apply_sql', payload: { sql: 'select 1' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;

assert.equal(b.execution_mode, 'live');
assert.ok(b.result_summary.includes('live'));

globalThis.fetch = async () => {
  throw new Error('network boom');
};
const c = await invokeExternalTool(
  { tool: 'supabase', action: 'apply_sql', payload: { sql: 'select 1' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;

assert.equal(c.execution_mode, 'artifact');
assert.ok(c.result_summary.includes('live error') || c.result_summary.includes('artifact'));

if (prevUrl === undefined) delete process.env.SUPABASE_URL;
else process.env.SUPABASE_URL = prevUrl;
if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;

await clearExecutionArtifacts(tk);

console.log('test-supabase-live-or-artifact: ok');
