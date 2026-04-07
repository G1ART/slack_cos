import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { invokeExternalTool, __invokeToolTestHooks } from '../src/founder/toolsBridge.js';
import {
  appendExecutionArtifact,
  readReviewQueue,
  clearExecutionArtifacts,
} from '../src/founder/executionLedger.js';
import { handleReadExecutionContext } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-review-queue');

const tk = `dm:rq-${Date.now()}`;
await clearExecutionArtifacts(tk);

// blocked: github open_pr no head
const prevGh = process.env.GITHUB_TOKEN;
const prevPat = process.env.GITHUB_FINE_GRAINED_PAT;
const prevRepo = process.env.GITHUB_REPOSITORY;
process.env.GITHUB_TOKEN = 'rq-t';
process.env.GITHUB_REPOSITORY = 'acme/demo';
await invokeExternalTool({ tool: 'github', action: 'open_pr', payload: { title: 'q' } }, { threadKey: tk });
if (prevGh === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prevGh;
if (prevPat === undefined) delete process.env.GITHUB_FINE_GRAINED_PAT;
else process.env.GITHUB_FINE_GRAINED_PAT = prevPat;
if (prevRepo === undefined) delete process.env.GITHUB_REPOSITORY;
else process.env.GITHUB_REPOSITORY = prevRepo;

// failed artifact (vercel)
__invokeToolTestHooks.failArtifactForTool = 'vercel';
await invokeExternalTool({ tool: 'vercel', action: 'deploy', payload: {} }, { threadKey: tk });

// degraded: railway
const prevFetch = globalThis.fetch;
process.env.RAILWAY_TOKEN = 'rq-rw';
globalThis.fetch = async (url) =>
  String(url).includes('railway') ? new Response('x', { status: 500 }) : new Response('', { status: 500 });
await invokeExternalTool(
  { tool: 'railway', action: 'inspect_logs', payload: { deployment_id: 'rq-d' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;
delete process.env.RAILWAY_TOKEN;

const q = await readReviewQueue(tk, 20);
assert.ok(q.length >= 3, 'queue has blocked + failed + degraded');

const pri = (s) => ({ failed: 0, blocked: 1, degraded: 2 }[s] ?? 99);
for (let i = 0; i < q.length - 1; i += 1) {
  const a = q[i];
  const b = q[i + 1];
  const pa = pri(a.status);
  const pb = pri(b.status);
  assert.ok(pa <= pb, `status order failed>blocked>degraded: ${a.status} before ${b.status}`);
}

// Synthetic: two blocked with explicit ts — newer first within bucket
await clearExecutionArtifacts(tk);
await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'old',
  status: 'blocked',
  needs_review: true,
  ts: '2020-01-01T00:00:00.000Z',
  payload: {
    tool: 'github',
    action: 'open_pr',
    status: 'blocked',
    outcome_code: 'blocked_missing_input',
    needs_review: true,
    result_summary: 'SUM_OLD',
    next_required_input: 'head',
    blocked_reason: 'open_pr requires payload.head',
    fallback_reason: null,
  },
});
await appendExecutionArtifact(tk, {
  type: 'tool_result',
  summary: 'new',
  status: 'blocked',
  needs_review: true,
  ts: '2025-06-01T00:00:00.000Z',
  payload: {
    tool: 'github',
    action: 'open_pr',
    status: 'blocked',
    outcome_code: 'blocked_missing_input',
    needs_review: true,
    result_summary: 'SUM_NEW',
    next_required_input: 'head',
    blocked_reason: 'open_pr requires payload.head',
    fallback_reason: null,
  },
});
const q2 = await readReviewQueue(tk, 10);
assert.equal(q2[0].result_summary, 'SUM_NEW');
assert.equal(q2[1].result_summary, 'SUM_OLD');
assert.equal(q2[0].next_required_input, 'head');
assert.equal(q2[0].blocked_reason.includes('open_pr'), true);

const ctx = await handleReadExecutionContext({ limit: 8 }, tk);
assert.ok(Array.isArray(ctx.review_queue));
assert.ok(ctx.review_queue.length >= 2);

await clearExecutionArtifacts(tk);

console.log('test-review-queue: ok');
