#!/usr/bin/env node
/** vNext.12.1 — truth_reconciliation 이 있으면 evaluateExecutionRunCompletion 정본이 된다. */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v121-truth-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'q.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'r.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'p.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'ps.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

const { createExecutionPacket, createExecutionRun, clearExecutionRunsForTest, setRunTruthReconciliation } =
  await import('../src/features/executionRun.js');
const { evaluateExecutionRunCompletion } = await import('../src/features/executionDispatchLifecycle.js');
const { aggregateReconciliationOverall } = await import('../src/orchestration/truthReconciliation.js');

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V121:truth:1',
  goal_line: 'test',
  locked_scope_summary: 'MVP',
  includes: ['a'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {}, task_kind: 'task' });

// 1) github satisfied only → partial if mixed mock entries would exist; here single entry
setRunTruthReconciliation(run.run_id, {
  entries: [
    {
      route_key: 'x',
      attempted_action: 'fullstack_code/github',
      reconciled_status: 'unsatisfied',
      reconciliation_notes: 'no ref',
      observed_tool_refs: {},
    },
  ],
  overall: 'failed',
  evaluated_at: new Date().toISOString(),
});
let ev = evaluateExecutionRunCompletion(run.run_id);
assert.equal(ev.completion_source, 'truth_reconciliation');
assert.equal(ev.overall_status, 'failed');

// 2) all satisfied → completed
setRunTruthReconciliation(run.run_id, {
  entries: [
    {
      route_key: 'a',
      attempted_action: 'research/internal_artifact',
      reconciled_status: 'satisfied',
      reconciliation_notes: '',
      observed_tool_refs: { research_note_path: 'x' },
    },
  ],
  overall: aggregateReconciliationOverall([
    { attempted_action: 'research/internal_artifact', reconciled_status: 'satisfied', reconciliation_notes: '' },
  ]),
  evaluated_at: new Date().toISOString(),
});
ev = evaluateExecutionRunCompletion(run.run_id);
assert.equal(ev.overall_status, 'completed');

// 3) draft_only overall
setRunTruthReconciliation(run.run_id, {
  entries: [
    {
      route_key: 'g',
      attempted_action: 'fullstack_code/github',
      reconciled_status: 'draft_only',
      reconciliation_notes: 'draft',
      observed_tool_refs: {},
    },
  ],
  overall: 'draft_only',
  evaluated_at: new Date().toISOString(),
});
ev = evaluateExecutionRunCompletion(run.run_id);
assert.equal(ev.overall_status, 'draft_only');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext12_1_single_truth_completion');
