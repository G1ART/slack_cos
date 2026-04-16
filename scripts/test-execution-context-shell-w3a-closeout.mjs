/**
 * W3-A closeout: execution context truth shell from durable run row shape.
 */
import assert from 'node:assert/strict';
import {
  buildExecutionContextShellFromRun,
  validateExecutionContextShell,
} from '../src/founder/executionContextShell.js';

const run = {
  id: '550e8400-e29b-41d4-a716-446655440001',
  run_id: 'run_w3a_shell',
  external_run_id: 'run_w3a_shell',
  thread_key: 'dm:w3a-shell',
  status: 'running',
  stage: 'executing',
  dispatch_id: 'd_w3a_shell',
  current_packet_id: 'p1',
  required_packet_ids: ['p1'],
  workspace_key: 'SHELL_WS',
  product_key: 'SHELL_PROD',
  project_space_key: 'SHELL_PS',
  parcel_deployment_key: 'SHELL_PD',
  updated_at: '2026-04-16T00:00:00.000Z',
};

const shell = buildExecutionContextShellFromRun(run);
assert.ok(shell && typeof shell === 'object');
const v = validateExecutionContextShell(shell);
assert.equal(v.ok, true);
assert.equal(shell.id, run.id);
assert.equal(shell.run_id, 'run_w3a_shell');
assert.equal(shell.thread_key, 'dm:w3a-shell');
assert.equal(shell.status, 'running');
assert.equal(shell.workspace_key, 'SHELL_WS');
assert.equal(shell.product_key, 'SHELL_PROD');
assert.equal(shell.project_space_key, 'SHELL_PS');
assert.equal(shell.parcel_deployment_key, 'SHELL_PD');

assert.equal(validateExecutionContextShell(null).ok, false);
assert.equal(validateExecutionContextShell({}).ok, false);

console.log('test-execution-context-shell-w3a-closeout: ok');
