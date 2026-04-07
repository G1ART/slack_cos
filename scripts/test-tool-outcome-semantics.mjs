import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, __invokeToolTestHooks } from '../src/founder/toolsBridge.js';
import { clearExecutionArtifacts } from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-tool-outcome-semantics');

const tk = `dm:outcome-${Date.now()}`;

// 1) live success
await clearExecutionArtifacts(tk);
const prevFetch1 = globalThis.fetch;
process.env.RAILWAY_TOKEN = 'tok-live-ok';
globalThis.fetch = async (url) => {
  assert.ok(String(url).includes('railway'), 'live path hits railway');
  return new Response(JSON.stringify({ data: { deploymentLogs: [] } }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};
const liveOk = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'dep-1' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch1;
delete process.env.RAILWAY_TOKEN;

assert.equal(liveOk.execution_mode, 'live');
assert.equal(liveOk.status, 'completed');
assert.equal(liveOk.outcome_code, 'live_completed');
assert.equal(liveOk.needs_review, false);

// 2) live failure + artifact
await clearExecutionArtifacts(tk);
process.env.RAILWAY_TOKEN = 'tok-live-fail';
globalThis.fetch = async (url) => {
  assert.ok(String(url).includes('railway'));
  return new Response('err', { status: 502 });
};
const liveFailArtOk = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'dep-2' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch1;
delete process.env.RAILWAY_TOKEN;

assert.equal(liveFailArtOk.execution_mode, 'artifact');
assert.equal(liveFailArtOk.status, 'degraded');
assert.equal(liveFailArtOk.outcome_code, 'degraded_from_live_failure');
assert.equal(liveFailArtOk.needs_review, true);
assert.ok(String(liveFailArtOk.result_summary).includes('degraded'));

// 3) live exception + artifact
await clearExecutionArtifacts(tk);
process.env.RAILWAY_TOKEN = 'tok-live-xc';
globalThis.fetch = async () => {
  throw new Error('network boom');
};
const liveXc = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'dep-3' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch1;
delete process.env.RAILWAY_TOKEN;

assert.equal(liveXc.execution_mode, 'artifact');
assert.equal(liveXc.status, 'degraded');
assert.equal(liveXc.outcome_code, 'degraded_from_live_exception');
assert.equal(liveXc.needs_review, true);

// 4) blocked missing deployment_id
await clearExecutionArtifacts(tk);
process.env.RAILWAY_TOKEN = 'tok-only';
const blockedDep = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: {} },
  { threadKey: tk },
);
delete process.env.RAILWAY_TOKEN;

assert.equal(blockedDep.status, 'blocked');
assert.equal(blockedDep.outcome_code, 'blocked_missing_input');
assert.equal(blockedDep.needs_review, true);
assert.equal(blockedDep.next_required_input, 'deployment_id');
assert.ok(String(blockedDep.result_summary).includes('blocked'));

// 5) artifact build failure
await clearExecutionArtifacts(tk);
__invokeToolTestHooks.failArtifactForTool = 'vercel';
const artFail = await invokeExternalTool(
  { tool: 'vercel', action: 'deploy', payload: {} },
  { threadKey: tk },
);
assert.equal(__invokeToolTestHooks.failArtifactForTool, null, 'hook consumed');

assert.equal(artFail.execution_mode, 'artifact');
assert.equal(artFail.status, 'failed');
assert.equal(artFail.outcome_code, 'failed_artifact_build');
assert.equal(artFail.needs_review, true);

// 6) live failure + artifact hook failure → failed_live_and_artifact
await clearExecutionArtifacts(tk);
process.env.RAILWAY_TOKEN = 'tok-fail-both';
__invokeToolTestHooks.failArtifactForTool = 'railway';
globalThis.fetch = async (url) => {
  assert.ok(String(url).includes('railway'));
  return new Response('no', { status: 500 });
};
const bothFail = await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'dep-both' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch1;
delete process.env.RAILWAY_TOKEN;
assert.equal(__invokeToolTestHooks.failArtifactForTool, null, 'railway hook consumed');

assert.equal(bothFail.status, 'failed');
assert.equal(bothFail.outcome_code, 'failed_live_and_artifact');
assert.equal(bothFail.needs_review, true);

await clearExecutionArtifacts(tk);

console.log('test-tool-outcome-semantics: ok');
