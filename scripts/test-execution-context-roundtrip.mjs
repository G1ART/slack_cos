import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  readRecentExecutionArtifacts,
  readExecutionSummary,
  clearExecutionArtifacts,
} from '../src/founder/executionLedger.js';
import { buildFounderConversationInput } from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-roundtrip');

const tk = `dm:rt-${Date.now()}`;
await clearExecutionArtifacts(tk);

await runHarnessOrchestration(
  { objective: '라운드트립', personas: ['pm'], tasks: ['a'], deliverables: ['d'], constraints: [] },
  { threadKey: tk },
);

const prev = process.env.GITHUB_TOKEN;
process.env.GITHUB_TOKEN = '';
await invokeExternalTool({ tool: 'github', action: 'create_issue', payload: { title: 'x' } }, { threadKey: tk });
if (prev === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prev;

const recent = await readRecentExecutionArtifacts(tk, 5);
assert.ok(recent.length >= 1, 'ledger has artifacts after harness+tool');

const summaryLines = await readExecutionSummary(tk, 5);
const input = buildFounderConversationInput({
  recentTurns: [],
  userText: '다음',
  attachmentResults: [],
  metadata: {},
  executionSummaryLines: summaryLines,
});

assert.ok(input.includes('[최근 실행 아티팩트]'), 'section present');
assert.ok(input.includes('harness_dispatch'), 'summarized harness');
assert.ok(input.includes('tool_invocation'), 'summarized tool');

await clearExecutionArtifacts(tk);

console.log('test-execution-context-roundtrip: ok');
