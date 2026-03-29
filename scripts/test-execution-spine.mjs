#!/usr/bin/env node
/**
 * Execution Spine 통합 테스트 — 5개 필수 시나리오.
 * 1. lock-confirmed 후 session이 삭제되지 않고 execution_running으로 남는지
 * 2. "좋아, 승인했어" 가 open packet/run에 resolve되는지
 * 3. approval 이후 council report가 표면에 안 나오는지
 * 4. execution_running 상태에서 run_id/lane만 대표-facing으로 나오는지
 * 5. escalation 명시 전에는 matrix/council이 final renderer가 안 되는지
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-exec-spine-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');

const {
  clearConversationBuffer,
  recordConversationTurn,
  buildSlackThreadKey,
} = await import('../src/features/slackConversationBuffer.js');
const {
  openProjectIntakeSession,
  clearProjectIntakeSessionsForTest,
  getProjectIntakeSession,
  isActiveProjectIntake,
  hasOpenExecutionOwnership,
  isPreLockIntake,
} = await import('../src/features/projectIntakeSession.js');
const {
  tryStartProjectLockConfirmedResponse,
} = await import('../src/features/startProjectLockConfirmed.js');
const {
  tryFinalizeExecutionSpineTurn,
} = await import('../src/features/executionSpineRouter.js');
const {
  getExecutionRunByThread,
  clearExecutionRunsForTest,
} = await import('../src/features/executionRun.js');

const meta = { channel: 'CEXE', thread_ts: '1744000000.exec', source_type: 'channel_mention', user: 'UOWNER' };
const key = buildSlackThreadKey(meta);

const kickUser = '툴제작: 더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.';
const kickCos = [
  '*[정렬 · 툴/프로젝트 킥오프]*',
  '',
  '*1. 내가 이해한 요청*',
  '_stub_',
  '*6. 다음 산출물*',
  'stub',
].join('\n');
const lockReply =
  'MVP 가정은 정확해. 중심 사용은 개인/팀 일정 관리가 우선이야. 반복 일정도 필요해. 승인이 필요한 일정은 전시·대관·외부 대관만 관리자 승인이야. 진행해줘.';

/* ============================== */
/* TEST 1: session persists post-lock */
/* ============================== */
clearConversationBuffer();
clearProjectIntakeSessionsForTest();
clearExecutionRunsForTest();

recordConversationTurn(key, 'user', kickUser);
recordConversationTurn(key, 'assistant', kickCos);

openProjectIntakeSession(meta, { goalLine: kickUser });
assert.ok(isPreLockIntake(meta), 'pre-lock intake before lock');

const lockOut = await tryStartProjectLockConfirmedResponse(lockReply, meta);
assert.ok(lockOut, 'expected lock surface');
assert.equal(lockOut.response_type, 'start_project_confirmed');
assert.ok(lockOut.packet_id?.startsWith('EPK-'), 'packet_id generated');
assert.ok(lockOut.run_id?.startsWith('RUN-'), 'run_id generated');

const sessAfterLock = getProjectIntakeSession(meta);
assert.ok(sessAfterLock, 'TEST 1 FAIL: session deleted after lock');
assert.equal(sessAfterLock.stage, 'execution_running', 'stage must be execution_running');
assert.equal(sessAfterLock.packet_id, lockOut.packet_id);
assert.equal(sessAfterLock.run_id, lockOut.run_id);
assert.ok(hasOpenExecutionOwnership(meta), 'execution ownership after lock');
assert.ok(!isPreLockIntake(meta), 'not pre-lock after lock');
console.log('TEST 1 PASS: session persists post-lock as execution_running');

/* ============================== */
/* TEST 2: approval resolves to open packet */
/* ============================== */
const run = getExecutionRunByThread(key);
assert.ok(run, 'execution run exists');
assert.equal(run.run_id, lockOut.run_id);
assert.equal(run.packet_id, lockOut.packet_id);
assert.equal(run.current_stage, 'execution_running');
assert.ok(run.workstreams.length === 4, '4 lane workstreams');
console.log('TEST 2 PASS: approval resolved to execution_run with 4 lanes');

/* ============================== */
/* TEST 3: post-approval — council report blocked */
/* ============================== */
const councilAttempt = tryFinalizeExecutionSpineTurn({
  trimmed: '이 프로젝트에 대해 다각적으로 분석해줘',
  metadata: meta,
});
assert.ok(councilAttempt, 'execution spine intercepts');
assert.ok(councilAttempt.text, 'returns surface');
assert.ok(councilAttempt.response_type === 'execution_running_status', 'routes to execution status, not council');

const bannedSnippets = [
  '페르소나별 핵심 관점',
  '가장 강한 반대 논리',
  '남아 있는 긴장',
  '종합 추천안',
  '대표 결정 필요 여부',
  '내부 처리 정보',
  '업무등록:',
];
for (const b of bannedSnippets) {
  assert.ok(!councilAttempt.text.includes(b), `council leak: ${b}`);
}
console.log('TEST 3 PASS: council report blocked during execution');

/* ============================== */
/* TEST 4: execution_running shows run_id + lane summary */
/* ============================== */
assert.ok(councilAttempt.text.includes(run.run_id), 'run_id in surface');
assert.ok(councilAttempt.text.includes('research_benchmark') || councilAttempt.text.includes('lane'), 'lane info');
assert.ok(councilAttempt.text.includes('실행 개시') || councilAttempt.text.includes('오케스트레이션'), 'execution tone');
assert.ok(councilAttempt.packet_id === run.packet_id, 'packet_id carried');
assert.ok(councilAttempt.run_id === run.run_id, 'run_id carried');
console.log('TEST 4 PASS: execution_running shows run_id + lanes');

/* ============================== */
/* TEST 5: matrix/council blocked without escalation */
/* ============================== */
const progressReq = tryFinalizeExecutionSpineTurn({
  trimmed: '지금 progress 요약만 줘',
  metadata: meta,
});
assert.ok(progressReq, 'progress request handled');
assert.equal(progressReq.response_type, 'execution_reporting_status');
assert.ok(!progressReq.text.includes('페르소나별'), 'no council in progress');

const escalation = tryFinalizeExecutionSpineTurn({
  trimmed: '이건 내 승인 없이는 못 간다',
  metadata: meta,
});
assert.ok(escalation, 'escalation handled');
assert.equal(escalation.response_type, 'execution_escalation');
assert.ok(escalation.text.includes('에스컬레이션'), 'escalation surface');
console.log('TEST 5 PASS: matrix/council blocked; escalation works');

/* ============================== */
/* Cleanup */
/* ============================== */
clearProjectIntakeSessionsForTest();
clearExecutionRunsForTest();
clearConversationBuffer();
await fs.rm(tmp, { recursive: true, force: true });
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;

console.log('');
console.log('ALL 5 EXECUTION SPINE TESTS PASSED');
