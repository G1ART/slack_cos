import assert from 'node:assert';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { evaluateToolExecutionBoundary } from '../src/founder/runFounderDirectConversation.js';

const recentWithAssistant = [
  { role: 'user', text: 'a' },
  { role: 'assistant', text: 'b' },
];

const h = await runHarnessOrchestration({
  objective: '스펙 정리',
  personas: ['research', 'engineering', 'invalid_x'],
  tasks: ['조사', '구현'],
  deliverables: ['문서'],
  constraints: ['시간'],
});
assert.equal(h.ok, true);
assert.equal(h.mode, 'harness_dispatch');
assert.equal(h.status, 'accepted');
assert.ok(/^harness_\d+_[a-f0-9]+$/.test(h.dispatch_id), 'dispatch_id shape');
assert.deepEqual(h.personas, ['research', 'engineering']);
assert.ok(Array.isArray(h.team_plan) && h.team_plan.length >= 2);
assert.equal(h.next_step, 'cursor_spec_emit');

const t = await invokeExternalTool({
  tool: 'github',
  action: 'open_pr',
  payload: { title: 'x', branch: 'main' },
});
assert.equal(t.ok, true);
assert.equal(t.accepted, true);
assert.equal(t.mode, 'external_tool_invocation');
assert.ok(/^tool_\d+_[a-f0-9]+$/.test(t.invocation_id));
assert.equal(t.next_required_input, null);

const bScope = evaluateToolExecutionBoundary(
  'delegate_harness_team',
  { objective: '목표' },
  [{ role: 'user', text: 'only user' }],
);
assert.equal(bScope.blocked, true);
assert.equal(bScope.reason, 'scope_not_locked');

const bObj = evaluateToolExecutionBoundary(
  'delegate_harness_team',
  { objective: '   ' },
  recentWithAssistant,
);
assert.equal(bObj.blocked, true);
assert.equal(bObj.reason, 'objective_required');

const bEmptyPayload = evaluateToolExecutionBoundary(
  'invoke_external_tool',
  { tool: 'github', action: 'open_pr', payload: {} },
  recentWithAssistant,
);
assert.equal(bEmptyPayload.blocked, true);
assert.equal(bEmptyPayload.reason, 'empty_payload');

const bBadTool = evaluateToolExecutionBoundary(
  'invoke_external_tool',
  { tool: 'slack', action: 'plan', payload: { x: 1 } },
  recentWithAssistant,
);
assert.equal(bBadTool.blocked, true);
assert.equal(bBadTool.reason, 'unsupported_tool');

const bBadAction = evaluateToolExecutionBoundary(
  'invoke_external_tool',
  { tool: 'cursor', action: 'nope', payload: { x: 1 } },
  recentWithAssistant,
);
assert.equal(bBadAction.blocked, true);
assert.equal(bBadAction.reason, 'unsupported_action');

console.log('test-execution-boundary-and-bridges: ok');
