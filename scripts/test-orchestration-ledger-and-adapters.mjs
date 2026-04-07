import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessOrchestration, PERSONA_REGISTRY } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  readRecentExecutionArtifacts,
  clearExecutionArtifacts,
} from '../src/founder/executionLedger.js';
import { buildFounderConversationInput } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-ledger');

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

const arts1 = await readRecentExecutionArtifacts(tk, 10);
assert.ok(arts1.some((a) => a.type === 'harness_dispatch'), 'harness in ledger');

const prevGithub = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = '';
const tArt = await invokeExternalTool(
  { tool: 'github', action: 'open_pr', payload: { x: 1 } },
  { threadKey: tk },
);
if (prevGithub === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prevGithub;

assert.equal(tArt.ok, true);
assert.equal(tArt.execution_mode, 'artifact');

process.env.GITHUB_TOKEN = 'test-token-fake';
const tLive = await invokeExternalTool(
  { tool: 'github', action: 'create_issue', payload: { title: 't' } },
  { threadKey: tk },
);
delete process.env.GITHUB_TOKEN;

assert.equal(tLive.execution_mode, 'live');
assert.ok(tLive.result_summary, 'result_summary set');

const arts2 = await readRecentExecutionArtifacts(tk, 20);
const inv = arts2.filter((a) => a.type === 'tool_invocation');
assert.ok(inv.length >= 2, 'tool invocations recorded');
assert.ok(arts2.some((a) => a.type === 'tool_result'), 'live tool_result recorded');

const input = buildFounderConversationInput({
  recentTurns: [],
  userText: 'hi',
  attachmentResults: [],
  metadata: {},
  executionArtifacts: arts2.slice(-5),
});
assert.ok(input.includes('[최근 실행 아티팩트]'), 'conversation can embed ledger slice');
assert.ok(input.includes('harness_dispatch') || input.includes('tool_invocation'), 'artifact types in input');

await clearExecutionArtifacts(tk);

console.log('test-orchestration-ledger-and-adapters: ok');
