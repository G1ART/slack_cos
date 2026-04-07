import assert from 'node:assert';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { validateToolCallArgs } from '../src/founder/runFounderDirectConversation.js';

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
assert.ok(typeof h.team_shape === 'string' && h.team_shape.length > 0);
assert.ok(Array.isArray(h.handoff_order));
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
assert.ok(t.execution_mode === 'live' || t.execution_mode === 'artifact');
assert.ok(t.result_summary);

// 스키마만: assistant 턴 여부와 무관하게 허용
const okHarness = validateToolCallArgs('delegate_harness_team', { objective: '목표' });
assert.equal(okHarness.blocked, false);

const bObj = validateToolCallArgs('delegate_harness_team', { objective: '   ' });
assert.equal(bObj.blocked, true);
assert.equal(bObj.reason, 'invalid_payload');

const okEmptyPayload = validateToolCallArgs('invoke_external_tool', {
  tool: 'github',
  action: 'open_pr',
  payload: {},
});
assert.equal(okEmptyPayload.blocked, false);

const bBadTool = validateToolCallArgs('invoke_external_tool', {
  tool: 'slack',
  action: 'create_spec',
  payload: { x: 1 },
});
assert.equal(bBadTool.blocked, true);
assert.equal(bBadTool.reason, 'unsupported_tool');

const bBadAction = validateToolCallArgs('invoke_external_tool', {
  tool: 'cursor',
  action: 'nope',
  payload: { x: 1 },
});
assert.equal(bBadAction.blocked, true);
assert.equal(bBadAction.reason, 'unsupported_action');

const bInvalidPayload = validateToolCallArgs('invoke_external_tool', {
  tool: 'cursor',
  action: 'create_spec',
  payload: null,
});
assert.equal(bInvalidPayload.blocked, true);
assert.equal(bInvalidPayload.reason, 'invalid_payload');

console.log('test-execution-boundary-and-bridges: ok');
