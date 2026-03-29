#!/usr/bin/env node
/**
 * Convergence Patch 회귀 테스트 — big convergence 검증 6개.
 * 1. ordinary research → research_surface end-to-end (playbook opened, freshness_required)
 * 2. ordinary ask → partner_surface end-to-end (no council)
 * 3. ad hoc task → playbook → no council
 * 4. execution thread survives scope lock and approval (session not deleted, run_id exists)
 * 5. old active-only session bug is gone (execution_running session still readable)
 * 6. explicit council still works
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-convergence-'));
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
  openPlaybook,
  getActivePlaybook,
  clearPlaybooksForTest,
  checkPlaybookExecutionPromotion,
  linkPlaybookToExecution,
} = await import('../src/features/dynamicPlaybook.js');
const {
  classifyInboundResponderPreview,
} = await import('../src/features/runInboundAiRouter.js');
const { isCouncilCommand } = await import('../src/slack/councilCommandPrefixes.js');
const {
  clearProjectIntakeSessionsForTest,
  openProjectIntakeSession,
  isActiveProjectIntake,
  isPreLockIntake,
  hasOpenExecutionOwnership,
  getProjectIntakeSession,
  transitionProjectIntakeStage,
} = await import('../src/features/projectIntakeSession.js');
const {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunByThread,
  attachRunArtifact,
  updateRunGitTrace,
  clearExecutionRunsForTest,
} = await import('../src/features/executionRun.js');
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

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  PASS: ${name}`); }
function fail(name, e) { failed++; console.error(`  FAIL: ${name}`, e?.message || e); }

/* ============================== */
/* TEST 1: ordinary research → research_surface + playbook + freshness */
/* ============================== */
try {
  clearPlaybooksForTest();
  const input = '지원코리아가 지원하기 괜찮은 아직 마감 안 지난 정부지원사업 알아봐주고 자격 요건 정리해줘';
  const hyp = interpretTask(input);
  assert.ok(hyp.is_research, 'research detected');
  assert.ok(hyp.freshness_required, 'freshness detected');
  assert.equal(hyp.kind, 'grant_research');
  assert.ok(hyp.should_open_playbook, 'should open playbook');

  const threadKey = 'ch:CONV_T1:1000.1001';
  const pb = openPlaybook(threadKey, hyp, input);
  assert.ok(pb, 'playbook opened');
  assert.ok(pb.playbook_id.startsWith('PBK-'));
  assert.equal(pb.freshness_required, true, 'freshness on playbook');

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'research_surface');
  assert.ok(!isCouncilCommand(input));

  clearPlaybooksForTest();
  ok('ordinary research → research_surface + playbook + freshness');
} catch (e) { fail('ordinary research → research_surface', e); }

/* ============================== */
/* TEST 2: ordinary ask → partner_surface (no council) */
/* ============================== */
try {
  const input = '이 구조에서 가장 큰 병목이 뭐야?';
  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'partner_surface');
  assert.ok(!isCouncilCommand(input));
  ok('ordinary ask → partner_surface');
} catch (e) { fail('ordinary ask → partner_surface', e); }

/* ============================== */
/* TEST 3: ad hoc task → playbook → no council */
/* ============================== */
try {
  clearPlaybooksForTest();
  const input = '다음 주 발표자료 급히 만들어줘';
  const hyp = interpretTask(input);
  assert.equal(hyp.kind, 'presentation_build');
  assert.ok(hyp.should_open_playbook);

  const threadKey = 'ch:CONV_T3:2000.2001';
  const pb = openPlaybook(threadKey, hyp, input);
  assert.ok(pb);
  assert.equal(pb.status, 'active');

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.notEqual(preview.responder, 'council');
  assert.ok(!isCouncilCommand(input));

  clearPlaybooksForTest();
  ok('ad hoc task → playbook → no council');
} catch (e) { fail('ad hoc task → playbook', e); }

/* ============================== */
/* TEST 4: execution thread survives scope lock + approval */
/* ============================== */
try {
  clearConversationBuffer();
  clearProjectIntakeSessionsForTest();
  clearExecutionRunsForTest();

  const meta = { channel: 'CCONV4', thread_ts: '4000.4001', source_type: 'channel_mention', user: 'UCONV4' };
  const key = buildSlackThreadKey(meta);

  recordConversationTurn(key, 'user', '툴제작: 더그린 갤러리 캘린더 만들자.');
  recordConversationTurn(key, 'assistant', '*[정렬 · 킥오프]*\nstub');
  openProjectIntakeSession(meta, { goalLine: '더그린 갤러리 캘린더' });

  assert.ok(isPreLockIntake(meta), 'pre-lock before scope lock');

  const lockReply = 'MVP 가정 정확. 개인/팀 일정 우선. 반복 일정 필요. 승인 3종. 진행해줘.';
  const lockOut = await tryStartProjectLockConfirmedResponse(lockReply, meta);
  assert.ok(lockOut, 'lock confirmed');

  // Session must NOT be deleted
  const sess = getProjectIntakeSession(meta);
  assert.ok(sess, 'session still exists after lock');
  assert.ok(['execution_running', 'execution_ready', 'approval_pending'].includes(sess.stage),
    `session stage in execution family: ${sess.stage}`);

  // Execution ownership must be alive
  assert.ok(hasOpenExecutionOwnership(meta), 'execution ownership');
  assert.ok(!isPreLockIntake(meta), 'no longer pre-lock');

  // run_id must exist
  assert.ok(sess.run_id, 'run_id exists');
  assert.ok(sess.packet_id, 'packet_id exists');
  assert.ok(sess.run_id.startsWith('RUN-'));
  assert.ok(sess.packet_id.startsWith('EPK-'));

  // Execution spine intercepts
  const execResult = tryFinalizeExecutionSpineTurn({ trimmed: '진행해', metadata: meta });
  assert.ok(execResult, 'spine intercepts');
  assert.notEqual(execResult.response_type, 'council');

  clearProjectIntakeSessionsForTest();
  clearExecutionRunsForTest();
  clearConversationBuffer();
  ok('execution thread survives scope lock + approval');
} catch (e) { fail('execution thread survives scope lock', e); }

/* ============================== */
/* TEST 5: old active-only session bug is gone */
/* ============================== */
try {
  clearProjectIntakeSessionsForTest();
  clearExecutionRunsForTest();

  const meta = { channel: 'CCONV5', thread_ts: '5000.5001', source_type: 'channel_mention', user: 'UCONV5' };
  openProjectIntakeSession(meta, { goalLine: 'test active-only bug' });

  // Transition to execution_running
  transitionProjectIntakeStage(meta, 'execution_running', { packet_id: 'EPK-test5', run_id: 'RUN-test5' });

  // Session must still be readable
  const sess = getProjectIntakeSession(meta);
  assert.ok(sess, 'execution_running session is readable');
  assert.equal(sess.stage, 'execution_running');
  assert.equal(sess.packet_id, 'EPK-test5');
  assert.equal(sess.run_id, 'RUN-test5');

  // isActiveProjectIntake must be true for execution_running
  assert.ok(isActiveProjectIntake(meta), 'isActiveProjectIntake true for execution_running');
  assert.ok(hasOpenExecutionOwnership(meta), 'hasOpenExecutionOwnership true');
  assert.ok(!isPreLockIntake(meta), 'not pre-lock');

  // Touch should work
  const { touchProjectIntakeSession } = await import('../src/features/projectIntakeSession.js');
  touchProjectIntakeSession(meta);
  const after = getProjectIntakeSession(meta);
  assert.ok(after, 'session survives touch');

  clearProjectIntakeSessionsForTest();
  ok('old active-only session bug gone — execution_running readable');
} catch (e) { fail('old active-only session bug', e); }

/* ============================== */
/* TEST 6: explicit council still works */
/* ============================== */
try {
  const input = '협의모드: 이 안의 리스크와 반대 논리를 검토해줘';
  assert.ok(isCouncilCommand(input));

  const snap = { trimmed: input, planner_lock: { type: 'none' }, query_line_resolved: '' };
  const preview = await classifyInboundResponderPreview(snap);
  assert.equal(preview.responder, 'council');
  ok('explicit council still works');
} catch (e) { fail('explicit council still works', e); }

/* ============================== */
/* BONUS: artifact attachment + git trace API works */
/* ============================== */
try {
  clearExecutionRunsForTest();
  const packet = createExecutionPacket({
    thread_key: 'ch:BONUS:9000.9001',
    goal_line: 'test artifact attachment',
    locked_scope_summary: 'test',
    includes: [], excludes: [], deferred_items: [],
    approval_rules: [], session_id: '', requested_by: 'U_BONUS',
  });
  const run = createExecutionRun({
    packet,
    metadata: { user: 'U_BONUS' },
    playbook_id: 'PBK-test',
    task_kind: 'test_kind',
  });
  assert.ok(run.artifacts, 'artifacts structure exists');
  assert.ok(run.originating_playbook_id === 'PBK-test', 'playbook linked');
  assert.ok(run.originating_task_kind === 'test_kind', 'task kind linked');

  // Attach artifact
  attachRunArtifact(run.run_id, 'fullstack_swe', { github_issue_id: 'GH-42', branch_name: 'feat/calendar' });
  const updated = getExecutionRunByThread('ch:BONUS:9000.9001');
  assert.equal(updated.artifacts.fullstack_swe.github_issue_id, 'GH-42');
  assert.equal(updated.artifacts.fullstack_swe.branch_name, 'feat/calendar');

  // Update git trace
  updateRunGitTrace(run.run_id, { repo: 'g1-cos-slack', branch: 'feat/calendar', commit_shas: ['abc123'] });
  assert.equal(updated.git_trace.repo, 'g1-cos-slack');
  assert.deepEqual(updated.git_trace.commit_shas, ['abc123']);

  // Append more commits
  updateRunGitTrace(run.run_id, { commit_shas: ['def456'] });
  assert.deepEqual(updated.git_trace.commit_shas, ['abc123', 'def456']);

  clearExecutionRunsForTest();
  ok('artifact attachment + git trace API');
} catch (e) { fail('artifact attachment + git trace', e); }

/* ============================== */
/* BONUS: playbook → execution promotion bridge */
/* ============================== */
try {
  clearPlaybooksForTest();
  clearExecutionRunsForTest();

  const input = '다음 주 발표자료 급히 만들어줘';
  const hyp = interpretTask(input);
  const threadKey = 'ch:PROMO_BRIDGE:8000.8001';
  const pb = openPlaybook(threadKey, hyp, input);

  // Simulating "진행해줘"
  const promo = checkPlaybookExecutionPromotion('진행해줘', threadKey);
  assert.ok(promo.should_promote, 'should promote to execution');
  assert.ok(promo.playbook, 'playbook returned');

  // Create execution from playbook
  const packet = createExecutionPacket({
    thread_key: threadKey,
    goal_line: pb.task_summary,
    locked_scope_summary: pb.task_summary,
    includes: [], excludes: [], deferred_items: [],
    approval_rules: [], session_id: '', requested_by: 'U_TEST',
  });
  const run = createExecutionRun({
    packet,
    metadata: { user: 'U_TEST' },
    playbook_id: pb.playbook_id,
    task_kind: pb.kind,
  });
  linkPlaybookToExecution(pb.playbook_id, { packet_id: packet.packet_id, run_id: run.run_id });

  const linkedPb = getActivePlaybook(threadKey);
  assert.ok(linkedPb, 'playbook still active');
  assert.equal(linkedPb.linked_run_id, run.run_id, 'linked run_id');
  assert.equal(linkedPb.linked_packet_id, packet.packet_id, 'linked packet_id');
  assert.equal(run.originating_playbook_id, pb.playbook_id, 'run links back to playbook');

  clearPlaybooksForTest();
  clearExecutionRunsForTest();
  ok('playbook → execution promotion bridge');
} catch (e) { fail('playbook → execution promotion bridge', e); }

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
console.log(`CONVERGENCE PATCH: passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
