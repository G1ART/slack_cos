import assert from 'node:assert';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendThreadTurn, readRecentThreadTurns, clearThread } from '../src/founder/threadMemory.js';
import { buildFounderConversationInput } from '../src/founder/runFounderDirectConversation.js';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-memory');

const key = `test-thread-${Date.now()}`;
await clearThread(key);
await appendThreadTurn(key, {
  ts: 't1',
  role: 'user',
  text: '첫 질문',
  attachments: [],
});
await appendThreadTurn(key, {
  ts: 't2',
  role: 'assistant',
  text: '답변 A',
  attachments: [],
});
const recent = await readRecentThreadTurns(key, 12);
assert.equal(recent.length, 2);

const input = buildFounderConversationInput({
  recentTurns: recent,
  userText: '두 번째 질문',
  attachmentResults: [{ filename: 'x.png', ok: false, reason: '실패' }],
  metadata: { channel: 'C1', user: 'U1', ts: '1', thread_ts: null, channel_type: 'channel' },
});

assert.ok(input.includes('[최근 대화]'), 'model input includes recent block');
assert.ok(input.includes('user: 첫 질문'), 'recent user line');
assert.ok(input.includes('assistant: 답변 A'), 'recent assistant line');
assert.ok(input.includes('[현재 턴]'), 'current turn block');
assert.ok(input.includes('user: 두 번째 질문'), 'current user');
assert.ok(input.includes('x.png'), 'attachment line');

const h = await runHarnessOrchestration({
  objective: '배포',
  personas: ['research', 'engineering'],
  tasks: ['a'],
  deliverables: ['d'],
  constraints: ['c'],
});
assert.equal(h.ok, true);
assert.equal(h.mode, 'harness_dispatch');
assert.equal(h.status, 'accepted');
assert.ok(h.dispatch_id && String(h.dispatch_id).startsWith('harness_'));
assert.deepEqual(h.personas, ['research', 'engineering']);
assert.ok(Array.isArray(h.team_plan) && h.team_plan.length >= 1);
assert.equal(h.next_step, 'cursor_spec_emit');

const t = await invokeExternalTool({ tool: 'github', action: 'open_pr', payload: { x: 1 } });
assert.equal(t.ok, true);
assert.equal(t.mode, 'external_tool_invocation');
assert.equal(t.tool, 'github');
assert.equal(t.accepted, true);
assert.ok(t.invocation_id && String(t.invocation_id).startsWith('tool_'));
assert.equal(t.next_required_input, null);

await clearThread(key);

console.log('test-founder-memory-and-tools: ok');
