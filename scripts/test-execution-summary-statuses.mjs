import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, __invokeToolTestHooks, SUPABASE_APPLY_SQL_RPC } from '../src/founder/toolsBridge.js';
import {
  appendExecutionArtifact,
  readExecutionSummary,
  clearExecutionArtifacts,
} from '../src/founder/executionLedger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-exec-summary-statuses');

const tk = `dm:sum-${Date.now()}`;
await clearExecutionArtifacts(tk);

// blocked (github: token/repo ok but open_pr without head)
const prevGh = process.env.GITHUB_TOKEN;
const prevPat = process.env.GITHUB_FINE_GRAINED_PAT;
const prevRepo = process.env.GITHUB_REPOSITORY;
process.env.GITHUB_TOKEN = 't-sum';
process.env.GITHUB_REPOSITORY = 'acme/demo';
await invokeExternalTool({ tool: 'github', action: 'open_pr', payload: { title: 's' } }, { threadKey: tk });
if (prevGh === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prevGh;
if (prevPat === undefined) delete process.env.GITHUB_FINE_GRAINED_PAT;
else process.env.GITHUB_FINE_GRAINED_PAT = prevPat;
if (prevRepo === undefined) delete process.env.GITHUB_REPOSITORY;
else process.env.GITHUB_REPOSITORY = prevRepo;

// degraded: railway live 500 then artifact
const prevFetch = globalThis.fetch;
process.env.RAILWAY_TOKEN = 't-rw';
globalThis.fetch = async (url) => {
  if (String(url).includes('railway')) {
    return new Response('bad', { status: 503 });
  }
  return prevFetch ? prevFetch(url) : new Response('x', { status: 500 });
};
await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'd-sum' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;
delete process.env.RAILWAY_TOKEN;

// completed live: supabase apply_sql
const prevUrl = process.env.SUPABASE_URL;
const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.SUPABASE_URL = 'https://sumtest.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'key-sum';
globalThis.fetch = async (url, init) => {
  const u = String(url);
  if (u.includes(`/rest/v1/rpc/${SUPABASE_APPLY_SQL_RPC}`)) {
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  if (prevFetch) return prevFetch(url, init);
  return new Response('n/a', { status: 500 });
};
await invokeExternalTool(
  { tool: 'supabase', action: 'apply_sql', payload: { sql: 'select 1' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;
if (prevUrl === undefined) delete process.env.SUPABASE_URL;
else process.env.SUPABASE_URL = prevUrl;
if (prevKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;

// failed: vercel artifact hook
__invokeToolTestHooks.failArtifactForTool = 'vercel';
await invokeExternalTool({ tool: 'vercel', action: 'deploy', payload: {} }, { threadKey: tk });

const lines = await readExecutionSummary(tk, 12);
const joined = lines.join('\n');

assert.ok(joined.includes('blocked'), `summary shows blocked: ${joined}`);
assert.ok(joined.includes('blocked_missing_input'), `summary shows outcome blocked_missing_input: ${joined}`);
assert.ok(joined.includes('degraded'), `summary shows degraded: ${joined}`);
assert.ok(joined.includes('degraded_from_live_failure'), `summary shows degraded outcome: ${joined}`);
assert.ok(joined.includes('completed'), `summary shows completed: ${joined}`);
assert.ok(joined.includes('live_completed'), `summary shows live_completed: ${joined}`);
assert.ok(joined.includes('failed'), `summary shows failed: ${joined}`);
assert.ok(joined.includes('failed_artifact_build'), `summary shows failed_artifact_build: ${joined}`);
assert.ok(joined.includes('[REVIEW]'), `review-tagged rows surface: ${joined}`);

// 동일 심각도(degraded) 버킷 안에서는 최신 ts가 먼저
await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'deg-old',
  status: 'degraded',
  needs_review: true,
  ts: '2020-01-01T00:00:00.000Z',
  payload: {
    tool: 'railway',
    action: 'inspect_logs',
    execution_mode: 'artifact',
    status: 'degraded',
    outcome_code: 'degraded_from_live_failure',
    needs_review: true,
    artifact_path: '/tmp/cos-summary-order-OLDER-degraded-marker',
  },
});
await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'deg-new',
  status: 'degraded',
  needs_review: true,
  ts: '2025-06-15T12:00:00.000Z',
  payload: {
    tool: 'railway',
    action: 'inspect_logs',
    execution_mode: 'artifact',
    status: 'degraded',
    outcome_code: 'degraded_from_live_failure',
    needs_review: true,
    artifact_path: '/tmp/cos-summary-order-NEWER-degraded-marker',
  },
});
const linesOrder = await readExecutionSummary(tk, 25);
const idxNew = linesOrder.findIndex((l) => l.includes('NEWER-degraded-marker'));
const idxOld = linesOrder.findIndex((l) => l.includes('OLDER-degraded-marker'));
assert.ok(idxNew >= 0 && idxOld >= 0 && idxNew < idxOld, `newer degraded before older: ${linesOrder.join(' | ')}`);

await clearExecutionArtifacts(tk);

console.log('test-execution-summary-statuses: ok');
