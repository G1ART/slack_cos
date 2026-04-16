import assert from 'node:assert';
import { runHarnessOrchestration } from '../src/founder/harnessBridge.js';
import { invokeExternalTool } from '../src/founder/toolsBridge.js';
import { validateToolCallArgs } from '../src/founder/runFounderDirectConversation.js';
import {
  externalToolLaneRegistryGaps,
  listExternalToolLanes,
} from '../src/founder/toolPlane/externalToolLaneRegistry.js';

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

const prevGh = process.env.GITHUB_TOKEN;
const prevPat = process.env.GITHUB_FINE_GRAINED_PAT;
const prevRepo = process.env.GITHUB_REPOSITORY;
process.env.GITHUB_TOKEN = 'test-token-boundary';
process.env.GITHUB_REPOSITORY = 'acme/demo';
const t = await invokeExternalTool({
  tool: 'github',
  action: 'open_pr',
  payload: { title: 'x', branch: 'main' },
});
if (prevGh === undefined) delete process.env.GITHUB_TOKEN;
else process.env.GITHUB_TOKEN = prevGh;
if (prevPat === undefined) delete process.env.GITHUB_FINE_GRAINED_PAT;
else process.env.GITHUB_FINE_GRAINED_PAT = prevPat;
if (prevRepo === undefined) delete process.env.GITHUB_REPOSITORY;
else process.env.GITHUB_REPOSITORY = prevRepo;

assert.equal(t.ok, true);
assert.equal(t.accepted, true);
assert.equal(t.mode, 'external_tool_invocation');
assert.ok(/^tool_\d+_[a-f0-9]+$/.test(t.invocation_id));
assert.equal(t.status, 'blocked');
assert.equal(t.outcome_code, 'blocked_missing_input');
assert.equal(t.needs_review, true);
assert.equal(t.next_required_input, 'head');
assert.equal(t.execution_mode, 'artifact');
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

const bWrongPair = validateToolCallArgs('invoke_external_tool', {
  tool: 'github',
  action: 'deploy',
  payload: { x: 1 },
});
assert.equal(bWrongPair.blocked, true);
assert.equal(bWrongPair.reason, 'unsupported_action');

assert.deepEqual(externalToolLaneRegistryGaps(), []);
assert.equal(listExternalToolLanes().length, 5);

console.log('test-execution-boundary-and-bridges: ok');
