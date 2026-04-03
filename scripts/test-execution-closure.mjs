#!/usr/bin/env node
/**
 * Execution Closure 회귀 테스트 — 10개 시나리오.
 *
 * 1. run creation triggers outbound dispatch exactly once (idempotency)
 * 2. repeated "progress" messages do not duplicate outbound actions
 * 3. github live/draft status persists correctly
 * 4. cursor result ingestion updates run + reporting
 * 5. supabase applied-result ingestion updates trace
 * 6. uiux/qa/research artifact files are actually generated
 * 7. retry path works without duplication
 * 8. no council leak during dispatch/reporting/retry/result-ingest
 * 9. partial failure keeps ownership and reporting truthful
 * 10. manual_required path stays explicit
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-closure-'));
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
} = await import('../src/features/executionRun.js');

const {
  ensureGithubIssueForRun,
  ensureCursorHandoffForRun,
  ensureSupabaseDraftForRun,
  dispatchOutboundActionsForRun,
  collectOutboundStatus,
  formatOutboundStatusForSlack,
  retryOutboundLane,
  retryRunOutbound,
  generateResearchArtifact,
  generateUiuxArtifacts,
  generateQaArtifacts,
} = await import('../src/features/executionOutboundOrchestrator.js');

const {
  renderExecutionRunningPacket,
  renderExecutionReportingPacket,
} = await import('../src/features/executionSpineRouter.js');

const {
  ingestGithubResult,
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
    thread_key: overrides.thread_key || `ch:CLOSURE:${Date.now()}.${Math.random().toString(36).slice(2, 6)}`,
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
    playbook_id: overrides.playbook_id || 'PBK-closure-test',
    task_kind: overrides.task_kind || 'calendar_tool',
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
}

async function cleanup() {
  for (const p of cleanupPaths) {
    await fs.unlink(path.resolve(process.cwd(), p)).catch(() => {});
  }
  cleanupPaths.length = 0;
}

/** macOS 등에서 tmp 안에 예기치 않은 항목이 있으면 단일 fs.rm(tmp)가 ENOTEMPTY로 실패할 수 있어 자식부터 제거 */
async function removeTmpWorkspace() {
  try {
    const entries = await fs.readdir(tmp);
    for (const name of entries) {
      await fs.rm(path.join(tmp, name), { recursive: true, force: true });
    }
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 });
  } catch {
    await fs.rm(tmp, { recursive: true, force: true, maxRetries: 5 }).catch(() => {});
  }
}

/* ============================== */
/* TEST 1: dispatch exactly once + idempotency */
/* ============================== */
try {
  const run = makeTestRun();
  assert.equal(run.outbound_dispatch_state, 'not_started', 'initial state');

  const r1 = await dispatchOutboundActionsForRun(run, { channel: 'C_TEST' });
  assert.ok(!r1.skipped, 'first dispatch runs');

  const after1 = getExecutionRunById(run.run_id);
  assert.ok(['completed', 'partial'].includes(after1.outbound_dispatch_state), 'dispatch state updated');
  assert.ok(after1.outbound_dispatched_at, 'dispatched_at set');

  const r2 = await dispatchOutboundActionsForRun(run, { channel: 'C_TEST' });
  assert.ok(r2.skipped, 'second dispatch skipped');
  assert.equal(r2.reason, 'already_dispatched');

  // Collect generated files for cleanup
  if (after1.artifacts?.fullstack_swe?.cursor_handoff_path) cleanupPaths.push(after1.artifacts.fullstack_swe.cursor_handoff_path);
  if (after1.artifacts?.research_benchmark?.research_note_path) cleanupPaths.push(after1.artifacts.research_benchmark.research_note_path);
  const uiux = after1.artifacts?.uiux_design;
  if (uiux?.ui_spec_delta_path) cleanupPaths.push(uiux.ui_spec_delta_path);
  if (uiux?.wireframe_note_path) cleanupPaths.push(uiux.wireframe_note_path);
  if (uiux?.component_checklist_path) cleanupPaths.push(uiux.component_checklist_path);
  const qa = after1.artifacts?.qa_qc;
  if (qa?.acceptance_checklist_path) cleanupPaths.push(qa.acceptance_checklist_path);
  if (qa?.regression_case_list_path) cleanupPaths.push(qa.regression_case_list_path);
  if (qa?.smoke_test_plan_path) cleanupPaths.push(qa.smoke_test_plan_path);
  const dep = after1.artifacts?.deploy_preview;
  if (dep?.vercel_packet_path) cleanupPaths.push(dep.vercel_packet_path);
  if (dep?.railway_packet_path) cleanupPaths.push(dep.railway_packet_path);
  if (dep?.observe_summary_path) cleanupPaths.push(dep.observe_summary_path);
  const spec = after1.artifacts?.spec_refine;
  if (spec?.outline_path) cleanupPaths.push(spec.outline_path);
  if (after1.artifacts?.fullstack_swe?.supabase_schema_draft_path) {
    cleanupPaths.push(after1.artifacts.fullstack_swe.supabase_schema_draft_path);
  }
  if (after1.artifacts?.fullstack_swe?.supabase_migration_file_path) {
    cleanupPaths.push(after1.artifacts.fullstack_swe.supabase_migration_file_path);
  }
  await cleanup();
  clearExecutionRunsForTest();
  ok('dispatch exactly once + idempotency');
} catch (e) { fail('dispatch exactly once + idempotency', e); await cleanup(); }

/* ============================== */
/* TEST 2: progress messages don't duplicate outbound */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});
  const after = getExecutionRunById(run.run_id);

  // Simulate repeated "진행 보고" messages — these go to reporting, not dispatch
  const report1 = renderExecutionReportingPacket(after);
  const report2 = renderExecutionReportingPacket(after);
  assert.deepEqual(report1, report2, 'reports are identical');

  // Ensure GitHub not re-created
  const gh = await ensureGithubIssueForRun(after, {});
  assert.ok(gh.skipped, 'github not re-dispatched');

  const cursor = await ensureCursorHandoffForRun(after);
  assert.ok(cursor.skipped, 'cursor not re-dispatched');

  if (after.artifacts?.fullstack_swe?.cursor_handoff_path) cleanupPaths.push(after.artifacts.fullstack_swe.cursor_handoff_path);
  if (after.artifacts?.research_benchmark?.research_note_path) cleanupPaths.push(after.artifacts.research_benchmark.research_note_path);
  const uiux = after.artifacts?.uiux_design;
  if (uiux?.ui_spec_delta_path) cleanupPaths.push(uiux.ui_spec_delta_path, uiux.wireframe_note_path, uiux.component_checklist_path);
  const qa = after.artifacts?.qa_qc;
  if (qa?.acceptance_checklist_path) cleanupPaths.push(qa.acceptance_checklist_path, qa.regression_case_list_path, qa.smoke_test_plan_path);
  const dep2 = after.artifacts?.deploy_preview;
  if (dep2?.vercel_packet_path) cleanupPaths.push(dep2.vercel_packet_path);
  if (dep2?.railway_packet_path) cleanupPaths.push(dep2.railway_packet_path);
  if (dep2?.observe_summary_path) cleanupPaths.push(dep2.observe_summary_path);
  const spec2 = after.artifacts?.spec_refine;
  if (spec2?.outline_path) cleanupPaths.push(spec2.outline_path);
  if (after.artifacts?.fullstack_swe?.supabase_schema_draft_path) {
    cleanupPaths.push(after.artifacts.fullstack_swe.supabase_schema_draft_path);
  }
  if (after.artifacts?.fullstack_swe?.supabase_migration_file_path) {
    cleanupPaths.push(after.artifacts.fullstack_swe.supabase_migration_file_path);
  }
  await cleanup();
  clearExecutionRunsForTest();
  ok('progress does not duplicate outbound');
} catch (e) { fail('progress does not duplicate outbound', e); await cleanup(); }

/* ============================== */
/* TEST 3: github status persists correctly */
/* ============================== */
try {
  const run = makeTestRun();
  const gh = await ensureGithubIssueForRun(run, {});
  assert.equal(gh.mode, 'draft');

  const r = getExecutionRunById(run.run_id);
  const ws = r.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(ws.outbound.outbound_provider, 'github');
  assert.equal(ws.outbound.outbound_status, 'drafted');
  assert.ok(r.artifacts.fullstack_swe.github_draft_payload, 'draft payload exists');
  assert.ok(r.artifacts.fullstack_swe.branch_name, 'branch persisted');

  clearExecutionRunsForTest();
  ok('github status persists');
} catch (e) { fail('github status persists', e); }

/* ============================== */
/* TEST 4: cursor result ingestion updates run + reporting */
/* ============================== */
try {
  const run = makeTestRun();
  await ensureCursorHandoffForRun(run);
  if (run.artifacts?.fullstack_swe?.cursor_handoff_path) cleanupPaths.push(run.artifacts.fullstack_swe.cursor_handoff_path);

  const result = ingestCursorResult(run.run_id, {
    result_summary: 'Calendar CRUD implemented',
    changed_files: ['src/calendar.js', 'src/routes/calendar.js'],
    tests_passed: true,
    status: 'completed',
    handoff_path: run.artifacts?.fullstack_swe?.cursor_handoff_path || 'data/exec-handoffs/test.md',
  });
  assert.ok(result.ok, 'ingest succeeded');
  assert.equal(result.status, 'completed');

  const after = getExecutionRunById(run.run_id);
  assert.ok(after.cursor_trace.length >= 2, 'cursor_trace has creation + ingestion');
  const lastTrace = after.cursor_trace[after.cursor_trace.length - 1];
  assert.equal(lastTrace.dispatch_mode, 'result_ingested');
  assert.equal(lastTrace.status, 'completed');
  assert.deepEqual(lastTrace.changed_files, ['src/calendar.js', 'src/routes/calendar.js']);
  assert.equal(lastTrace.tests_passed, true);
  assert.ok(after.latest_report?.includes('Calendar CRUD'), 'report updated with result');

  const report = renderExecutionReportingPacket(after);
  assert.ok(report.includes('Cursor trace'), 'reporting shows cursor trace');
  assert.ok(report.includes('completed'), 'shows completed status');

  await cleanup();
  clearExecutionRunsForTest();
  ok('cursor result ingestion');
} catch (e) { fail('cursor result ingestion', e); await cleanup(); }

/* ============================== */
/* TEST 5: supabase applied-result ingestion updates trace */
/* ============================== */
try {
  const run = makeTestRun({
    goal: 'DB 스키마 설계',
    includes: ['user table', 'RLS policy'],
  });
  await ensureSupabaseDraftForRun(run);
  if (run.artifacts?.fullstack_swe?.supabase_schema_draft_path) cleanupPaths.push(run.artifacts.fullstack_swe.supabase_schema_draft_path);

  const result = ingestSupabaseResult(run.run_id, {
    migration_id: 'MIG-20260329-001',
    migration_path: 'supabase/migrations/20260329_init.sql',
    apply_status: 'applied_result_ingested',
    schema_summary: 'User table + RLS created',
  });
  assert.ok(result.ok, 'ingest succeeded');

  const after = getExecutionRunById(run.run_id);
  assert.ok(after.supabase_trace.length >= 2, 'supabase_trace has draft + ingestion');
  const lastTrace = after.supabase_trace[after.supabase_trace.length - 1];
  assert.equal(lastTrace.kind, 'migration_applied');
  assert.equal(lastTrace.migration_id, 'MIG-20260329-001');
  assert.ok(after.git_trace.supabase_migration_ids.includes('MIG-20260329-001'), 'migration in git_trace');

  const ws = after.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(ws.outbound.outbound_status, 'completed');

  await cleanup();
  clearExecutionRunsForTest();
  ok('supabase result ingestion');
} catch (e) { fail('supabase result ingestion', e); await cleanup(); }

/* ============================== */
/* TEST 6: uiux/qa/research artifacts actually generated */
/* ============================== */
try {
  const run = makeTestRun();

  const res = await generateResearchArtifact(run);
  assert.equal(res.mode, 'created');
  assert.ok(res.path);
  cleanupPaths.push(res.path);
  const resContent = await fs.readFile(path.resolve(process.cwd(), res.path), 'utf8');
  assert.ok(resContent.includes(run.run_id), 'research note contains run_id');
  assert.ok(resContent.includes('Research Objective'), 'has structure');

  const uiux = await generateUiuxArtifacts(run);
  assert.equal(uiux.mode, 'created');
  assert.ok(uiux.paths.length === 3, '3 uiux files');
  for (const p of uiux.paths) {
    cleanupPaths.push(p);
    const c = await fs.readFile(path.resolve(process.cwd(), p), 'utf8');
    assert.ok(c.includes(run.run_id), `uiux file ${p} contains run_id`);
  }

  const qa = await generateQaArtifacts(run);
  assert.equal(qa.mode, 'created');
  assert.ok(qa.paths.length === 3, '3 qa files');
  for (const p of qa.paths) {
    cleanupPaths.push(p);
    const c = await fs.readFile(path.resolve(process.cwd(), p), 'utf8');
    assert.ok(c.includes(run.run_id), `qa file ${p} contains run_id`);
  }

  const after = getExecutionRunById(run.run_id);
  assert.ok(after.artifacts.research_benchmark.research_note_path, 'research path attached');
  assert.ok(after.artifacts.uiux_design.ui_spec_delta_path, 'uiux spec attached');
  assert.ok(after.artifacts.uiux_design.component_checklist_path, 'uiux components attached');
  assert.ok(after.artifacts.qa_qc.acceptance_checklist_path, 'qa acceptance attached');
  assert.ok(after.artifacts.qa_qc.smoke_test_plan_path, 'qa smoke attached');

  await cleanup();
  clearExecutionRunsForTest();
  ok('real artifact generation');
} catch (e) { fail('real artifact generation', e); await cleanup(); }

/* ============================== */
/* TEST 7: retry path works without duplication */
/* ============================== */
try {
  const run = makeTestRun();

  // Mark research as failed manually
  updateLaneOutbound(run.run_id, 'research_benchmark', { provider: 'internal', status: 'failed', error: 'test_failure' });

  const retryResult = await retryOutboundLane(run.run_id, 'research_benchmark');
  assert.ok(retryResult.mode === 'created' || retryResult.path, 'retry produced result');

  const after = getExecutionRunById(run.run_id);
  const researchLane = after.workstreams.find((w) => w.lane_type === 'research_benchmark');
  assert.equal(researchLane.outbound.outbound_status, 'drafted', 'status fixed after retry');
  assert.ok(after.artifacts.research_benchmark.research_note_path, 'artifact created on retry');

  if (after.artifacts.research_benchmark.research_note_path) cleanupPaths.push(after.artifacts.research_benchmark.research_note_path);

  // Retry already-dispatched lane should skip
  const skipResult = await retryOutboundLane(run.run_id, 'research_benchmark');
  // drafted → doesn't skip (only dispatched/completed skip)
  // Let's test completed skip: mark it completed
  updateLaneOutbound(run.run_id, 'research_benchmark', { status: 'completed' });
  const skipResult2 = await retryOutboundLane(run.run_id, 'research_benchmark');
  assert.ok(skipResult2.skipped, 'completed lane is skipped on retry');

  await cleanup();
  clearExecutionRunsForTest();
  ok('retry without duplication');
} catch (e) { fail('retry without duplication', e); await cleanup(); }

/* ============================== */
/* TEST 8: no council leak in any closure flow */
/* ============================== */
try {
  const run = makeTestRun();
  await dispatchOutboundActionsForRun(run, {});

  const after = getExecutionRunById(run.run_id);
  ingestCursorResult(run.run_id, { result_summary: 'patch applied', status: 'completed' });

  const report = renderExecutionReportingPacket(getExecutionRunById(run.run_id));
  const running = renderExecutionRunningPacket(after);
  const slack = formatOutboundStatusForSlack(run.run_id);

  const allText = [report, running, slack].join('\n');
  const forbidden = [
    '페르소나별 핵심 관점', '가장 강한 반대 논리', '종합 추천안',
    '대표 결정 필요 여부', '내부 처리 정보', '업무등록', '계획등록',
  ];
  for (const term of forbidden) {
    assert.ok(!allText.includes(term), `no "${term}" in closure output`);
  }

  if (after.artifacts?.fullstack_swe?.cursor_handoff_path) cleanupPaths.push(after.artifacts.fullstack_swe.cursor_handoff_path);
  if (after.artifacts?.research_benchmark?.research_note_path) cleanupPaths.push(after.artifacts.research_benchmark.research_note_path);
  const uiux = after.artifacts?.uiux_design;
  if (uiux?.ui_spec_delta_path) cleanupPaths.push(uiux.ui_spec_delta_path, uiux.wireframe_note_path, uiux.component_checklist_path);
  const qa = after.artifacts?.qa_qc;
  if (qa?.acceptance_checklist_path) cleanupPaths.push(qa.acceptance_checklist_path, qa.regression_case_list_path, qa.smoke_test_plan_path);
  await cleanup();
  clearExecutionRunsForTest();
  ok('no council leak in closure flows');
} catch (e) { fail('no council leak', e); await cleanup(); }

/* ============================== */
/* TEST 9: partial failure keeps ownership truthful */
/* ============================== */
try {
  const run = makeTestRun();

  // Simulate: github drafts ok, cursor ok, but manually mark qa as failed
  await dispatchOutboundActionsForRun(run, {});
  updateLaneOutbound(run.run_id, 'qa_qc', { status: 'failed', error: 'test_simulated_failure' });

  const after = getExecutionRunById(run.run_id);
  assert.equal(after.status, 'active', 'run still active despite partial failure');
  assert.equal(after.current_stage, 'execution_running', 'stage preserved');

  const report = renderExecutionReportingPacket(after);
  assert.ok(report.includes('qa_qc'), 'report mentions qa');
  assert.ok(report.includes('failed') || report.includes('test_simulated_failure'), 'report shows failure');
  assert.ok(report.includes('수동 조치 필요'), 'shows manual action needed section');

  if (after.artifacts?.fullstack_swe?.cursor_handoff_path) cleanupPaths.push(after.artifacts.fullstack_swe.cursor_handoff_path);
  if (after.artifacts?.research_benchmark?.research_note_path) cleanupPaths.push(after.artifacts.research_benchmark.research_note_path);
  const uiux = after.artifacts?.uiux_design;
  if (uiux?.ui_spec_delta_path) cleanupPaths.push(uiux.ui_spec_delta_path, uiux.wireframe_note_path, uiux.component_checklist_path);
  const qa = after.artifacts?.qa_qc;
  if (qa?.acceptance_checklist_path) cleanupPaths.push(qa.acceptance_checklist_path, qa.regression_case_list_path, qa.smoke_test_plan_path);
  await cleanup();
  clearExecutionRunsForTest();
  ok('partial failure keeps ownership truthful');
} catch (e) { fail('partial failure truthful', e); await cleanup(); }

/* ============================== */
/* TEST 10: manual_required stays explicit */
/* ============================== */
try {
  const run = makeTestRun();
  await ensureGithubIssueForRun(run, {});

  // Mark github as manual_required (e.g. need manual PR review)
  updateLaneOutbound(run.run_id, 'fullstack_swe', {
    provider: 'github', status: 'manual_required', error: 'PR needs manual review',
  });

  const after = getExecutionRunById(run.run_id);
  const ws = after.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(ws.outbound.outbound_status, 'manual_required');
  assert.ok(ws.outbound.last_error?.includes('manual review'));

  const report = renderExecutionReportingPacket(after);
  assert.ok(report.includes('manual_required'), 'report shows manual_required');
  assert.ok(report.includes('수동 조치 필요'), 'manual action section visible');

  // Ensure supabase manual_apply also explicit
  ingestSupabaseResult(run.run_id, {
    draft_path: 'data/supabase-drafts/test.json',
    apply_status: 'manual_apply',
    schema_summary: 'Needs DBA review',
  });

  const after2 = getExecutionRunById(run.run_id);
  const wsAfter = after2.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(wsAfter.outbound.outbound_status, 'manual_required');

  const report2 = renderExecutionReportingPacket(after2);
  assert.ok(report2.includes('Supabase trace'), 'supabase trace visible');

  clearExecutionRunsForTest();
  ok('manual_required stays explicit');
} catch (e) { fail('manual_required explicit', e); }

/* ============================== */
/* Cleanup */
/* ============================== */
clearExecutionRunsForTest();
await cleanup();
await removeTmpWorkspace();
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;

console.log('');
console.log(`EXECUTION CLOSURE: passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
