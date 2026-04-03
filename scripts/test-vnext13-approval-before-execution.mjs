#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const founderPipe = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'core', 'founderRequestPipeline.js'),
  'utf8',
);
const scopeIdx = founderPipe.indexOf("gold.kind === 'scope_lock_request'");
const scopeSlice = founderPipe.slice(scopeIdx, scopeIdx + 2500);
assert.ok(!scopeSlice.includes('ensureExecutionRunDispatched'), 'scope_lock path must not auto-dispatch');

const launchGate = fs.readFileSync(path.join(__dirname, '..', 'src', 'core', 'founderLaunchGate.js'), 'utf8');
assert.ok(!launchGate.includes('ensureExecutionRunDispatched'), 'launch gate must not dispatch');

const tmp = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'g1cos-v13-apr-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
await fs.promises.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');

const {
  createExecutionPacket,
  createExecutionRun,
  clearExecutionRunsForTest,
  getExecutionRunById,
} = await import('../src/features/executionRun.js');
const { ensureExecutionRunDispatched } = await import('../src/features/executionDispatchLifecycle.js');
const { isExternalMutationAuthorized } = await import('../src/orchestration/approvalGate.js');

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V13:apr:1',
  goal_line: 'approval gate',
  locked_scope_summary: 't',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {} });
assert.equal(run.external_execution_authorization?.state, 'pending_approval');
assert.equal(isExternalMutationAuthorized(run), false);

ensureExecutionRunDispatched(run, {});
assert.equal(getExecutionRunById(run.run_id).outbound_dispatch_state, 'not_started');

await fs.promises.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.EXECUTION_RUNS_FILE;

console.log('ok: vnext13_approval_before_execution');
