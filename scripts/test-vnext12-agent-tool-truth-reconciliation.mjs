#!/usr/bin/env node
/** vNext.12 — truth_reconciliation: 플랜 대비 툴 ref */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v12t-'));
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

const { createExecutionPacket, createExecutionRun, clearExecutionRunsForTest, getExecutionRunById } =
  await import('../src/features/executionRun.js');
const { dispatchOutboundActionsForRun } = await import('../src/features/executionOutboundOrchestrator.js');

delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_FINE_GRAINED_PAT;

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'ch:V12:truth:1',
  goal_line: '캘린더 MVP 구축',
  locked_scope_summary: 'MVP',
  includes: ['일정'],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {}, task_kind: 'task' });
await dispatchOutboundActionsForRun(run, {});

const updated = getExecutionRunById(run.run_id);
assert.ok(updated.truth_reconciliation?.entries?.length, 'reconciliation entries');
assert.ok(['completed', 'partial', 'failed'].includes(updated.truth_reconciliation.overall), 'overall');
const unsat = updated.truth_reconciliation.entries.filter((e) => e.reconciled_status === 'unsatisfied');
assert.ok(unsat.length === 0, `expected all routes satisfied after dispatch, got: ${JSON.stringify(unsat)}`);

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext12_agent_tool_truth_reconciliation');
