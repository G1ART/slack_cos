#!/usr/bin/env node
/**
 * Open-World COS / Dynamic Playbook Engine 회귀 테스트 — 6개 필수 시나리오.
 * 1. ordinary research → research_surface (council 아님)
 * 2. ordinary natural-language ask → partner_surface (council 아님)
 * 3. new task type → ad-hoc playbook 생성
 * 4. repeated task → promoted playbook
 * 5. explicit council → council (여전히 작동)
 * 6. execution thread → non-council
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-open-world-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');

const {
  interpretTask,
  isResearchSurfaceCandidate,
  isFreshnessRequired,
  openPlaybook,
  getActivePlaybook,
  clearPlaybooksForTest,
  completePlaybook,
  isKindPromotionEligible,
} = await import('../src/features/dynamicPlaybook.js');
const { classifyInboundResponderPreview } = await import('../src/features/runInboundAiRouter.js');
const { isCouncilCommand } = await import('../src/slack/councilCommandPrefixes.js');
const {
  clearProjectIntakeSessionsForTest,
  openProjectIntakeSession,
  hasOpenExecutionOwnership,
} = await import('../src/features/projectIntakeSession.js');
const { clearExecutionRunsForTest } = await import('../src/features/executionRun.js');
const {
  clearConversationBuffer,
  recordConversationTurn,
  buildSlackThreadKey,
} = await import('../src/features/slackConversationBuffer.js');
const {
  tryStartProjectLockConfirmedResponse,
} = await import('../src/features/startProjectLockConfirmed.js');
const {
  tryFinalizeExecutionSpineTurn,
} = await import('../src/features/executionSpineRouter.js');

/* ============================== */
/* TEST 1: ordinary research → research_surface */
/* ============================== */
{
  const input = '지원코리아가 지원하기 괜찮은 아직 마감 안 지난 정부지원사업 알아봐주고 자격 요건 정리해줘';
  const hyp = interpretTask(input);
  assert.ok(hyp.is_research, 'research detected');
  assert.ok(hyp.freshness_required, 'freshness detected');
  assert.ok(isResearchSurfaceCandidate(input), 'research candidate');
  assert.ok(isFreshnessRequired(input), 'freshness from standalone fn');
  assert.equal(hyp.kind, 'grant_research', 'kind = grant_research');
  assert.notEqual(hyp.mode, 'answer', 'not simple answer');
  assert.ok(!isCouncilCommand(input), 'not a council command');

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'research_surface', 'responder = research_surface');
  console.log('TEST 1 PASS: ordinary research → research_surface');
}

/* ============================== */
/* TEST 2: ordinary ask → partner_surface */
/* ============================== */
{
  const input = '이 구조에서 가장 큰 병목이 뭐야?';
  const hyp = interpretTask(input);
  assert.ok(!hyp.is_research, 'not research');
  assert.ok(!isCouncilCommand(input), 'not council');

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'partner_surface', 'responder = partner_surface');
  console.log('TEST 2 PASS: ordinary ask → partner_surface');
}

/* ============================== */
/* TEST 3: new task type → ad-hoc playbook */
/* ============================== */
{
  clearPlaybooksForTest();
  const input = '다음 주 발표자료 급히 만들어줘';
  const hyp = interpretTask(input);
  assert.equal(hyp.kind, 'presentation_build', 'kind = presentation_build');
  assert.ok(hyp.should_open_playbook, 'should open playbook');

  const threadKey = 'ch:TEST_PBK:1234.5678';
  const pb = openPlaybook(threadKey, hyp, input);
  assert.ok(pb, 'playbook created');
  assert.ok(pb.playbook_id.startsWith('PBK-'), 'playbook_id format');
  assert.equal(pb.kind, 'presentation_build');
  assert.equal(pb.status, 'active');
  assert.ok(pb.task_summary.includes('발표자료'), 'task summary');

  const active = getActivePlaybook(threadKey);
  assert.ok(active, 'active playbook retrievable');
  assert.equal(active.playbook_id, pb.playbook_id);

  assert.ok(!isCouncilCommand(input), 'not council');
  console.log('TEST 3 PASS: new task → ad-hoc playbook (presentation_build)');
}

/* ============================== */
/* TEST 4: repeated task → promoted playbook */
/* ============================== */
{
  clearPlaybooksForTest();
  const kind = 'grant_research';
  for (let i = 0; i < 3; i++) {
    const hyp = interpretTask('정부지원사업 알아봐줘');
    const pb = openPlaybook(`ch:PROMO:${i}.test`, hyp, '정부지원사업 알아봐줘');
    completePlaybook(pb.playbook_id);
  }
  assert.ok(isKindPromotionEligible(kind), 'kind eligible for promotion after 3 uses');
  console.log('TEST 4 PASS: repeated task → promotion eligible');
}

/* ============================== */
/* TEST 5: explicit council still works */
/* ============================== */
{
  const input = '협의모드: 이 안의 리스크와 반대 논리를 검토해줘';
  assert.ok(isCouncilCommand(input), 'explicit council command');

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'council', 'explicit council → council');
  console.log('TEST 5 PASS: explicit council → council');
}

/* ============================== */
/* TEST 6: execution thread → non-council */
/* ============================== */
{
  clearConversationBuffer();
  clearProjectIntakeSessionsForTest();
  clearExecutionRunsForTest();

  const meta = { channel: 'COWT', thread_ts: '9999.owt', source_type: 'channel_mention', user: 'UOWT' };
  const key = buildSlackThreadKey(meta);

  const kickUser = '툴제작: 더그린 갤러리 캘린더 만들자.';
  const kickCos = '*[정렬 · 툴/프로젝트 킥오프]*\n\n*1. 내가 이해한 요청*\n_stub_\n*6. 다음 산출물*\nstub';
  const lockReply = 'MVP 가정은 정확해. 중심 사용은 개인/팀 일정 관리가 우선이야. 반복 일정도 필요해. 승인이 필요한 일정은 전시·대관·외부 대관만 관리자 승인이야. 진행해줘.';

  recordConversationTurn(key, 'user', kickUser);
  recordConversationTurn(key, 'assistant', kickCos);
  openProjectIntakeSession(meta, { goalLine: kickUser });

  const lockOut = await tryStartProjectLockConfirmedResponse(lockReply, meta);
  assert.ok(lockOut, 'lock confirmed');
  assert.ok(hasOpenExecutionOwnership(meta), 'execution ownership active');

  const execResult = tryFinalizeExecutionSpineTurn({ trimmed: '좋아, 진행해', metadata: meta });
  assert.ok(execResult, 'execution spine intercepts');
  assert.ok(execResult.response_type !== 'council', 'not council');
  assert.ok(!execResult.text.includes('페르소나별'), 'no council in exec');

  clearProjectIntakeSessionsForTest();
  clearExecutionRunsForTest();
  clearConversationBuffer();
  console.log('TEST 6 PASS: execution thread → non-council');
}

/* ============================== */
/* Cleanup */
/* ============================== */
clearPlaybooksForTest();
await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;

console.log('');
console.log('ALL 6 OPEN-WORLD COS TESTS PASSED');
