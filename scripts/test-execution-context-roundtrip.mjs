import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import {
  readRecentExecutionArtifacts,
  readExecutionSummary,
  clearExecutionArtifacts,
  computeExecutionOutcomeCounts,
} from '../src/founder/executionLedger.js';
import {
  buildFounderConversationInput,
  handleReadExecutionContext,
} from '../src/founder/runFounderDirectConversation.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-roundtrip');

const tk = `dm:rt-${Date.now()}`;
await clearExecutionArtifacts(tk);

await runHarnessOrchestration(
  { objective: '라운드트립', personas: ['pm'], tasks: ['a'], deliverables: ['d'], constraints: [] },
  { threadKey: tk },
);

const prev = process.env.GITHUB_TOKEN;
const prevPat = process.env.GITHUB_FINE_GRAINED_PAT;
process.env.GITHUB_TOKEN = '';
process.env.GITHUB_FINE_GRAINED_PAT = '';
await invokeExternalTool({ tool: 'github', action: 'create_issue', payload: { title: 'x' } }, { threadKey: tk });
if (prev === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prev;
if (prevPat === undefined) delete process.env.GITHUB_FINE_GRAINED_PAT;
else process.env.GITHUB_FINE_GRAINED_PAT = prevPat;

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

const counts = await computeExecutionOutcomeCounts(tk);
assert.equal(typeof counts.review_required_count, 'number');
assert.equal(typeof counts.degraded_count, 'number');
assert.equal(typeof counts.blocked_count, 'number');
assert.equal(typeof counts.failed_count, 'number');
assert.ok(counts.review_required_count >= 1, 'read_execution_context-style counts: blocked tool needs review');
assert.ok(counts.blocked_count >= 1, 'blocked status counted');

const ctx = await handleReadExecutionContext({ limit: 8 }, tk);
assert.ok(ctx.tenancy_keys_presence && typeof ctx.tenancy_keys_presence === 'object', 'tenancy_keys_presence booleans');
assert.equal(typeof ctx.parcel_deployment_scoped_supervisor_lists, 'boolean');
assert.ok(Array.isArray(ctx.review_queue));
assert.ok(ctx.review_queue.length >= 1, 'review_queue surfaces blocked github row');
const spine = ctx.recent_artifact_spine_distinct;
assert.ok(spine && typeof spine === 'object', 'recent_artifact_spine_distinct present');
assert.ok(Array.isArray(spine.thread_key) && spine.thread_key.includes(tk), 'distinct thread_key from merged ledger');
assert.equal(ctx.active_run_shell, null, 'harness-only roundtrip thread has no durable cos_runs row');

await clearExecutionArtifacts(tk);

console.log('test-execution-context-roundtrip: ok');
