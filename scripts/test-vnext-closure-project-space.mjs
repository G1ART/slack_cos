#!/usr/bin/env node
/**
 * vNext — Execution Closure Finalization + Project Space Registry Bootstrap 테스트.
 *
 * 1. exact-once dispatch (idempotency)
 * 2. lane dependency scheduler (research → qa)
 * 3. completion detection (lane 조합별)
 * 4. cursor result ingestion (file-drop)
 * 5. supabase manual path consistency
 * 6. project space resolve (thread-linked)
 * 7. bootstrap draft path (vercel/railway)
 * 8. PM intent detection (expanded)
 * 9. scanPendingCursorResults (real impl)
 * 10. no council leak
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-vnext-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');

delete process.env.GITHUB_FINE_GRAINED_PAT;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_APP_ID;
delete process.env.VERCEL_TOKEN;
delete process.env.RAILWAY_TOKEN;

const {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunById,
  clearExecutionRunsForTest,
  updateLaneOutbound,
} = await import('../src/features/executionRun.js');

const {
  dispatchOutboundActionsForRun,
} = await import('../src/features/executionOutboundOrchestrator.js');

const {
  ensureExecutionRunDispatched,
  computeLaneDispatchPlan,
  evaluateExecutionRunCompletion,
  detectPMIntent,
  buildSupabaseManualApplyInstructions,
  scanPendingCursorResults,
  diagnoseGithubConfig,
  getCursorOperationalStatus,
} = await import('../src/features/executionDispatchLifecycle.js');

const {
  ingestCursorResult,
} = await import('../src/features/executionResultIngestion.js');

const {
  createProjectSpace,
  getProjectSpaceById,
  listProjectSpaces,
  linkRunToProjectSpace,
  linkThreadToProjectSpace,
  getProjectSpaceByThread,
  searchProjectSpaces,
  _resetForTest,
} = await import('../src/features/projectSpaceRegistry.js');

const {
  resolveProjectSpaceForThread,
  detectProjectIntent,
} = await import('../src/features/projectSpaceResolver.js');

const {
  bootstrapProjectSpace,
  renderBootstrapPlanForSlack,
} = await import('../src/features/projectSpaceBootstrap.js');

const { diagnoseVercelReadiness, buildVercelBootstrapDraft } = await import('../src/adapters/vercelAdapter.js');
const { diagnoseRailwayReadiness, buildRailwayBootstrapDraft } = await import('../src/adapters/railwayAdapter.js');

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  PASS: ${name}`); }
function fail(name, e) { failed++; console.error(`  FAIL: ${name}`, e?.message || e); }

function makeTestRun(overrides = {}) {
  clearExecutionRunsForTest();
  _resetForTest();
  const packet = createExecutionPacket({
    thread_key: overrides.thread_key || `ch:VNEXT:${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
    goal_line: overrides.goal || '더그린 갤러리 멤버 캘린더 구축',
    locked_scope_summary: overrides.summary || '팀 일정 관리 MVP',
    includes: overrides.includes || ['반복 일정', '승인'],
    excludes: overrides.excludes || ['결제'],
    deferred_items: overrides.deferred || [],
    approval_rules: [],
    session_id: '',
    requested_by: 'U_TEST',
  });
  return createExecutionRun({
    packet,
    metadata: { user: 'U_TEST', channel: 'C_TEST' },
    playbook_id: overrides.playbook_id || 'PBK-vnext-test',
    task_kind: overrides.task_kind || 'calendar_tool',
  });
}

console.log('\n=== vNext Closure + Project Space Tests ===\n');

/* TEST 1: exact-once dispatch idempotency */
try {
  const run = makeTestRun();
  const r1 = await dispatchOutboundActionsForRun(run, {});
  assert.ok(!r1.skipped, 'first dispatch runs');
  const after = getExecutionRunById(run.run_id);
  assert.equal(after.outbound_dispatch_state, 'completed');
  const r2 = await dispatchOutboundActionsForRun(run, {});
  assert.ok(r2.skipped, 'second dispatch skipped');
  ok('exact-once dispatch idempotency');
} catch (e) { fail('exact-once dispatch idempotency', e); }

/* TEST 2: lane dependency scheduler */
try {
  const run = makeTestRun();
  const plan = computeLaneDispatchPlan(run);
  const research = plan.find((p) => p.lane_type === 'research_benchmark');
  const qa = plan.find((p) => p.lane_type === 'qa_qc');
  assert.ok(research, 'research lane in plan');
  assert.ok(qa, 'qa lane in plan');
  assert.deepEqual(research.depends_on, [], 'research has no deps');
  assert.ok(qa.depends_on.includes('fullstack_swe'), 'qa depends on swe');
  assert.ok(!qa.deps_resolved, 'qa deps not resolved initially');
  ok('lane dependency scheduler');
} catch (e) { fail('lane dependency scheduler', e); }

/* TEST 3: completion detection */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const eval1 = evaluateExecutionRunCompletion(run.run_id);
  assert.ok(['running', 'partial'].includes(eval1.overall_status) || eval1.overall_status === 'completed');
  for (const ws of run.workstreams) {
    updateLaneOutbound(run.run_id, ws.lane_type, { status: 'completed' });
  }
  const eval2 = evaluateExecutionRunCompletion(run.run_id);
  assert.equal(eval2.overall_status, 'completed', 'all lanes completed → completed');
  ok('completion detection');
} catch (e) { fail('completion detection', e); }

/* TEST 4: cursor result ingestion */
try {
  const run = makeTestRun();
  const result = ingestCursorResult(run.run_id, {
    result_summary: '캘린더 UI 컴포넌트 완성',
    changed_files: ['src/calendar.js', 'src/ui/CalendarView.tsx'],
    tests_passed: true,
    status: 'completed',
  });
  assert.ok(result.ok);
  const after = getExecutionRunById(run.run_id);
  assert.ok(after.cursor_trace.length > 0, 'cursor trace populated');
  assert.equal(after.cursor_trace[0].dispatch_mode, 'result_ingested');
  ok('cursor result ingestion');
} catch (e) { fail('cursor result ingestion', e); }

/* TEST 5: supabase manual path consistency */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const instructions = buildSupabaseManualApplyInstructions(run.run_id);
  assert.ok(instructions);
  assert.ok(instructions.result_drop_path.includes('supabase-results'), 'result_drop_path uses supabase-results');
  const badStep = instructions.steps.find((s) => s.includes('cursor-results'));
  assert.ok(!badStep, 'no step references cursor-results');
  const goodStep = instructions.steps.find((s) => s.includes('supabase-results'));
  assert.ok(goodStep, 'step references supabase-results');
  ok('supabase manual path consistency');
} catch (e) { fail('supabase manual path consistency', e); }

/* TEST 6: project space resolve (thread-linked) */
try {
  _resetForTest();
  const space = createProjectSpace({
    human_label: '캘린더 앱',
    aliases: ['calendar-app', '캘린더'],
    repo_name: 'calendar-app',
  });
  const threadKey = 'ch:TEST:thread1';
  linkThreadToProjectSpace(space.project_id, threadKey);

  const r1 = resolveProjectSpaceForThread({ threadKey });
  assert.ok(r1.resolved, 'thread-linked resolve works');
  assert.equal(r1.project_id, space.project_id);

  const r2 = resolveProjectSpaceForThread({ text: '캘린더' });
  assert.ok(r2.resolved, 'alias resolve works');
  assert.equal(r2.project_id, space.project_id);

  const r3 = resolveProjectSpaceForThread({ text: '완전 새로운 뭔가' });
  assert.ok(!r3.resolved, 'unknown text is unresolved');

  // feedback-to-space: 기존 프로젝트에 후속 요청이 같은 project_id로 resolve
  const r4 = resolveProjectSpaceForThread({ threadKey, text: '지난번 그 프로젝트에 피드백 반영해' });
  assert.ok(r4.resolved, 'existing thread feedback resolves');
  assert.equal(r4.project_id, space.project_id, 'resolves to same space');

  ok('project space resolve (thread-linked + alias + feedback)');
} catch (e) { fail('project space resolve', e); }

/* TEST 7: bootstrap draft path (vercel/railway) */
try {
  _resetForTest();
  const { space, plan } = bootstrapProjectSpace({
    label: 'New Gallery App',
    aliases: ['gallery'],
  });
  assert.ok(space.project_id, 'space created');
  assert.ok(plan, 'plan created');
  assert.equal(plan.project_id, space.project_id);

  const vercelStep = plan.steps.find((s) => s.provider === 'vercel');
  assert.ok(vercelStep, 'vercel step exists');
  assert.equal(vercelStep.status, 'draft_only', 'vercel is draft_only without token');

  const railwayStep = plan.steps.find((s) => s.provider === 'railway');
  assert.ok(railwayStep, 'railway step exists');
  assert.equal(railwayStep.status, 'draft_only', 'railway is draft_only without token');

  assert.ok(plan.manual_actions.length > 0, 'has manual actions');
  assert.equal(plan.bootstrap_status, 'partial_manual');

  const rendered = renderBootstrapPlanForSlack(plan);
  assert.ok(rendered.includes('Bootstrap'), 'rendered contains Bootstrap');
  assert.ok(rendered.includes('vercel'), 'rendered contains vercel');

  const vDraft = buildVercelBootstrapDraft(space);
  assert.ok(vDraft.manual_required, 'vercel draft is manual_required');
  assert.ok(!vDraft.live_create_supported, 'vercel live_create not supported');

  const rDraft = buildRailwayBootstrapDraft(space);
  assert.ok(rDraft.manual_required, 'railway draft is manual_required');
  assert.ok(!rDraft.live_create_supported, 'railway live_create not supported');

  ok('bootstrap draft path (vercel/railway)');
} catch (e) { fail('bootstrap draft path', e); }

/* TEST 8: PM intent detection (expanded) */
try {
  assert.equal(detectPMIntent('지금 어디까지 됐어'), 'progress');
  assert.equal(detectPMIntent('progress'), 'progress');
  assert.equal(detectPMIntent('진행 상황 보고해'), 'progress');
  assert.equal(detectPMIntent('뭐가 막혔어'), 'blocked_status');
  assert.equal(detectPMIntent('다시 시도해'), 'retry');
  assert.equal(detectPMIntent('수동으로 내가 해야 할 게 뭐야'), 'manual_status');
  assert.equal(detectPMIntent('이 run 끝났어?'), 'completion_check');
  assert.equal(detectPMIntent('다 끝났어?'), 'completion_check');
  assert.equal(detectPMIntent('어떤 lane이 기다리는 중이야'), 'blocked_status');
  assert.equal(detectPMIntent('일반 대화'), null);
  ok('PM intent detection (expanded)');
} catch (e) { fail('PM intent detection', e); }

/* TEST 9: scanPendingCursorResults (real impl) */
try {
  const run = makeTestRun();
  const cursorDir = path.join(process.cwd(), 'data', 'cursor-results');
  await fs.mkdir(cursorDir, { recursive: true });
  const resultFile = path.join(cursorDir, `${run.run_id}.json`);
  await fs.writeFile(resultFile, JSON.stringify({
    result_summary: 'test result',
    changed_files: ['a.js'],
    tests_passed: true,
    status: 'completed',
  }), 'utf8');

  const before = getExecutionRunById(run.run_id);
  assert.equal(before.cursor_trace.length, 0, 'no trace before scan');

  const scanResult = await scanPendingCursorResults();
  assert.ok(scanResult.scanned > 0, 'scanned files');
  assert.ok(scanResult.ingested > 0, 'ingested result');

  const after = getExecutionRunById(run.run_id);
  assert.ok(after.cursor_trace.length > 0, 'trace populated after scan');
  assert.equal(after.cursor_trace[0].dispatch_mode, 'result_ingested');

  // duplicate check
  const scanResult2 = await scanPendingCursorResults();
  const after2 = getExecutionRunById(run.run_id);
  assert.equal(after2.cursor_trace.length, 1, 'no duplicate ingestion');

  await fs.unlink(resultFile).catch(() => {});
  ok('scanPendingCursorResults (real impl)');
} catch (e) { fail('scanPendingCursorResults', e); }

/* TEST 10: no council leak */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);
  const json = JSON.stringify(after);
  assert.ok(!json.includes('council_mode'), 'no council_mode in run');
  assert.ok(!json.includes('runCouncilMode'), 'no runCouncilMode in run');

  const plan = computeLaneDispatchPlan(run);
  const planJson = JSON.stringify(plan);
  assert.ok(!planJson.includes('council'), 'no council in plan');

  ok('no council leak');
} catch (e) { fail('no council leak', e); }

/* TEST 11: GitHub truth — draft_only when not configured */
try {
  const diag = diagnoseGithubConfig();
  assert.ok(!diag.configured, 'github not configured in test');
  assert.equal(diag.mode, 'draft_only');
  assert.ok(diag.missing.length > 0);
  ok('github truth draft_only');
} catch (e) { fail('github truth draft_only', e); }

/* TEST 12: project intent detection */
try {
  assert.equal(detectProjectIntent('새 프로젝트 만들자'), 'new_project');
  assert.equal(detectProjectIntent('새 앱 시작하자'), 'new_project');
  assert.equal(detectProjectIntent('지난번 그 프로젝트에 반영해'), 'existing_reference');
  assert.equal(detectProjectIntent('기존 앱에 기능 추가'), 'existing_reference');
  assert.equal(detectProjectIntent('일반 대화'), null);
  ok('project intent detection');
} catch (e) { fail('project intent detection', e); }

/* TEST 13: project space CRUD */
try {
  _resetForTest();
  const s1 = createProjectSpace({ human_label: 'Test A', aliases: ['test-a'] });
  assert.ok(s1.project_id);
  assert.equal(getProjectSpaceById(s1.project_id).human_label, 'Test A');
  assert.equal(listProjectSpaces().length, 1);

  linkRunToProjectSpace(s1.project_id, 'RUN-test-1');
  assert.ok(getProjectSpaceById(s1.project_id).active_run_ids.includes('RUN-test-1'));

  linkThreadToProjectSpace(s1.project_id, 'thread-abc');
  assert.equal(getProjectSpaceByThread('thread-abc')?.project_id, s1.project_id);

  const found = searchProjectSpaces('test-a');
  assert.equal(found.length, 1);
  assert.equal(found[0].project_id, s1.project_id);

  ok('project space CRUD');
} catch (e) { fail('project space CRUD', e); }

/* Cleanup */
console.log(`\n=== ${passed} passed, ${failed} failed ===`);

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});

process.exit(failed > 0 ? 1 : 0);
