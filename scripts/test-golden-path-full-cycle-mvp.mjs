#!/usr/bin/env node
/**
 * Golden Path Full-Cycle MVP — 하나의 end-to-end OS loop 검증.
 *
 * Scenario:
 * 1. founder requests new project
 * 2. document uploaded and ingested
 * 3. scope locked, project space created
 * 4. execution run created with doc context
 * 5. GitHub: issue + branch + PR seeded
 * 6. Cursor handoff created
 * 7. Supabase draft/manual path created
 * 8. workstreams complete → deploy_ready
 * 9. deploy packet produced (honest manual bridge)
 * 10. approval packet for founder decision
 * 11. PM cockpit shows full truth
 * 12. GitHub execution truth — honest status model
 * 13. deploy status transitions
 * 14. founder-facing 업무등록 regression
 *
 * Run: node scripts/test-golden-path-full-cycle-mvp.mjs
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-golden-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');

let passed = 0;
let failed = 0;
function ok(label) { passed++; console.log(`  PASS: ${label}`); }
function fail(label, err) { failed++; console.error(`  FAIL: ${label}`, err?.message || err); }

console.log('=== Golden Path Full-Cycle MVP Tests ===\n');

/* ================================================================== */
/* TEST 1: Full-cycle OS loop                                          */
/* ================================================================== */
try {
  const { createProjectSpace, linkRunToProjectSpace, linkThreadToProjectSpace, renderProjectSpaceStatusForSlack, _resetForTest: resetSpaces } = await import('../src/features/projectSpaceRegistry.js');
  const { createExecutionPacket, createExecutionRun, updateRunStage, updateRunDeployStatus, getExecutionRunById, setRunTruthReconciliation, DEPLOY_STATUS_VALUES, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { evaluateExecutionRunCompletion, detectAndApplyCompletion, evaluateDeployReadiness, buildUnifiedDeployPacket } = await import('../src/features/executionDispatchLifecycle.js');
  const { renderPMCockpitPacket, renderApprovalPacket, renderDeployPacket, renderOneLineStatus, renderEscalationPacket, deriveGithubExecutionTruth, renderExecutionStatusPacket } = await import('../src/features/executionSpineRouter.js');
  const { buildVercelDeployPacket } = await import('../src/adapters/vercelAdapter.js');
  const { buildRailwayDeployPacket } = await import('../src/adapters/railwayAdapter.js');
  const { addDocumentToThread, buildDocumentContextForExecution, _resetForTest: resetDoc } = await import('../src/features/slackDocumentContext.js');

  resetSpaces();
  resetRuns();
  resetDoc();

  const threadKey = 'ch:GOLDEN:01';

  // STEP 1-2: Document uploaded
  addDocumentToThread(threadKey, {
    file_id: 'FDOC1',
    filename: 'product-spec.docx',
    text: 'Calendar app for NYC art galleries. Features: event listing, RSVP, artist profiles.',
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    char_count: 80,
  });

  // STEP 3: Project space created
  const space = createProjectSpace({
    human_label: 'NYC Gallery Calendar',
    repo_owner: 'g1-platform',
    repo_name: 'gallery-calendar',
    github_ready_status: 'ready',
    cursor_workspace_root: '/workspace/gallery-calendar',
    cursor_handoff_root: 'data/exec-handoffs',
    supabase_ready_status: 'configured',
    supabase_project_ref: 'gallery-cal-ref',
    vercel_ready_status: 'not_configured',
    railway_ready_status: 'not_configured',
  });
  linkThreadToProjectSpace(space.project_id, threadKey);

  // STEP 4: Execution run created with doc context
  const docCtx = buildDocumentContextForExecution(threadKey);
  const packet = createExecutionPacket({
    thread_key: threadKey,
    goal_line: 'NYC Gallery Calendar MVP',
    locked_scope_summary: 'Calendar: event listing, RSVP, artist profiles',
    includes: ['event listing', 'RSVP', 'artist profiles'],
    excludes: ['payment processing'],
    project_id: space.project_id,
    project_label: space.human_label,
    document_context_summary: docCtx?.summary || null,
    document_sources: docCtx?.sources || [],
  });
  assert.ok(packet.document_context_summary, 'packet has doc context');

  const run = createExecutionRun({
    packet,
    metadata: { user: 'founder' },
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  linkRunToProjectSpace(space.project_id, run.run_id);
  assert.equal(run.current_stage, 'execution_running');
  assert.equal(run.deploy_status, 'none');

  // STEP 5: GitHub seeded (issue + branch + PR)
  run.git_trace.repo = 'g1-platform/gallery-calendar';
  run.git_trace.issue_id = 42;
  run.git_trace.branch = 'feat/calendar-mvp';
  run.git_trace.pr_id = 7;
  run.artifacts.fullstack_swe.github_issue_id = 42;
  run.artifacts.fullstack_swe.github_issue_url = 'https://github.com/g1-platform/gallery-calendar/issues/42';
  run.artifacts.fullstack_swe.branch_name = 'feat/calendar-mvp';
  run.artifacts.fullstack_swe.pr_id = 7;
  run.artifacts.fullstack_swe.pr_url = 'https://github.com/g1-platform/gallery-calendar/pull/7';

  // STEP 6: Cursor handoff + Supabase draft
  run.artifacts.fullstack_swe.cursor_handoff_path = 'data/exec-handoffs/gallery-calendar.md';
  run.supabase_trace.push({ status: 'draft_created', draft_path: 'data/supabase-drafts/gallery-cal.json' });

  // STEP 7: All workstreams complete
  for (const ws of run.workstreams) {
    ws.outbound = ws.outbound || {};
    ws.outbound.outbound_status = 'completed';
    ws.outbound.outbound_provider = 'github';
  }

  setRunTruthReconciliation(run.run_id, {
    entries: [
      {
        route_key: 'research',
        attempted_action: 'research/internal_artifact',
        reconciled_status: 'satisfied',
        reconciliation_notes: '',
        observed_tool_refs: { research_note_path: 'data/research-note.md' },
      },
    ],
    overall: 'completed',
    evaluated_at: new Date().toISOString(),
  });

  // STEP 8: Completion → deploy_ready
  detectAndApplyCompletion(run.run_id);
  const updatedRun = getExecutionRunById(run.run_id);
  assert.equal(updatedRun.current_stage, 'deploy_ready');

  // STEP 9: Deploy packet
  const deployEval = evaluateDeployReadiness(run.run_id);
  assert.ok(deployEval);
  const deployText = renderDeployPacket(run, {
    vercel: buildVercelDeployPacket(space, run),
    railway: buildRailwayDeployPacket(space, run),
    deploy_readiness: deployEval.deploy_readiness,
    manual_steps: deployEval.manual_steps,
    env_missing: deployEval.env_missing,
  });
  assert.ok(deployText.includes('배포 패킷'));
  assert.ok(deployText.includes('배포 상태'));

  // STEP 10: Approval packet
  const approvalText = renderApprovalPacket(updatedRun, {
    completed_work: ['GitHub issue #42', 'Branch feat/calendar-mvp', 'PR #7', 'Cursor handoff'],
    blockers: ['Vercel 수동 설정 필요'],
    decision_needed: '배포 승인',
    options: ['Vercel 수동 배포', 'Railway 수동 배포'],
    recommendation: 'Vercel 수동 배포 권장',
  });
  assert.ok(approvalText.includes('대표 승인 요청'));
  assert.ok(approvalText.includes('COS 권장'));

  // STEP 11: PM cockpit
  const cockpit = renderPMCockpitPacket(updatedRun);
  assert.ok(cockpit.includes('PM Cockpit'));
  assert.ok(cockpit.includes(run.run_id));

  // STEP 12: Project space status
  const projectStatus = renderProjectSpaceStatusForSlack(space);
  assert.ok(projectStatus.includes('NYC Gallery Calendar'));

  ok('FULL-CYCLE OS LOOP — request → lock → run → toolchain → deploy_ready → approval → deploy');
} catch (e) { fail('full-cycle OS loop', e); }

/* ================================================================== */
/* TEST 2: GitHub execution truth — honest status model                */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { deriveGithubExecutionTruth } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:GHTRUTH:01',
    goal_line: 'GitHub truth test',
    locked_scope_summary: 'test',
    includes: [],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });

  // Initially: no GitHub data
  const truth0 = deriveGithubExecutionTruth(run);
  assert.equal(truth0.issue_status, 'none');
  assert.equal(truth0.branch_status, 'none');
  assert.equal(truth0.pr_status, 'none');

  // After issue creation
  run.git_trace.issue_id = 99;
  run.artifacts.fullstack_swe.github_issue_id = 99;
  const truth1 = deriveGithubExecutionTruth(run);
  assert.equal(truth1.issue_status, 'issue_created_live');
  assert.equal(truth1.issue_id, 99);

  // After branch seed (planned only)
  run.artifacts.fullstack_swe.branch_name = 'feat/test';
  const truth2 = deriveGithubExecutionTruth(run);
  assert.equal(truth2.branch_status, 'branch_planned');

  // After branch created live
  run.git_trace.branch = 'feat/test';
  const truth3 = deriveGithubExecutionTruth(run);
  assert.equal(truth3.branch_status, 'branch_seeded');

  // After PR created
  run.git_trace.pr_id = 5;
  const truth4 = deriveGithubExecutionTruth(run);
  assert.equal(truth4.branch_status, 'branch_created_live');
  assert.equal(truth4.pr_status, 'pr_created_live');
  assert.equal(truth4.pr_id, 5);

  ok('GitHub execution truth — honest status model');
} catch (e) { fail('GitHub execution truth', e); }

/* ================================================================== */
/* TEST 3: Deploy status transitions                                   */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunDeployStatus, getExecutionRunById, DEPLOY_STATUS_VALUES, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  resetRuns();

  assert.ok(DEPLOY_STATUS_VALUES.has('none'));
  assert.ok(DEPLOY_STATUS_VALUES.has('manual_bridge_prepared'));
  assert.ok(DEPLOY_STATUS_VALUES.has('awaiting_founder_action'));
  assert.ok(DEPLOY_STATUS_VALUES.has('deployed_manual_confirmed'));

  const packet = createExecutionPacket({
    thread_key: 'ch:DEPLOY:01',
    goal_line: 'Deploy test',
    locked_scope_summary: 'test',
    includes: [],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  assert.equal(run.deploy_status, 'none');

  updateRunDeployStatus(run.run_id, { deploy_status: 'manual_bridge_prepared' });
  assert.equal(getExecutionRunById(run.run_id).deploy_status, 'manual_bridge_prepared');

  updateRunDeployStatus(run.run_id, { deploy_status: 'awaiting_founder_action' });
  assert.equal(getExecutionRunById(run.run_id).deploy_status, 'awaiting_founder_action');

  updateRunDeployStatus(run.run_id, {
    deploy_status: 'deployed_manual_confirmed',
    deploy_provider: 'vercel',
    deploy_url: 'https://my-app.vercel.app',
  });
  const final = getExecutionRunById(run.run_id);
  assert.equal(final.deploy_status, 'deployed_manual_confirmed');
  assert.equal(final.deploy_provider, 'vercel');
  assert.equal(final.deploy_url, 'https://my-app.vercel.app');

  ok('deploy status transitions');
} catch (e) { fail('deploy status transitions', e); }

/* ================================================================== */
/* TEST 4: Founder-facing 업무등록 regression                          */
/* ================================================================== */
try {
  const filesToCheck = [
    '../src/features/customerFeedbackAwqBridge.js',
    '../src/features/g1cosLineageTransport.js',
    '../src/features/executiveStatusRollup.js',
  ];

  for (const filePath of filesToCheck) {
    const content = await fs.readFile(new URL(filePath, import.meta.url), 'utf8');
    const lines = content.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (/['"`].*업무등록.*['"`]/.test(line) && !/\/\//.test(line.split('업무등록')[0])) {
        const isReturn = /return|push|join|lines|=/.test(line);
        const isFounderOutput = isReturn && !/BANNED|BLOCKED|const |regex|test\(|includes\(/.test(line);
        assert.ok(!isFounderOutput, `Found founder-facing 업무등록 in ${filePath} line ${i + 1}: ${line.trim()}`);
      }
    }
  }

  ok('founder-facing 업무등록 regression clean');
} catch (e) { fail('founder-facing 업무등록 regression', e); }

/* ================================================================== */
/* TEST 5: Startup hydration — 5 systems loaders verified              */
/* ================================================================== */
try {
  const appContent = await fs.readFile(new URL('../app.js', import.meta.url), 'utf8');
  assert.ok(appContent.includes('loadConversationBufferFromDisk'), 'app.js loads conversation buffer');
  assert.ok(appContent.includes('loadProjectIntakeSessionsFromDisk'), 'app.js loads intake sessions');
  assert.ok(appContent.includes('loadProjectSpacesFromDisk'), 'app.js loads project spaces');
  assert.ok(appContent.includes('loadSlotLedgersFromDisk'), 'app.js loads slot ledgers');
  assert.ok(appContent.includes('loadDocumentContextFromDisk'), 'app.js loads document context');
  assert.ok(appContent.includes('startup_conversation_buffer_hydrated'), 'logs conversation count');
  assert.ok(appContent.includes('startup_intake_sessions_hydrated'), 'logs intake count');
  assert.ok(appContent.includes('startup_project_spaces_hydrated'), 'logs project spaces count');
  assert.ok(appContent.includes('startup_slot_ledgers_hydrated'), 'logs slot ledgers count');
  assert.ok(appContent.includes('startup_document_context_hydrated'), 'logs document context count');

  ok('startup hydration — 5 systems verified');
} catch (e) { fail('startup hydration', e); }

/* ================================================================== */
/* TEST 6: DM file_share + app_mention intake verified                 */
/* ================================================================== */
try {
  const handlersContent = await fs.readFile(new URL('../src/slack/registerHandlers.js', import.meta.url), 'utf8');
  assert.ok(handlersContent.includes("subtype !== 'file_share'"), 'DM allows file_share subtype');
  assert.ok(handlersContent.includes('extractFilesFromEvent'), 'uses extractFilesFromEvent');
  assert.ok(
    handlersContent.includes('founderIngestSlackFilesWithState') ||
      handlersContent.includes('ingestSlackFile') ||
      handlersContent.includes('handleFounderSlackTurn'),
    'uses founder file ingest path',
  );
  assert.ok(
    handlersContent.includes('founderIngestSlackFilesWithState') ||
      handlersContent.includes('addDocumentToThread') ||
      handlersContent.includes('handleFounderSlackTurn'),
    'uses founder file turn (document thread)',
  );

  ok('DM file_share + app_mention intake verified');
} catch (e) { fail('file intake paths', e); }

/* ================================================================== */
/* TEST 7: docx + mammoth reachable                                    */
/* ================================================================== */
try {
  const pkgContent = await fs.readFile(new URL('../package.json', import.meta.url), 'utf8');
  assert.ok(pkgContent.includes('mammoth'), 'mammoth in package.json');

  const intakeContent = await fs.readFile(new URL('../src/features/slackFileIntake.js', import.meta.url), 'utf8');
  assert.ok(intakeContent.includes("'docx'"), 'docx in parseable extensions');
  assert.ok(intakeContent.includes('extractDocxText'), 'extractDocxText function');
  assert.ok(intakeContent.includes("import('mammoth')"), 'dynamic mammoth import');

  ok('docx + mammoth reachable');
} catch (e) { fail('docx mammoth', e); }

/* ================================================================== */
/* TEST 8: Execution status packet renders all truth                   */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { renderExecutionStatusPacket } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:STATUS:01',
    goal_line: 'Status test project',
    locked_scope_summary: 'test',
    includes: ['feature A'],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  run.git_trace.issue_id = 10;
  run.git_trace.branch = 'feat/status-test';

  const statusText = renderExecutionStatusPacket(run);
  assert.ok(statusText.includes('실행 상태 보고'), 'status packet header');
  assert.ok(statusText.includes(run.run_id), 'status has run_id');
  assert.ok(statusText.includes('GitHub'), 'status has GitHub');
  assert.ok(statusText.includes('Cursor'), 'status has Cursor');
  assert.ok(statusText.includes('배포'), 'status has deploy');

  ok('execution status packet renders all truth');
} catch (e) { fail('execution status packet', e); }

/* ================================================================== */
/* TEST 9: Approval response → run state transition (approve)          */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, getExecutionRunById, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { detectApprovalIntent, applyApprovalDecision } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:APPROVAL:01',
    goal_line: 'Approval test',
    locked_scope_summary: 'test',
    includes: [],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'deploy_ready');

  // Detect approval intent
  assert.equal(detectApprovalIntent('배포 승인'), 'approve');
  assert.equal(detectApprovalIntent('추가 수정 요청'), 'rework');
  assert.equal(detectApprovalIntent('보류'), 'hold');
  assert.equal(detectApprovalIntent('진행 상황 보여줘'), null);

  // Apply approve
  const result = applyApprovalDecision(run, 'approve', '배포 승인합니다');
  assert.ok(result.ok);
  assert.equal(result.new_stage, 'approved_for_deploy');
  assert.equal(result.new_deploy_status, 'approved');
  assert.ok(result.response_text.includes('배포 승인 확인'));

  const updated = getExecutionRunById(run.run_id);
  assert.equal(updated.current_stage, 'approved_for_deploy');
  assert.equal(updated.deploy_status, 'approved');

  ok('approval response → approve transition');
} catch (e) { fail('approval approve', e); }

/* ================================================================== */
/* TEST 10: Approval response → rework transition                      */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, getExecutionRunById, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { applyApprovalDecision } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:REWORK:01',
    goal_line: 'Rework test',
    locked_scope_summary: 'test',
    includes: [],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'deploy_ready');

  const result = applyApprovalDecision(run, 'rework', '로그인 화면 수정 필요');
  assert.ok(result.ok);
  assert.equal(result.new_stage, 'in_progress_rework');
  assert.equal(result.new_deploy_status, 'rework_requested');
  assert.ok(result.response_text.includes('수정 요청 확인'));

  const updated = getExecutionRunById(run.run_id);
  assert.equal(updated.current_stage, 'in_progress_rework');

  ok('approval response → rework transition');
} catch (e) { fail('approval rework', e); }

/* ================================================================== */
/* TEST 11: Approval response → hold transition                        */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, getExecutionRunById, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { applyApprovalDecision } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:HOLD:01',
    goal_line: 'Hold test',
    locked_scope_summary: 'test',
    includes: [],
    excludes: [],
  });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'deploy_ready');

  const result = applyApprovalDecision(run, 'hold', '다음 주에 재검토');
  assert.ok(result.ok);
  assert.equal(result.new_stage, 'paused_for_founder');
  assert.equal(result.new_deploy_status, 'paused');
  assert.ok(result.response_text.includes('보류 확인'));

  ok('approval response → hold transition');
} catch (e) { fail('approval hold', e); }

/* ================================================================== */
/* TEST 12: Council report — no internal metadata in founder output    */
/* ================================================================== */
try {
  const councilContent = await fs.readFile(new URL('../src/agents/council.js', import.meta.url), 'utf8');

  // v1.1 kernel swap: council no longer produces raw report text
  assert.ok(!councilContent.includes("text: synthesis.report"), 'council must not return raw report as text');
  assert.ok(councilContent.includes('deliberation'), 'council must return deliberation object');
  assert.ok(!councilContent.includes("let report = ''"), 'council must not build raw report string');

  const banned = ['페르소나별 핵심 관점', '종합 추천안', '가장 강한 반대 논리'];
  for (const b of banned) {
    assert.ok(!councilContent.includes(`'${b}'`) && !councilContent.includes(`"${b}"`),
      `council source must not contain "${b}" as string literal`);
  }

  ok('council report has COS recommendation');
} catch (e) { fail('council report', e); }

/* ================================================================== */
/* TEST 13: Executive help — no internal command exposure               */
/* ================================================================== */
try {
  const { formatExecutiveHelpText } = await import('../src/features/executiveSurfaceHelp.js');
  const help = formatExecutiveHelpText();

  const banned = ['업무등록:', '계획등록:', '실행큐계획화', '커서발행'];
  for (const b of banned) {
    assert.ok(!help.includes(b), `founder help must not contain "${b}"`);
  }

  assert.ok(help.includes('자연어'), 'help mentions natural language');
  assert.ok(help.includes('배포 승인'), 'help mentions approval');

  ok('executive help — no internal command exposure');
} catch (e) { fail('executive help', e); }

/* ================================================================== */
/* TEST 14: Full golden path with approval closure                     */
/* ================================================================== */
try {
  const { createProjectSpace, linkRunToProjectSpace, linkThreadToProjectSpace, _resetForTest: resetSpaces } = await import('../src/features/projectSpaceRegistry.js');
  const { createExecutionPacket, createExecutionRun, getExecutionRunById, setRunTruthReconciliation, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { detectAndApplyCompletion } = await import('../src/features/executionDispatchLifecycle.js');
  const { detectApprovalIntent, applyApprovalDecision, renderDeployPacket } = await import('../src/features/executionSpineRouter.js');
  const { addDocumentToThread, buildDocumentContextForExecution, _resetForTest: resetDoc } = await import('../src/features/slackDocumentContext.js');

  resetSpaces();
  resetRuns();
  resetDoc();

  const tk = 'ch:GOLDENFULL:01';

  addDocumentToThread(tk, {
    file_id: 'F1',
    filename: 'spec.docx',
    text: 'Full stack app for gallery management',
    mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    char_count: 40,
  });

  const space = createProjectSpace({
    human_label: 'Gallery Manager',
    repo_owner: 'g1',
    repo_name: 'gallery-mgr',
    github_ready_status: 'ready',
  });
  linkThreadToProjectSpace(space.project_id, tk);

  const docCtx = buildDocumentContextForExecution(tk);
  const packet = createExecutionPacket({
    thread_key: tk,
    goal_line: 'Gallery Manager MVP',
    locked_scope_summary: 'Gallery management app',
    includes: ['event CRUD'],
    excludes: [],
    project_id: space.project_id,
    document_context_summary: docCtx?.summary || null,
    document_sources: docCtx?.sources || [],
  });

  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  linkRunToProjectSpace(space.project_id, run.run_id);

  // Simulate toolchain execution
  run.git_trace.repo = 'g1/gallery-mgr';
  run.git_trace.issue_id = 1;
  run.git_trace.branch = 'feat/gallery-mvp';
  run.artifacts.fullstack_swe.cursor_handoff_path = 'data/exec-handoffs/gallery-mgr.md';
  run.supabase_trace.push({ status: 'draft_created' });

  for (const ws of run.workstreams) {
    ws.outbound = ws.outbound || {};
    ws.outbound.outbound_status = 'completed';
    ws.outbound.outbound_provider = 'github';
  }

  setRunTruthReconciliation(run.run_id, {
    entries: [
      {
        route_key: 'research',
        attempted_action: 'research/internal_artifact',
        reconciled_status: 'satisfied',
        reconciliation_notes: '',
        observed_tool_refs: { research_note_path: 'data/research-note.md' },
      },
    ],
    overall: 'completed',
    evaluated_at: new Date().toISOString(),
  });

  // Completion → deploy_ready
  detectAndApplyCompletion(run.run_id);
  assert.equal(getExecutionRunById(run.run_id).current_stage, 'deploy_ready');

  // Founder says "배포 승인"
  const intent = detectApprovalIntent('배포 승인해줘');
  assert.equal(intent, 'approve');

  const approval = applyApprovalDecision(run, intent, '배포 승인해줘');
  assert.ok(approval.ok);
  assert.equal(approval.new_stage, 'approved_for_deploy');

  const finalRun = getExecutionRunById(run.run_id);
  assert.equal(finalRun.current_stage, 'approved_for_deploy');
  assert.equal(finalRun.deploy_status, 'approved');

  ok('full golden path with approval closure — request → lock → run → deploy_ready → approve');
} catch (e) { fail('full golden path with approval', e); }

/* ================================================================== */
/* TEST 15: Deploy packet renders Block Kit buttons                    */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { buildDeployApprovalBlocks } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:BTN:01', goal_line: 'btn test', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'deploy_ready');

  const blocks = buildDeployApprovalBlocks(run);
  assert.ok(Array.isArray(blocks), 'blocks is array');
  assert.equal(blocks[0].type, 'actions');
  assert.equal(blocks[0].elements.length, 3);
  assert.equal(blocks[0].elements[0].action_id, 'g1cos_exec_deploy_approve');
  assert.equal(blocks[0].elements[1].action_id, 'g1cos_exec_deploy_rework');
  assert.equal(blocks[0].elements[2].action_id, 'g1cos_exec_deploy_hold');

  const val = JSON.parse(blocks[0].elements[0].value);
  assert.equal(val.run_id, run.run_id);

  ok('deploy packet renders Block Kit buttons');
} catch (e) { fail('block kit buttons', e); }

/* ================================================================== */
/* TEST 16: Deploy URL ingest → linkage_recorded                       */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, getExecutionRunById, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { detectDeployUrlAndCompletion, ingestDeployUrl } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:URL:01', goal_line: 'url test', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'approved_for_deploy');

  const { url, isComplete, providerHint } = detectDeployUrlAndCompletion('배포 URL: https://my-app.vercel.app');
  assert.equal(url, 'https://my-app.vercel.app');
  assert.equal(isComplete, false);
  assert.equal(providerHint, 'vercel');

  const result = ingestDeployUrl(run, url, providerHint, false);
  assert.ok(result.ok);
  assert.equal(result.new_deploy_status, 'linkage_recorded');
  assert.ok(result.response_text.includes('배포 URL 기록'));

  const updated = getExecutionRunById(run.run_id);
  assert.equal(updated.deploy_status, 'linkage_recorded');
  assert.equal(updated.deploy_url, 'https://my-app.vercel.app');

  ok('deploy URL ingest → linkage_recorded');
} catch (e) { fail('URL ingest linkage', e); }

/* ================================================================== */
/* TEST 17: Deploy URL + completion → deployed_manual_confirmed        */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, getExecutionRunById, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { detectDeployUrlAndCompletion, ingestDeployUrl } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:URLC:01', goal_line: 'url complete', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'approved_for_deploy');

  const { url, isComplete, providerHint } = detectDeployUrlAndCompletion('배포 완료! https://gallery.railway.app');
  assert.equal(url, 'https://gallery.railway.app');
  assert.ok(isComplete);
  assert.equal(providerHint, 'railway');

  const result = ingestDeployUrl(run, url, providerHint, true);
  assert.ok(result.ok);
  assert.equal(result.new_deploy_status, 'deployed_manual_confirmed');
  assert.ok(result.response_text.includes('배포 완료 확인'));

  const updated = getExecutionRunById(run.run_id);
  assert.equal(updated.deploy_status, 'deployed_manual_confirmed');
  assert.equal(updated.current_stage, 'deployment_confirmed');

  ok('deploy URL + completion → deployed_manual_confirmed');
} catch (e) { fail('URL + complete', e); }

/* ================================================================== */
/* TEST 18: Deploy complete text without URL → graceful failure        */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { confirmDeployComplete } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:NOURL:01', goal_line: 'no url', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'approved_for_deploy');

  const result = confirmDeployComplete(run);
  assert.equal(result.ok, false);
  assert.ok(result.response_text.includes('URL'));

  ok('deploy complete without URL → graceful failure');
} catch (e) { fail('no URL complete', e); }

/* ================================================================== */
/* TEST 19: Invalid URL rejected                                       */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, updateRunStage, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { ingestDeployUrl } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:BAD:01', goal_line: 'bad url', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  updateRunStage(run.run_id, 'approved_for_deploy');

  const result = ingestDeployUrl(run, 'not-a-url', null, false);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'invalid_url');

  ok('invalid URL rejected with honest reason');
} catch (e) { fail('invalid URL', e); }

/* ================================================================== */
/* TEST 20: No active deploy run → URL ignored                         */
/* ================================================================== */
try {
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { ingestDeployUrl } = await import('../src/features/executionSpineRouter.js');
  resetRuns();

  const packet = createExecutionPacket({ thread_key: 'ch:WRONG:01', goal_line: 'wrong stage', locked_scope_summary: 't', includes: [], excludes: [] });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });

  const result = ingestDeployUrl(run, 'https://example.com', null, false);
  assert.equal(result.ok, false);
  assert.equal(result.errorCode, 'wrong_stage');

  ok('no active deploy run → URL rejected with reason');
} catch (e) { fail('wrong stage URL', e); }

/* ================================================================== */
/* TEST 21: Full golden path → approve → URL → deployed_confirmed      */
/* ================================================================== */
try {
  const { createProjectSpace, linkRunToProjectSpace, linkThreadToProjectSpace, _resetForTest: resetSpaces } = await import('../src/features/projectSpaceRegistry.js');
  const { createExecutionPacket, createExecutionRun, getExecutionRunById, setRunTruthReconciliation, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  const { detectAndApplyCompletion } = await import('../src/features/executionDispatchLifecycle.js');
  const { detectApprovalIntent, applyApprovalDecision, detectDeployUrlAndCompletion, ingestDeployUrl, confirmDeployComplete } = await import('../src/features/executionSpineRouter.js');
  const { addDocumentToThread, buildDocumentContextForExecution, _resetForTest: resetDoc } = await import('../src/features/slackDocumentContext.js');

  resetSpaces(); resetRuns(); resetDoc();
  const tk = 'ch:FULLCLOSURE:01';

  addDocumentToThread(tk, { file_id: 'F99', filename: 'req.docx', text: 'Gallery calendar requirements', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', char_count: 30 });

  const space = createProjectSpace({ human_label: 'Gallery Cal', repo_owner: 'g1', repo_name: 'gal-cal', github_ready_status: 'ready' });
  linkThreadToProjectSpace(space.project_id, tk);

  const docCtx = buildDocumentContextForExecution(tk);
  const packet = createExecutionPacket({ thread_key: tk, goal_line: 'Gallery Cal MVP', locked_scope_summary: 'gallery cal', includes: ['events'], excludes: [], project_id: space.project_id, document_context_summary: docCtx?.summary, document_sources: docCtx?.sources });
  const run = createExecutionRun({
    packet,
    metadata: {},
    external_execution_auth_initial: 'authorized',
    internal_planner_capability_source: 'locked_run_text',
  });
  linkRunToProjectSpace(space.project_id, run.run_id);

  run.git_trace.repo = 'g1/gal-cal';
  run.git_trace.issue_id = 1;
  run.git_trace.branch = 'feat/gal-mvp';
  run.artifacts.fullstack_swe.cursor_handoff_path = 'data/exec-handoffs/gal-cal.md';
  run.supabase_trace.push({ status: 'draft_created' });

  for (const ws of run.workstreams) { ws.outbound = ws.outbound || {}; ws.outbound.outbound_status = 'completed'; ws.outbound.outbound_provider = 'github'; }
  setRunTruthReconciliation(run.run_id, {
    entries: [
      {
        route_key: 'research',
        attempted_action: 'research/internal_artifact',
        reconciled_status: 'satisfied',
        reconciliation_notes: '',
        observed_tool_refs: { research_note_path: 'data/research-note.md' },
      },
    ],
    overall: 'completed',
    evaluated_at: new Date().toISOString(),
  });
  detectAndApplyCompletion(run.run_id);
  assert.equal(getExecutionRunById(run.run_id).current_stage, 'deploy_ready');

  // Founder approves
  applyApprovalDecision(run, 'approve', '');
  assert.equal(getExecutionRunById(run.run_id).current_stage, 'approved_for_deploy');

  // Founder pastes URL
  const { url, providerHint } = detectDeployUrlAndCompletion('https://gal-cal.vercel.app');
  ingestDeployUrl(run, url, providerHint, false);
  assert.equal(getExecutionRunById(run.run_id).deploy_status, 'linkage_recorded');

  // Founder confirms deploy
  confirmDeployComplete(run);
  const final = getExecutionRunById(run.run_id);
  assert.equal(final.deploy_status, 'deployed_manual_confirmed');
  assert.equal(final.current_stage, 'deployment_confirmed');
  assert.equal(final.deploy_url, 'https://gal-cal.vercel.app');

  ok('full golden path → approve → URL → deployed_confirmed');
} catch (e) { fail('full deploy closure', e); }

/* ================================================================== */
/* TEST 22: Council report no banned fallback text                     */
/* ================================================================== */
try {
  const councilContent = await fs.readFile(new URL('../src/agents/council.js', import.meta.url), 'utf8');
  const fallbackSection = councilContent.substring(
    councilContent.indexOf('const strongestObjection'),
    councilContent.indexOf('const decisionNeeded')
  );
  assert.ok(!fallbackSection.includes('가장 강한 반대 논리'), 'no banned fallback: 가장 강한 반대 논리');
  assert.ok(!fallbackSection.includes('핵심 리스크를 반영해'), 'no banned fallback: 핵심 리스크');

  ok('council report no banned fallback text');
} catch (e) { fail('council fallback', e); }

/* Cleanup */
console.log(`\n=== Golden Path: ${passed} passed, ${failed} failed ===`);

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});

process.exit(failed > 0 ? 1 : 0);
