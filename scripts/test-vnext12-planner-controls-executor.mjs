#!/usr/bin/env node
/** vNext.12 — 플래너가 켠 capability만 디스패치 */
import assert from 'node:assert/strict';
import path from 'path';
import fs from 'fs/promises';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-v12p-'));
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

const { createExecutionPacket, createExecutionRun, clearExecutionRunsForTest } = await import(
  '../src/features/executionRun.js'
);
const { planExecutionRoutesForRun } = await import('../src/orchestration/planExecutionRoutes.js');
const { dispatchOutboundActionsForRun } = await import('../src/features/executionOutboundOrchestrator.js');

function makeRun(goal, includes, thread = 'ch:V12:rs:1') {
  clearExecutionRunsForTest();
  const packet = createExecutionPacket({
    thread_key: thread,
    goal_line: goal,
    locked_scope_summary: 't',
    includes,
    excludes: [],
    deferred_items: [],
    approval_rules: [],
    session_id: '',
    requested_by: 'U1',
  });
  return createExecutionRun({ packet, metadata: {}, task_kind: 'task' });
}

/* research-only: GitHub 경로 없음 */
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_FINE_GRAINED_PAT;
const runRs = makeRun('경쟁사 벤치마크만 먼저 알고 싶어', [], 'ch:V12:rs:only');
const planRs = planExecutionRoutesForRun(runRs, null);
assert.ok(!planRs.route_decisions.some((d) => d.capability === 'fullstack_code'));
assert.ok(planRs.route_decisions.some((d) => d.capability === 'research'));
const resRs = await dispatchOutboundActionsForRun(runRs, {});
assert.equal(resRs.github?.mode, 'skipped');
assert.equal(resRs.research?.mode, 'created');

/* UI-only (배포·코드 키워드 없음): fullstack off */
const runUi = makeRun('랜딩 화면 카피와 인터랙션 라벨만 다듬기', ['문구', '버튼'], 'ch:V12:ui:1');
const planUi = planExecutionRoutesForRun(runUi, null);
assert.equal(planUi.capabilities.fullstack_code, false);
const resUi = await dispatchOutboundActionsForRun(runUi, {});
assert.equal(resUi.github?.mode, 'skipped');
assert.equal(resUi.uiux?.mode, 'created');

/* 코드+DB+QA */
const runFull = makeRun(
  'MVP 앱 구현과 Supabase user 테이블 마이그레이션',
  ['API', 'schema'],
  'ch:V12:full:1',
);
const planFull = planExecutionRoutesForRun(runFull, null);
assert.ok(planFull.capabilities.fullstack_code);
assert.ok(planFull.capabilities.db_schema);
const resFull = await dispatchOutboundActionsForRun(runFull, {});
assert.ok(resFull.github?.mode === 'draft' || resFull.github?.mode === 'live');
assert.ok(resFull.supabase?.mode && resFull.supabase.mode !== 'skipped');

await fs.rm(tmp, { recursive: true, force: true }).catch(() => {});
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;
delete process.env.PROJECT_SPACES_FILE;

console.log('ok: vnext12_planner_controls_executor');
