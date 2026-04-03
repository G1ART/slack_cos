#!/usr/bin/env node
/** vNext.12.1 — 창업자 결정론 유틸 진행/핸드오프 문구에 reconciliation 줄이 포함된다. */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v121-st-'));
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
const { tryResolveFounderDeterministicUtility } = await import('../src/founder/founderDeterministicUtilityResolver.js');

clearExecutionRunsForTest();
const packet = createExecutionPacket({
  thread_key: 'Dstatus:th1:1',
  goal_line: 'g',
  locked_scope_summary: 'm',
  includes: [],
  excludes: [],
  deferred_items: [],
  approval_rules: [],
  session_id: '',
  requested_by: 'U1',
});
const run = createExecutionRun({ packet, metadata: {}, task_kind: 'task' });
setRunTruthReconciliation(run.run_id, {
  entries: [
    {
      route_key: 'k',
      attempted_action: 'fullstack_code/github',
      reconciled_status: 'draft_only',
      reconciliation_notes: 'test',
      observed_tool_refs: {},
    },
  ],
  overall: 'draft_only',
  evaluated_at: new Date().toISOString(),
});

const prog = tryResolveFounderDeterministicUtility({
  normalized: '지금 어디까지 됐어?',
  threadKey: 'Dstatus:th1:1',
  metadata: {},
});
assert.ok(prog.handled);
assert.ok(String(prog.text).includes('truth_reconciliation'), 'progress must cite reconciliation');
assert.ok(String(prog.text).includes('draft_only'), 'overall visible');

const ho = tryResolveFounderDeterministicUtility({
  normalized: '왜 아직 handoff야?',
  threadKey: 'Dstatus:th1:1',
  metadata: {},
});
assert.ok(ho.handled);
assert.ok(String(ho.text).includes('truth_reconciliation'), 'handoff explainer uses reconciliation');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext12_1_founder_status_from_reconciliation');
