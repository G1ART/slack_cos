#!/usr/bin/env node
/**
 * Final Operating Closure 회귀 테스트 — 11개 시나리오.
 *
 * 1. playbook promotion path auto-dispatches via ensureExecutionRunDispatched
 * 2. ensureExecutionRunDispatched is idempotent
 * 3. run-level dispatch state transitions
 * 4. lane dependency scheduling
 * 5. completion detection
 * 6. github live/manual config diagnostics
 * 7. cursor awaiting_result -> result_ingested flow
 * 8. supabase manual_apply -> applied_result_ingested flow
 * 9. PM cockpit status asks
 * 10. retry helpers without duplication
 * 11. no council leak across all of the above
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-final-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');

delete process.env.GITHUB_FINE_GRAINED_PAT;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_APP_ID;

const {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunById,
  clearExecutionRunsForTest,
  updateLaneOutbound,
  updateOutboundDispatchState,
  getRunDispatchState,
} = await import('../src/features/executionRun.js');

const {
  dispatchOutboundActionsForRun,
  retryRunOutbound,
  retryOutboundLane,
  collectOutboundStatus,
} = await import('../src/features/executionOutboundOrchestrator.js');

const {
  ensureExecutionRunDispatched,
  shouldDispatchRun,
  computeLaneDispatchPlan,
  getDispatchableLanes,
  isLaneCompleted,
  evaluateExecutionRunCompletion,
  detectAndApplyCompletion,
  diagnoseGithubConfig,
  getCursorOperationalStatus,
  buildSupabaseManualApplyInstructions,
  detectPMIntent,
} = await import('../src/features/executionDispatchLifecycle.js');

const {
  renderExecutionReportingPacket,
  renderPMCockpitPacket,
  tryFinalizeExecutionSpineTurn,
} = await import('../src/features/executionSpineRouter.js');

const {
  ingestCursorResult,
  ingestSupabaseResult,
} = await import('../src/features/executionResultIngestion.js');

let passed = 0;
let failed = 0;
const cleanupPaths = [];

function ok(name) { passed++; console.log(`  PASS: ${name}`); }
function fail(name, e) { failed++; console.error(`  FAIL: ${name}`, e?.message || e); }

function makeTestRun(overrides = {}) {
  clearExecutionRunsForTest();
  const packet = createExecutionPacket({
    thread_key: overrides.thread_key || `ch:FINAL:${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
    goal_line: overrides.goal || '더그린 갤러리 멤버 캘린더 구축',
    locked_scope_summary: overrides.summary || '팀 일정 관리 MVP',
    includes: overrides.includes || ['반복 일정', '승인 워크플로', '개인 블럭'],
    excludes: overrides.excludes || ['외부 결제'],
    deferred_items: overrides.deferred || ['가격 체계'],
    approval_rules: [],
    session_id: '',
    requested_by: 'U_TEST',
  });
  return createExecutionRun({
    packet,
    metadata: { user: 'U_TEST', channel: 'C_TEST' },
    playbook_id: overrides.playbook_id || 'PBK-final-test',
    task_kind: overrides.task_kind || 'calendar_tool',
  });
}

async function cleanup() {
  for (const p of cleanupPaths) {
    await fs.unlink(path.resolve(process.cwd(), p)).catch(() => {});
  }
  cleanupPaths.length = 0;
}

function collectArtifactPaths(run) {
  const paths = [];
  const r = run?.artifacts?.research_benchmark;
  if (r?.research_note_path) paths.push(r.research_note_path);
  const swe = run?.artifacts?.fullstack_swe;
  if (swe?.cursor_handoff_path) paths.push(swe.cursor_handoff_path);
  if (swe?.supabase_schema_draft_path) paths.push(swe.supabase_schema_draft_path);
  const ui = run?.artifacts?.uiux_design;
  if (ui?.ui_spec_delta_path) paths.push(ui.ui_spec_delta_path);
  if (ui?.wireframe_note_path) paths.push(ui.wireframe_note_path);
  if (ui?.component_checklist_path) paths.push(ui.component_checklist_path);
  const qa = run?.artifacts?.qa_qc;
  if (qa?.acceptance_checklist_path) paths.push(qa.acceptance_checklist_path);
  if (qa?.regression_case_list_path) paths.push(qa.regression_case_list_path);
  if (qa?.smoke_test_plan_path) paths.push(qa.smoke_test_plan_path);
  return paths;
}

/* ============================== */
/* TEST 1: ensureExecutionRunDispatched auto-dispatches */
/* ============================== */
try {
  const run = makeTestRun();
  assert.ok(shouldDispatchRun(run), 'shouldDispatchRun true for new run');

  ensureExecutionRunDispatched(run, { channel: 'C_TEST' });
  // Wait for async dispatch
  await new Promise((r) => setTimeout(r, 300));

  const after = getExecutionRunById(run.run_id);
  assert.ok(['completed', 'partial', 'in_progress'].includes(after.outbound_dispatch_state), 'dispatch state moved');
  assert.ok(after.outbound_dispatched_at, 'dispatched_at set');

  cleanupPaths.push(...collectArtifactPaths(after));
  await cleanup();
  clearExecutionRunsForTest();
  ok('ensureExecutionRunDispatched auto-dispatches');
} catch (e) { fail('ensureExecutionRunDispatched auto-dispatches', e); await cleanup(); }

/* ============================== */
/* TEST 2: ensureExecutionRunDispatched is idempotent */
/* ============================== */
try {
  const run = makeTestRun();
  ensureExecutionRunDispatched(run, {});
  await new Promise((r) => setTimeout(r, 300));

  const after = getExecutionRunById(run.run_id);
  const attempts1 = after.outbound_dispatch_attempts;

  // Second call should be skipped
  assert.ok(!shouldDispatchRun(after), 'shouldDispatchRun false after dispatch');
  ensureExecutionRunDispatched(after, {});
  await new Promise((r) => setTimeout(r, 100));

  const after2 = getExecutionRunById(run.run_id);
  assert.equal(after2.outbound_dispatch_attempts, attempts1, 'attempts not incremented');

  cleanupPaths.push(...collectArtifactPaths(after2));
  await cleanup();
  clearExecutionRunsForTest();
  ok('ensureExecutionRunDispatched idempotent');
} catch (e) { fail('ensureExecutionRunDispatched idempotent', e); await cleanup(); }

/* ============================== */
/* TEST 3: run-level dispatch state transitions */
/* ============================== */
try {
  const run = makeTestRun();
  assert.equal(run.outbound_dispatch_state, 'not_started');

  const state1 = getRunDispatchState(run.run_id);
  assert.equal(state1.outbound_dispatch_state, 'not_started');
  assert.equal(state1.outbound_dispatch_attempts, 0);

  updateOutboundDispatchState(run.run_id, 'in_progress');
  const state2 = getRunDispatchState(run.run_id);
  assert.equal(state2.outbound_dispatch_state, 'in_progress');
  assert.equal(state2.outbound_dispatch_attempts, 1);

  updateOutboundDispatchState(run.run_id, 'completed');
  const state3 = getRunDispatchState(run.run_id);
  assert.equal(state3.outbound_dispatch_state, 'completed');
  assert.ok(state3.outbound_dispatched_at);

  updateOutboundDispatchState(run.run_id, 'failed', { error: 'test error' });
  const state4 = getRunDispatchState(run.run_id);
  assert.equal(state4.outbound_dispatch_state, 'failed');
  assert.equal(state4.outbound_last_error, 'test error');

  clearExecutionRunsForTest();
  ok('dispatch state transitions');
} catch (e) { fail('dispatch state transitions', e); }

/* ============================== */
/* TEST 4: lane dependency scheduling */
/* ============================== */
try {
  const run = makeTestRun();
  const plan = computeLaneDispatchPlan(run);

  assert.equal(plan.length, 4, '4 lanes in plan');

  const research = plan.find((p) => p.lane_type === 'research_benchmark');
  assert.deepEqual(research.depends_on, [], 'research has no deps');
  assert.ok(research.ready_for_dispatch, 'research ready');

  const swe = plan.find((p) => p.lane_type === 'fullstack_swe');
  assert.deepEqual(swe.depends_on, ['research_benchmark'], 'swe depends on research');
  assert.ok(!swe.ready_for_dispatch, 'swe not ready initially');

  const qa = plan.find((p) => p.lane_type === 'qa_qc');
  assert.deepEqual(qa.depends_on, ['fullstack_swe'], 'qa depends on swe');

  // Mark research as drafted
  updateLaneOutbound(run.run_id, 'research_benchmark', { status: 'drafted' });
  const plan2 = computeLaneDispatchPlan(getExecutionRunById(run.run_id));
  const swe2 = plan2.find((p) => p.lane_type === 'fullstack_swe');
  assert.ok(swe2.ready_for_dispatch, 'swe ready after research drafted');

  const dispatchable = getDispatchableLanes(getExecutionRunById(run.run_id));
  assert.ok(dispatchable.includes('fullstack_swe'), 'swe dispatchable');
  assert.ok(dispatchable.includes('uiux_design'), 'uiux dispatchable');

  clearExecutionRunsForTest();
  ok('lane dependency scheduling');
} catch (e) { fail('lane dependency scheduling', e); }

/* ============================== */
/* TEST 5: completion detection */
/* ============================== */
try {
  const run = makeTestRun();

  // All pending
  let eval_ = evaluateExecutionRunCompletion(run.run_id);
  assert.equal(eval_.overall_status, 'running');

  // Mark all completed
  for (const ws of run.workstreams) {
    updateLaneOutbound(run.run_id, ws.lane_type, { status: 'completed' });
  }

  eval_ = evaluateExecutionRunCompletion(run.run_id);
  assert.equal(eval_.overall_status, 'completed');
  assert.equal(eval_.completed_lanes.length, 4);

  // Reset and test partial
  clearExecutionRunsForTest();
  const run2 = makeTestRun();
  updateLaneOutbound(run2.run_id, 'research_benchmark', { status: 'completed' });
  updateLaneOutbound(run2.run_id, 'fullstack_swe', { status: 'failed', error: 'test' });

  eval_ = evaluateExecutionRunCompletion(run2.run_id);
  assert.equal(eval_.overall_status, 'partial');
  assert.ok(eval_.failed_lanes.includes('fullstack_swe'));
  assert.ok(eval_.next_actions.length > 0);

  // Test manual_blocked
  clearExecutionRunsForTest();
  const run3 = makeTestRun();
  updateLaneOutbound(run3.run_id, 'research_benchmark', { status: 'completed' });
  updateLaneOutbound(run3.run_id, 'fullstack_swe', { status: 'completed' });
  updateLaneOutbound(run3.run_id, 'uiux_design', { status: 'completed' });
  updateLaneOutbound(run3.run_id, 'qa_qc', { status: 'manual_required', error: 'need review' });

  eval_ = evaluateExecutionRunCompletion(run3.run_id);
  assert.equal(eval_.overall_status, 'manual_blocked');

  clearExecutionRunsForTest();
  ok('completion detection');
} catch (e) { fail('completion detection', e); }

/* ============================== */
/* TEST 6: github config diagnostics */
/* ============================== */
try {
  delete process.env.GITHUB_FINE_GRAINED_PAT;
  delete process.env.GITHUB_TOKEN;

  const diag = diagnoseGithubConfig();
  assert.equal(diag.configured, false);
  assert.equal(diag.mode, 'draft_only');
  assert.ok(diag.missing.length > 0);

  clearExecutionRunsForTest();
  ok('github config diagnostics');
} catch (e) { fail('github config diagnostics', e); }

/* ============================== */
/* TEST 7: cursor awaiting_result -> result_ingested */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);

  let cursorStatus = getCursorOperationalStatus(run.run_id);
  assert.equal(cursorStatus.status, 'awaiting_result');
  assert.ok(cursorStatus.handoff_path);

  // Ingest result
  ingestCursorResult(run.run_id, {
    result_summary: 'CRUD 구현 완료',
    changed_files: ['src/app.js'],
    tests_passed: true,
    status: 'completed',
  });

  cursorStatus = getCursorOperationalStatus(run.run_id);
  assert.equal(cursorStatus.status, 'result_ingested');
  assert.equal(cursorStatus.result_summary, 'CRUD 구현 완료');
  assert.ok(cursorStatus.tests_passed);

  cleanupPaths.push(...collectArtifactPaths(getExecutionRunById(run.run_id)));
  await cleanup();
  clearExecutionRunsForTest();
  ok('cursor awaiting_result -> result_ingested');
} catch (e) { fail('cursor awaiting -> ingested', e); await cleanup(); }

/* ============================== */
/* TEST 8: supabase manual_apply -> applied_result_ingested */
/* ============================== */
try {
  const run = makeTestRun({ goal: 'DB 스키마 구축', includes: ['user table', 'RLS'] });
  await dispatchOutboundActionsForRun(run, {});

  const instructions = buildSupabaseManualApplyInstructions(run.run_id);
  assert.ok(instructions);
  assert.ok(instructions.steps.length >= 3);

  // Apply result
  ingestSupabaseResult(run.run_id, {
    migration_id: 'MIG-001',
    apply_status: 'applied_result_ingested',
  });

  const after = getExecutionRunById(run.run_id);
  assert.ok(after.git_trace.supabase_migration_ids.includes('MIG-001'));
  const ws = after.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(ws.outbound.outbound_status, 'completed');

  cleanupPaths.push(...collectArtifactPaths(after));
  await cleanup();
  clearExecutionRunsForTest();
  ok('supabase manual_apply -> applied');
} catch (e) { fail('supabase manual_apply -> applied', e); await cleanup(); }

/* ============================== */
/* TEST 9: PM cockpit status asks */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);

  const report = renderExecutionReportingPacket(after);
  assert.ok(report.includes('실행 진행 보고'), 'has reporting header');
  assert.ok(report.includes('전체:'), 'has overall status');
  assert.ok(report.includes('Dispatch 상태'), 'has dispatch state');

  const cockpit = renderPMCockpitPacket(after);
  assert.ok(cockpit.includes('PM 대시보드'), 'has cockpit header');
  assert.ok(cockpit.includes('research_benchmark'));
  assert.ok(cockpit.includes('fullstack_swe'));

  // PM intent detection
  assert.equal(detectPMIntent('retry 해줘'), 'retry');
  assert.equal(detectPMIntent('수동 조치 뭐 남았어'), 'manual_status');
  assert.equal(detectPMIntent('진행해줘'), null);

  cleanupPaths.push(...collectArtifactPaths(after));
  await cleanup();
  clearExecutionRunsForTest();
  ok('PM cockpit status asks');
} catch (e) { fail('PM cockpit status', e); await cleanup(); }

/* ============================== */
/* TEST 10: retry without duplication */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);

  // Mark research failed, retry it
  updateLaneOutbound(run.run_id, 'research_benchmark', { status: 'failed', error: 'simulated' });
  const result = await retryOutboundLane(run.run_id, 'research_benchmark');
  assert.ok(result.mode === 'created' || result.path, 'retry produced artifact');

  // Already-completed lane skips
  updateLaneOutbound(run.run_id, 'uiux_design', { status: 'completed' });
  const skipResult = await retryOutboundLane(run.run_id, 'uiux_design');
  assert.ok(skipResult.skipped, 'completed lane skipped');

  // Full run retry
  updateLaneOutbound(run.run_id, 'qa_qc', { status: 'failed', error: 'sim' });
  const fullRetry = await retryRunOutbound(run.run_id, {});
  assert.ok(fullRetry, 'run retry result');
  assert.ok(fullRetry.uiux_design?.skipped, 'completed lane skipped in full retry');

  cleanupPaths.push(...collectArtifactPaths(getExecutionRunById(run.run_id)));
  await cleanup();
  clearExecutionRunsForTest();
  ok('retry without duplication');
} catch (e) { fail('retry without duplication', e); await cleanup(); }

/* ============================== */
/* TEST 11: no council leak in any flow */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);

  ingestCursorResult(run.run_id, { result_summary: 'done', status: 'completed' });

  const report = renderExecutionReportingPacket(getExecutionRunById(run.run_id));
  const cockpit = renderPMCockpitPacket(getExecutionRunById(run.run_id));

  const allText = [report, cockpit].join('\n');
  const forbidden = [
    '페르소나별 핵심 관점', '가장 강한 반대 논리', '종합 추천안',
    '대표 결정 필요 여부', '내부 처리 정보', '업무등록', '계획등록',
  ];
  for (const term of forbidden) {
    assert.ok(!allText.includes(term), `no "${term}" in output`);
  }

  cleanupPaths.push(...collectArtifactPaths(after));
  await cleanup();
  clearExecutionRunsForTest();
  ok('no council leak');
} catch (e) { fail('no council leak', e); await cleanup(); }

/* ============================== */
/* Cleanup */
/* ============================== */
clearExecutionRunsForTest();
await cleanup();
await fs.rm(tmp, { recursive: true, force: true });
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;

console.log('');
console.log(`FINAL OPERATING CLOSURE: passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
