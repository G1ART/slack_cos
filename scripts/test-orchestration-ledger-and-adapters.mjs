import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessOrchestration, PERSONA_REGISTRY } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  readRecentExecutionArtifacts,
  readExecutionSummary,
  clearExecutionArtifacts,
} from '../src/founder/executionLedger.js';
import { buildFounderConversationInput } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-ledger');

const prevProduct = process.env.COS_PRODUCT_KEY;
process.env.COS_PRODUCT_KEY = 'orch_ledger_product_key';

const tk = `dm:ledger-${Date.now()}`;
await clearExecutionArtifacts(tk);

assert.ok(PERSONA_REGISTRY.pm?.purpose, 'persona registry');

const h = await runHarnessOrchestration(
  {
    objective: '릴리즈',
    personas: ['pm', 'qa'],
    tasks: ['범위', '검증'],
    deliverables: ['체크리스트'],
    constraints: ['시간'],
  },
  { threadKey: tk },
);

assert.equal(h.ok, true);
assert.ok(h.team_shape.includes('pm'));
assert.ok(Array.isArray(h.handoff_order));
assert.ok(Array.isArray(h.success_criteria));
assert.ok(Array.isArray(h.risks));
assert.ok(Array.isArray(h.packets) && h.packets.length >= 1, 'envelope packets');

const arts1 = await readRecentExecutionArtifacts(tk, 20);
assert.ok(arts1.some((a) => a.type === 'harness_dispatch'), 'harness in ledger');
assert.ok(arts1.some((a) => a.type === 'harness_packet'), 'packet rows in ledger');
const disp = arts1.find((a) => a.type === 'harness_dispatch');
const dpl = disp?.payload && typeof disp.payload === 'object' ? disp.payload : {};
assert.ok(
  typeof dpl.intent === 'string' && dpl.intent.startsWith('delegate_'),
  'ledger harness_dispatch carries Phase1 intent',
);
assert.equal(String(dpl.thread_key || ''), tk, 'ledger harness_dispatch merges canonical thread_key');
assert.equal(
  String(dpl.product_key || ''),
  'orch_ledger_product_key',
  'ledger harness_dispatch merges env product_key when absent',
);
const pktArt = arts1.find((a) => a.type === 'harness_packet');
const ppl = pktArt?.payload && typeof pktArt.payload === 'object' ? pktArt.payload : {};
assert.equal(String(ppl.thread_key || ''), tk, 'ledger harness_packet merges thread_key');
assert.equal(String(ppl.product_key || ''), 'orch_ledger_product_key', 'ledger harness_packet merges product_key');

const prevGithub = process.env.GITHUB_TOKEN;
const prevPat = process.env.GITHUB_FINE_GRAINED_PAT;
process.env.GITHUB_TOKEN = '';
process.env.GITHUB_FINE_GRAINED_PAT = '';
const tArt = await invokeExternalTool(
  { tool: 'github', action: 'open_pr', payload: { x: 1 } },
  { threadKey: tk },
);
if (prevGithub === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prevGithub;
if (prevPat === undefined) delete process.env.GITHUB_FINE_GRAINED_PAT;
else process.env.GITHUB_FINE_GRAINED_PAT = prevPat;

assert.equal(tArt.ok, true);
assert.equal(tArt.execution_mode, 'artifact');
assert.equal(tArt.status, 'blocked');
assert.equal(tArt.outcome_code, 'blocked_missing_input');
assert.equal(tArt.needs_review, true);

const prevRepo = process.env.GITHUB_REPOSITORY;
const prevFetch = globalThis.fetch;
process.env.GITHUB_TOKEN = 'test-token-fake';
process.env.GITHUB_REPOSITORY = 'acme/demo';
globalThis.fetch = async () =>
  new Response(JSON.stringify({ number: 42, html_url: 'https://github.com/acme/demo/issues/42' }), {
    status: 201,
    headers: { 'Content-Type': 'application/json' },
  });
const tLive = await invokeExternalTool(
  { tool: 'github', action: 'create_issue', payload: { title: 't' } },
  { threadKey: tk },
);
globalThis.fetch = prevFetch;
delete process.env.GITHUB_TOKEN;
if (prevRepo === undefined) delete process.env.GITHUB_REPOSITORY;
else process.env.GITHUB_REPOSITORY = prevRepo;

assert.equal(tLive.execution_mode, 'live');
assert.equal(tLive.status, 'completed');
assert.equal(tLive.outcome_code, 'live_completed');
assert.equal(tLive.needs_review, false);
assert.ok(tLive.result_summary, 'result_summary set');

const arts2 = await readRecentExecutionArtifacts(tk, 20);
const inv = arts2.filter((a) => a.type === 'tool_invocation');
assert.ok(inv.length >= 2, 'tool invocations recorded');
assert.ok(arts2.filter((a) => a.type === 'tool_result').length >= 2, 'each invocation has tool_result');

const summaryLines = await readExecutionSummary(tk, 5);
const input = buildFounderConversationInput({
  recentTurns: [],
  userText: 'hi',
  attachmentResults: [],
  metadata: {},
  executionSummaryLines: summaryLines,
});
assert.ok(input.includes('[최근 실행 아티팩트]'), 'conversation can embed ledger slice');
assert.ok(input.includes('harness_dispatch') || input.includes('tool_invocation'), 'artifact types in input');

await clearExecutionArtifacts(tk);

if (prevProduct === undefined) delete process.env.COS_PRODUCT_KEY;
else process.env.COS_PRODUCT_KEY = prevProduct;

console.log('test-orchestration-ledger-and-adapters: ok');
