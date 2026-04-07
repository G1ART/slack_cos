import assert from 'node:assert';
import { deriveRunTerminalStatus, deriveRunStage } from '../src/founder/executionRunStore.js';

assert.equal(deriveRunTerminalStatus({ a: 'completed' }, ['a']), 'completed');
assert.equal(deriveRunTerminalStatus({ a: 'completed', b: 'skipped' }, ['a', 'b']), 'completed');
assert.equal(deriveRunTerminalStatus({ a: 'completed', b: 'queued' }, ['a', 'b']), 'running');
assert.equal(deriveRunTerminalStatus({ a: 'failed', b: 'queued' }, ['a', 'b']), 'failed');
assert.equal(deriveRunTerminalStatus({ a: 'blocked', b: 'queued' }, ['a', 'b']), 'blocked');
assert.equal(
  deriveRunTerminalStatus({ a: 'completed', b: 'review_required' }, ['a', 'b']),
  'review_required',
);

assert.equal(deriveRunStage('completed', true), 'finalizing');
assert.equal(deriveRunStage('review_required', true), 'reviewing');
assert.equal(deriveRunStage('running', true), 'executing');
assert.equal(deriveRunStage('running', false), 'delegated');

console.log('test-run-terminal-derivation: ok');
