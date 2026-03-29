#!/usr/bin/env node
/**
 * Execution Outbound Orchestration 회귀 테스트 — 8개 시나리오.
 * 1. execution run → github draft/live issue attachment
 * 2. execution run → cursor handoff artifact attachment
 * 3. execution run → supabase draft attachment
 * 4. outbound failures do not collapse run ownership
 * 5. execution reporting surface shows outbound truth
 * 6. git_trace gets updated progressively
 * 7. cursor_trace and supabase_trace get updated
 * 8. no council exposure during outbound execution reporting
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-outbound-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');

const {
  createExecutionPacket,
  createExecutionRun,
  getExecutionRunById,
  getExecutionRunByThread,
  clearExecutionRunsForTest,
  updateRunGitTrace,
  attachRunArtifact,
} = await import('../src/features/executionRun.js');

const {
  ensureGithubIssueForRun,
  ensureCursorHandoffForRun,
  ensureSupabaseDraftForRun,
  planOutboundActionsForRun,
  dispatchOutboundActionsForRun,
  collectOutboundStatus,
  formatOutboundStatusForSlack,
  seedResearchArtifact,
  seedUiuxArtifacts,
  seedQaArtifacts,
} = await import('../src/features/executionOutboundOrchestrator.js');

const {
  renderExecutionRunningPacket,
  renderExecutionReportingPacket,
} = await import('../src/features/executionSpineRouter.js');

let passed = 0;
let failed = 0;

function ok(name) { passed++; console.log(`  PASS: ${name}`); }
function fail(name, e) { failed++; console.error(`  FAIL: ${name}`, e?.message || e); }

function makeTestRun(overrides = {}) {
  clearExecutionRunsForTest();
  const packet = createExecutionPacket({
    thread_key: overrides.thread_key || 'ch:OB_TEST:1000.1001',
    goal_line: overrides.goal || '더그린 갤러리 멤버 캘린더 구축',
    locked_scope_summary: overrides.summary || '팀 일정 관리 MVP — 반복·승인·개인블럭',
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
    playbook_id: 'PBK-test',
    task_kind: 'calendar_tool',
  });
}

/* ============================== */
/* TEST 1: GitHub draft issue attachment (no auth configured) */
/* ============================== */
try {
  const run = makeTestRun();

  // No GITHUB_* env → should produce draft
  delete process.env.GITHUB_FINE_GRAINED_PAT;
  delete process.env.GITHUB_TOKEN;
  delete process.env.GITHUB_APP_ID;

  const result = await ensureGithubIssueForRun(run, { channel: 'C_TEST' });
  assert.equal(result.mode, 'draft', 'should be draft mode without auth');
  assert.ok(result.branch_name, 'branch_name exists');

  const updatedRun = getExecutionRunById(run.run_id);
  assert.ok(updatedRun.artifacts.fullstack_swe.github_draft_payload, 'draft payload attached');
  assert.ok(updatedRun.artifacts.fullstack_swe.branch_name, 'branch_name attached');
  assert.ok(updatedRun.git_trace.branch, 'git_trace branch updated');

  const ws = updatedRun.workstreams.find((w) => w.lane_type === 'fullstack_swe');
  assert.equal(ws.outbound.outbound_status, 'drafted', 'lane outbound status = drafted');
  assert.equal(ws.outbound.outbound_provider, 'github');

  clearExecutionRunsForTest();
  ok('github draft issue attachment');
} catch (e) { fail('github draft issue attachment', e); }

/* ============================== */
/* TEST 2: Cursor handoff artifact attachment */
/* ============================== */
try {
  const run = makeTestRun();
  const result = await ensureCursorHandoffForRun(run);

  assert.equal(result.mode, 'created', 'handoff created');
  assert.ok(result.handoff_path, 'handoff_path exists');
  assert.ok(result.handoff_path.startsWith('docs/cursor-handoffs/'), 'path in correct dir');

  const updatedRun = getExecutionRunById(run.run_id);
  assert.ok(updatedRun.artifacts.fullstack_swe.cursor_handoff_path, 'cursor_handoff_path attached');
  assert.ok(updatedRun.git_trace.generated_cursor_handoff_path, 'cursor path in git_trace');
  assert.ok(updatedRun.cursor_trace.length > 0, 'cursor_trace has entries');
  assert.equal(updatedRun.cursor_trace[0].status, 'created');
  assert.equal(updatedRun.cursor_trace[0].dispatch_mode, 'auto_generated');

  // Verify file actually exists on disk
  const fullPath = path.resolve(process.cwd(), result.handoff_path);
  const content = await fs.readFile(fullPath, 'utf8');
  assert.ok(content.includes(run.run_id), 'handoff contains run_id');
  assert.ok(content.includes('Locked Scope'), 'handoff has scope section');

  // Cleanup generated file
  await fs.unlink(fullPath).catch(() => {});

  clearExecutionRunsForTest();
  ok('cursor handoff artifact attachment');
} catch (e) { fail('cursor handoff artifact attachment', e); }

/* ============================== */
/* TEST 3: Supabase draft attachment (DB work implied) */
/* ============================== */
try {
  const run = makeTestRun({
    goal: 'DB 스키마 설계 + 사용자 테이블 마이그레이션',
    includes: ['user table', 'RLS policy', 'schema migration'],
  });

  const result = await ensureSupabaseDraftForRun(run);
  assert.equal(result.mode, 'created', 'supabase draft created');
  assert.ok(result.draft_path, 'draft_path exists');

  const updatedRun = getExecutionRunById(run.run_id);
  assert.ok(updatedRun.artifacts.fullstack_swe.supabase_schema_draft_path, 'schema draft path attached');
  assert.ok(updatedRun.supabase_trace.length > 0, 'supabase_trace has entries');
  assert.equal(updatedRun.supabase_trace[0].status, 'drafted');

  // Verify file
  const fullPath = path.resolve(process.cwd(), result.draft_path);
  const content = await fs.readFile(fullPath, 'utf8');
  const parsed = JSON.parse(content);
  assert.equal(parsed.kind, 'supabase_schema_draft');
  assert.equal(parsed.run_id, run.run_id);

  await fs.unlink(fullPath).catch(() => {});

  clearExecutionRunsForTest();
  ok('supabase draft attachment (DB work implied)');
} catch (e) { fail('supabase draft attachment', e); }

/* ============================== */
/* TEST 3b: Supabase skipped when no DB work implied */
/* ============================== */
try {
  const run = makeTestRun({
    goal: '발표자료 만들기',
    includes: ['PPT 디자인', '내용 구성'],
  });

  const result = await ensureSupabaseDraftForRun(run);
  assert.equal(result.mode, 'skipped', 'no DB work → skipped');

  clearExecutionRunsForTest();
  ok('supabase skipped when no DB work');
} catch (e) { fail('supabase skipped when no DB work', e); }

/* ============================== */
/* TEST 4: Outbound failures do not collapse run ownership */
/* ============================== */
try {
  const run = makeTestRun();

  // GitHub will fail/draft (no auth) — but run must survive
  const ghResult = await ensureGithubIssueForRun(run, {});
  assert.ok(['draft', 'error'].includes(ghResult.mode), 'github gracefully fails/drafts');

  const updatedRun = getExecutionRunById(run.run_id);
  assert.ok(updatedRun, 'run still exists');
  assert.equal(updatedRun.status, 'active', 'run status still active');
  assert.equal(updatedRun.current_stage, 'execution_running', 'stage still running');

  // All lanes still present
  assert.equal(updatedRun.workstreams.length, 4, '4 lanes still present');

  clearExecutionRunsForTest();
  ok('outbound failures do not collapse run');
} catch (e) { fail('outbound failures do not collapse run', e); }

/* ============================== */
/* TEST 5: Execution reporting surface shows outbound truth */
/* ============================== */
try {
  const run = makeTestRun();

  // Dispatch all
  seedResearchArtifact(run);
  seedUiuxArtifacts(run);
  seedQaArtifacts(run);
  await ensureGithubIssueForRun(run, {});
  await ensureCursorHandoffForRun(run);

  const updatedRun = getExecutionRunById(run.run_id);
  const reportText = renderExecutionReportingPacket(updatedRun);

  // Must show real status, not generic prose
  assert.ok(reportText.includes('research_benchmark'), 'shows research lane');
  assert.ok(reportText.includes('fullstack_swe'), 'shows swe lane');
  assert.ok(reportText.includes('uiux_design'), 'shows uiux lane');
  assert.ok(reportText.includes('qa_qc'), 'shows qa lane');
  assert.ok(
    reportText.includes('drafted') || reportText.includes('dispatched'),
    'shows real outbound status'
  );

  // No council markers
  assert.ok(!reportText.includes('페르소나별'), 'no council in report');
  assert.ok(!reportText.includes('종합 추천안'), 'no council synthesis');
  assert.ok(!reportText.includes('업무등록'), 'no work registration prompt');

  // Cleanup handoff file
  const handoffPath = updatedRun.artifacts?.fullstack_swe?.cursor_handoff_path;
  if (handoffPath) await fs.unlink(path.resolve(process.cwd(), handoffPath)).catch(() => {});

  clearExecutionRunsForTest();
  ok('execution reporting shows outbound truth');
} catch (e) { fail('execution reporting shows outbound truth', e); }

/* ============================== */
/* TEST 6: git_trace gets updated progressively */
/* ============================== */
try {
  const run = makeTestRun();

  // Initial — branch from github
  await ensureGithubIssueForRun(run, {});

  let r = getExecutionRunById(run.run_id);
  assert.ok(r.git_trace.branch, 'branch set');

  // Add commits progressively
  updateRunGitTrace(run.run_id, { commit_shas: ['sha1', 'sha2'] });
  r = getExecutionRunById(run.run_id);
  assert.deepEqual(r.git_trace.commit_shas, ['sha1', 'sha2']);

  // Append more
  updateRunGitTrace(run.run_id, { commit_shas: ['sha3'] });
  r = getExecutionRunById(run.run_id);
  assert.deepEqual(r.git_trace.commit_shas, ['sha1', 'sha2', 'sha3'], 'progressive append');

  // Add PR
  updateRunGitTrace(run.run_id, { pr_id: 'PR-42' });
  r = getExecutionRunById(run.run_id);
  assert.equal(r.git_trace.pr_id, 'PR-42');

  clearExecutionRunsForTest();
  ok('git_trace progressive update');
} catch (e) { fail('git_trace progressive update', e); }

/* ============================== */
/* TEST 7: cursor_trace and supabase_trace get updated */
/* ============================== */
try {
  const run = makeTestRun({
    goal: 'DB 스키마 + 앱 구축',
    includes: ['user table', 'schema migration'],
  });

  await ensureCursorHandoffForRun(run);
  await ensureSupabaseDraftForRun(run);

  const r = getExecutionRunById(run.run_id);

  // cursor_trace
  assert.ok(r.cursor_trace.length >= 1, 'cursor_trace populated');
  assert.equal(r.cursor_trace[0].dispatch_mode, 'auto_generated');
  assert.ok(r.cursor_trace[0].handoff_path, 'handoff_path in trace');
  assert.ok(r.cursor_trace[0].created_at, 'created_at in trace');

  // supabase_trace
  assert.ok(r.supabase_trace.length >= 1, 'supabase_trace populated');
  assert.equal(r.supabase_trace[0].kind, 'schema_draft');
  assert.equal(r.supabase_trace[0].status, 'drafted');
  assert.ok(r.supabase_trace[0].draft_path, 'draft_path in trace');

  // Cleanup
  if (r.artifacts?.fullstack_swe?.cursor_handoff_path) {
    await fs.unlink(path.resolve(process.cwd(), r.artifacts.fullstack_swe.cursor_handoff_path)).catch(() => {});
  }
  if (r.artifacts?.fullstack_swe?.supabase_schema_draft_path) {
    await fs.unlink(path.resolve(process.cwd(), r.artifacts.fullstack_swe.supabase_schema_draft_path)).catch(() => {});
  }

  clearExecutionRunsForTest();
  ok('cursor_trace and supabase_trace updated');
} catch (e) { fail('cursor_trace and supabase_trace', e); }

/* ============================== */
/* TEST 8: No council exposure during outbound execution reporting */
/* ============================== */
try {
  const run = makeTestRun();
  await ensureGithubIssueForRun(run, {});
  await ensureCursorHandoffForRun(run);

  const updatedRun = getExecutionRunById(run.run_id);
  const runningText = renderExecutionRunningPacket(updatedRun);
  const reportingText = renderExecutionReportingPacket(updatedRun);
  const slackStatus = formatOutboundStatusForSlack(run.run_id);

  const allText = [runningText, reportingText, slackStatus].join('\n');

  const forbidden = [
    '페르소나별 핵심 관점', '가장 강한 반대 논리', '종합 추천안',
    '대표 결정 필요 여부', '내부 처리 정보', '업무등록', '계획등록',
  ];

  for (const term of forbidden) {
    assert.ok(!allText.includes(term), `no "${term}" in execution output`);
  }

  // Status format shows concise outbound truth
  assert.ok(slackStatus.includes('Outbound'), 'has outbound header');
  assert.ok(slackStatus.includes('fullstack_swe'), 'shows swe lane');

  // Cleanup
  if (updatedRun.artifacts?.fullstack_swe?.cursor_handoff_path) {
    await fs.unlink(path.resolve(process.cwd(), updatedRun.artifacts.fullstack_swe.cursor_handoff_path)).catch(() => {});
  }

  clearExecutionRunsForTest();
  ok('no council in outbound execution reporting');
} catch (e) { fail('no council in outbound reporting', e); }

/* ============================== */
/* BONUS: planOutboundActionsForRun + collectOutboundStatus */
/* ============================== */
try {
  const run = makeTestRun({
    goal: 'DB + 앱 구축',
    includes: ['schema migration', 'user model'],
  });

  const plan = planOutboundActionsForRun(run);
  assert.ok(plan.length >= 5, 'plan has multiple steps');
  assert.ok(plan.some((p) => p.provider === 'github'), 'plan includes github');
  assert.ok(plan.some((p) => p.provider === 'cursor'), 'plan includes cursor');
  assert.ok(plan.some((p) => p.provider === 'supabase'), 'plan includes supabase (DB implied)');

  // collectOutboundStatus before dispatch
  const statusBefore = collectOutboundStatus(run.run_id);
  assert.ok(statusBefore, 'status returned');
  assert.equal(statusBefore.lanes.length, 4, '4 lanes');
  assert.ok(statusBefore.lanes.every((l) => l.outbound_status === 'pending'), 'all pending initially');

  clearExecutionRunsForTest();
  ok('planOutbound + collectOutboundStatus');
} catch (e) { fail('planOutbound + collectOutboundStatus', e); }

/* ============================== */
/* BONUS: full dispatch pipeline */
/* ============================== */
try {
  const run = makeTestRun({
    goal: 'DB 스키마 기반 앱 개발',
    includes: ['schema migration', 'table 설계'],
  });

  const results = await dispatchOutboundActionsForRun(run, { channel: 'C_TEST' });
  assert.ok(results.github, 'github result');
  assert.ok(results.cursor, 'cursor result');
  assert.ok(results.supabase, 'supabase result');
  assert.ok(results.research, 'research result');
  assert.ok(results.uiux, 'uiux result');
  assert.ok(results.qa, 'qa result');

  const status = collectOutboundStatus(run.run_id);
  const nonPending = status.lanes.filter((l) => l.outbound_status !== 'pending');
  assert.ok(nonPending.length >= 3, 'at least 3 lanes have outbound status beyond pending');

  const updatedRun = getExecutionRunById(run.run_id);
  assert.ok(updatedRun.artifacts.research_benchmark.research_note_path, 'research artifact');
  assert.ok(updatedRun.artifacts.uiux_design.ui_spec_delta_path, 'uiux artifact');
  assert.ok(updatedRun.artifacts.qa_qc.acceptance_checklist_path, 'qa artifact');
  assert.ok(updatedRun.artifacts.fullstack_swe.cursor_handoff_path, 'cursor handoff');

  // Cleanup
  if (updatedRun.artifacts?.fullstack_swe?.cursor_handoff_path) {
    await fs.unlink(path.resolve(process.cwd(), updatedRun.artifacts.fullstack_swe.cursor_handoff_path)).catch(() => {});
  }
  if (updatedRun.artifacts?.fullstack_swe?.supabase_schema_draft_path) {
    await fs.unlink(path.resolve(process.cwd(), updatedRun.artifacts.fullstack_swe.supabase_schema_draft_path)).catch(() => {});
  }

  clearExecutionRunsForTest();
  ok('full dispatch pipeline');
} catch (e) { fail('full dispatch pipeline', e); }

/* ============================== */
/* Cleanup */
/* ============================== */
clearExecutionRunsForTest();
await fs.rm(tmp, { recursive: true, force: true });
delete process.env.COS_WORKSPACE_QUEUE_FILE;
delete process.env.EXECUTION_RUNS_FILE;
delete process.env.PLAYBOOKS_FILE;

console.log('');
console.log(`EXECUTION OUTBOUND: passed=${passed} failed=${failed}`);
if (failed > 0) process.exit(1);
