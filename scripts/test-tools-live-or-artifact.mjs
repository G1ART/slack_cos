import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, getAdapterReadiness } from '../src/founder/toolsBridge.js';
import { readRecentExecutionArtifacts, clearExecutionArtifacts } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-tool-modes');

const tk = `dm:tool-${Date.now()}`;
await clearExecutionArtifacts(tk);

const rr = await getAdapterReadiness('railway', { RAILWAY_TOKEN: '', RAILWAY_DEPLOYMENT_ID: '' });
assert.equal(rr.live_capable, false);
assert.equal(rr.details.deploy_live, false);

const prev = process.env.RAILWAY_TOKEN;
process.env.RAILWAY_TOKEN = '';
const a = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: {} },
  { threadKey: tk },
);
if (prev === undefined) delete process.env.RAILWAY_TOKEN;
else process.env.RAILWAY_TOKEN = prev;

assert.equal(a.execution_mode, 'artifact');
let arts = await readRecentExecutionArtifacts(tk, 20);
assert.ok(arts.some((x) => x.type === 'tool_invocation'), 'artifact: invocation ledger');
assert.ok(arts.some((x) => x.type === 'tool_result'), 'artifact: result ledger');

await clearExecutionArtifacts(tk);

const prevFetch = globalThis.fetch;
process.env.RAILWAY_TOKEN = 'fake-live-token';
globalThis.fetch = async (url) => {
  assert.ok(String(url).includes('railway'), 'live path hits railway');
  return new Response(JSON.stringify({ data: { deploymentLogs: [] } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const b = await invokeExternalTool(
  {
    tool: 'railway',
    action: 'inspect_logs',
    payload: { deployment_id: 'dep-mock-1' },
  },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;
delete process.env.RAILWAY_TOKEN;

assert.equal(b.execution_mode, 'live');
arts = await readRecentExecutionArtifacts(tk, 20);
assert.ok(arts.filter((x) => x.type === 'tool_invocation').length >= 1, 'live: invocation');
assert.ok(arts.filter((x) => x.type === 'tool_result').length >= 1, 'live: result');

await clearExecutionArtifacts(tk);

console.log('test-tools-live-or-artifact: ok');
