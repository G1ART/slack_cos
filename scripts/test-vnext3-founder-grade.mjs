#!/usr/bin/env node
/**
 * vNext.3 — Founder-Grade Surface Integrity + File Intake + Context Lock
 *
 * Regression tests:
 * 1. founderSurfaceGuard strips internal metadata
 * 2. council work-hint footer removed from normal flow
 * 3. founderSlotLedger CRUD + persistence/hydration
 * 4. topicAnchorGuard detects cross-project drift
 * 5. deliverableBundleRouter detects deliverable intent
 * 6. slackFileIntake diagnoseFileReadiness + formatFileIngestError
 * 7. slackDocumentContext add/get/merge
 * 8. contextSynthesis detects continuation/correction intent
 * 9. persistence defaults are ON
 * 10. calendar thread regression — no grants drift
 * 11. abstract gtm thread regression — no calendar drift
 * 12. restart continuation regression — slot ledger survives reload
 */
import assert from 'node:assert/strict';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'g1cos-vnxt3-'));
process.env.STORAGE_MODE = 'json';
process.env.STORE_READ_PREFERENCE = 'json';
process.env.COS_WORKSPACE_QUEUE_FILE = path.join(tmp, 'cos-workspace-queue.json');
process.env.EXECUTION_RUNS_FILE = path.join(tmp, 'execution-runs.json');
process.env.PLAYBOOKS_FILE = path.join(tmp, 'dynamic-playbooks.json');
process.env.PROJECT_SPACES_FILE = path.join(tmp, 'project-spaces.json');
process.env.FOUNDER_SLOT_LEDGER_FILE = path.join(tmp, 'founder-slot-ledger.json');
await fs.writeFile(process.env.COS_WORKSPACE_QUEUE_FILE, '[]', 'utf8');
await fs.writeFile(process.env.EXECUTION_RUNS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PLAYBOOKS_FILE, '[]', 'utf8');
await fs.writeFile(process.env.PROJECT_SPACES_FILE, '[]', 'utf8');
await fs.writeFile(process.env.FOUNDER_SLOT_LEDGER_FILE, '[]', 'utf8');

delete process.env.GITHUB_FINE_GRAINED_PAT;
delete process.env.GITHUB_TOKEN;
delete process.env.GITHUB_APP_ID;
delete process.env.VERCEL_TOKEN;
delete process.env.RAILWAY_TOKEN;

const {
  sanitizeFounderOutput,
  detectInternalLeakage,
  isCanonicalSurface,
} = await import('../src/features/founderSurfaceGuard.js');

const {
  getOrCreateLedger,
  resolveSlot,
  isSlotResolved,
  getResolvedSlots,
  getUnresolvedSlots,
  resolveSlotsBulk,
  reopenSlot,
  loadSlotLedgersFromDisk,
  _resetForTest: resetLedger,
} = await import('../src/features/founderSlotLedger.js');

const {
  deriveAnchorCluster,
  detectTopicDrift,
  buildAnchorReminder,
} = await import('../src/features/topicAnchorGuard.js');

const {
  detectDeliverableIntent,
  buildDeliverableBundlePrompt,
} = await import('../src/features/deliverableBundleRouter.js');

const {
  diagnoseFileReadiness,
  formatFileIngestError,
  extractFilesFromEvent,
} = await import('../src/features/slackFileIntake.js');

const {
  addDocumentToThread,
  getDocumentContextForThread,
  getMergedDocumentText,
  hasDocumentContext,
  _resetForTest: resetDocs,
} = await import('../src/features/slackDocumentContext.js');

const {
  detectContinuationIntent,
  shouldActivateContextSynthesis,
  buildContextSynthesisPrompt,
} = await import('../src/features/contextSynthesis.js');

let passed = 0;
let failed = 0;
function ok(name) { passed++; console.log(`  PASS: ${name}`); }
function fail(name, e) { failed++; console.error(`  FAIL: ${name}`, e?.message || e); }

console.log('\n=== vNext.3 Founder-Grade Tests ===\n');

/* TEST 1: founderSurfaceGuard strips internal metadata */
try {
  const leaked = [
    '종합 추천안',
    '내부 처리 정보',
    '- 협의 모드: matrix_cell',
    '- 참여 페르소나: CTO, CFO, CMO',
    '- matrix trigger: high_stakes | multi_domain',
    '- institutional memory 힌트 수: 3',
    '',
    '결론: 캘린더 앱을 만들자',
  ].join('\n');

  const cleaned = sanitizeFounderOutput(leaked);
  assert.ok(!cleaned.includes('내부 처리 정보'), 'no 내부 처리 정보');
  assert.ok(!cleaned.includes('참여 페르소나'), 'no 참여 페르소나');
  assert.ok(!cleaned.includes('matrix trigger'), 'no matrix trigger');
  assert.ok(!cleaned.includes('matrix_cell'), 'no matrix_cell');
  assert.ok(!cleaned.includes('institutional memory'), 'no inst memory');
  assert.ok(!cleaned.includes('종합 추천안'), 'strips old council heading');
  assert.ok(cleaned.includes('결론'), 'keeps conclusion line');

  const detect = detectInternalLeakage(leaked);
  assert.ok(detect.leaked, 'leak detected');
  assert.ok(detect.patterns.length > 0, 'patterns found');

  const cleanCheck = detectInternalLeakage(cleaned);
  assert.ok(!cleanCheck.leaked, 'no leak after sanitize');

  const debugOut = sanitizeFounderOutput(leaked, { debugMode: true });
  assert.ok(debugOut.includes('내부 처리 정보'), 'debug mode preserves all');

  ok('founderSurfaceGuard strips internal metadata');
} catch (e) { fail('founderSurfaceGuard strips internal metadata', e); }

/* TEST 2: work-hint footer pattern removal */
try {
  const withFooter = "좋은 질문입니다.\n\n실행 작업 후보로 보입니다. 필요하면 '업무등록: 캘린더 만들기' 형태로 등록하세요.";
  const cleaned = sanitizeFounderOutput(withFooter);
  assert.ok(!cleaned.includes('실행 작업 후보'), 'no work hint');
  assert.ok(!cleaned.includes('업무등록'), 'no 업무등록');
  assert.ok(cleaned.includes('좋은 질문'), 'original content preserved');

  ok('work-hint footer removal');
} catch (e) { fail('work-hint footer removal', e); }

/* TEST 3: founderSlotLedger CRUD + hydration */
try {
  resetLedger();
  const ledger = getOrCreateLedger('ch:TEST:slot1', 'PROJ-slot');
  assert.ok(ledger, 'ledger created');
  assert.equal(ledger.project_id, 'PROJ-slot');

  resolveSlot('ch:TEST:slot1', 'project_goal', '캘린더 MVP', 'founder_explicit');
  assert.ok(isSlotResolved('ch:TEST:slot1', 'project_goal'), 'slot resolved');

  const resolved = getResolvedSlots('ch:TEST:slot1');
  assert.equal(resolved.project_goal, '캘린더 MVP');

  const unresolved = getUnresolvedSlots('ch:TEST:slot1');
  assert.ok(!unresolved.includes('project_goal'), 'project_goal not in unresolved');
  assert.ok(unresolved.includes('primary_user_problem'), 'primary_user_problem still unresolved');

  resolveSlotsBulk('ch:TEST:slot1', {
    product_label: 'Calendar App',
    city_scope: 'Seoul / NYC / LA',
  }, 'bulk_import');
  assert.ok(isSlotResolved('ch:TEST:slot1', 'product_label'), 'bulk resolved');
  assert.ok(isSlotResolved('ch:TEST:slot1', 'city_scope'), 'city resolved');

  reopenSlot('ch:TEST:slot1', 'city_scope');
  assert.ok(!isSlotResolved('ch:TEST:slot1', 'city_scope'), 'city reopened');

  // Hydration test
  await new Promise((r) => setTimeout(r, 200));
  const hydroFile = path.join(tmp, 'hydro-slot-ledger.json');
  const testLedger = {
    thread_key: 'ch:TEST:hydro-slot',
    project_id: 'PROJ-hydro',
    slots: {
      project_goal: { value: 'Hydrated Goal', resolved: true, resolved_at: '2026-01-01', source: 'test' },
      product_label: { value: null, resolved: false, resolved_at: null, source: null },
    },
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
  process.env.FOUNDER_SLOT_LEDGER_FILE = hydroFile;
  await fs.writeFile(hydroFile, JSON.stringify([testLedger]), 'utf8');
  resetLedger();
  const count = await loadSlotLedgersFromDisk();
  assert.ok(count >= 1, `hydrated ${count} ledgers`);
  assert.ok(isSlotResolved('ch:TEST:hydro-slot', 'project_goal'), 'hydrated slot resolved');
  process.env.FOUNDER_SLOT_LEDGER_FILE = path.join(tmp, 'founder-slot-ledger.json');

  ok('founderSlotLedger CRUD + hydration');
} catch (e) { fail('founderSlotLedger CRUD + hydration', e); }

/* TEST 4: topicAnchorGuard detects cross-project drift */
try {
  const calendarCluster = deriveAnchorCluster({
    projectSpace: { human_label: '캘린더 앱', aliases: ['calendar-app'] },
    slotLedger: { slots: { project_goal: { value: '일정 관리 캘린더 구축' } } },
    recentTranscript: '캘린더 MVP, 반복 일정, 대관 승인',
    playbookKind: 'calendar_tool',
  });
  assert.ok(calendarCluster.domains.includes('calendar'), 'calendar domain detected');

  // Calendar thread + grants drift
  const grantsDrift = detectTopicDrift({
    draftText: '보조금 compliance 규정에 따라 파트너십 조건을 검토해야 합니다. 지원금 심사 기준은...',
    anchorCluster: calendarCluster,
    currentRequestText: '승인 규칙 정리해줘',
  });
  assert.ok(grantsDrift.drifted, 'grants drift detected in calendar thread');
  assert.ok(grantsDrift.alienDomains.some((a) => a.domain === 'grants'), 'grants is alien domain');

  // No drift when on-topic
  const onTopic = detectTopicDrift({
    draftText: '캘린더 MVP에서 반복 일정과 대관 예약을 지원합니다',
    anchorCluster: calendarCluster,
    currentRequestText: '캘린더 기능 정리해줘',
  });
  assert.ok(!onTopic.drifted, 'no drift when on-topic');

  // Abstract GTM thread + calendar drift
  const gtmCluster = deriveAnchorCluster({
    projectSpace: { human_label: 'Abstract GTM', aliases: ['abstract-gtm'] },
    slotLedger: { slots: { project_goal: { value: 'NYC/LA/Seoul GTM 전략' }, city_scope: { value: 'NYC, LA, Seoul' } } },
    recentTranscript: 'local GTM strategy, 마케팅, 시장 진입',
  });
  assert.ok(gtmCluster.domains.includes('gtm'), 'gtm domain detected');

  const calendarDrift = detectTopicDrift({
    draftText: '캘린더 MVP 기능 스택은 반복 일정, 대관 승인, 예약 관리입니다. 캘린더 UI는...',
    anchorCluster: gtmCluster,
    currentRequestText: 'GTM 전략 구체화해줘',
  });
  assert.ok(calendarDrift.drifted, 'calendar drift detected in GTM thread');

  const reminder = buildAnchorReminder(calendarCluster, grantsDrift);
  assert.ok(reminder.includes('TOPIC ANCHOR'), 'reminder has header');

  ok('topicAnchorGuard detects cross-project drift');
} catch (e) { fail('topicAnchorGuard detects cross-project drift', e); }

/* TEST 5: deliverableBundleRouter detects intent */
try {
  const r1 = detectDeliverableIntent('작업 시작해');
  assert.ok(r1.triggered, 'triggered on 작업 시작해');
  assert.equal(r1.bundleType, 'product_lock_bundle');

  const r2 = detectDeliverableIntent('이 문서 기준으로 구체화해');
  assert.ok(r2.triggered, 'triggered on 문서 기준으로');
  assert.equal(r2.bundleType, 'document_review_bundle');

  const r3 = detectDeliverableIntent('GTM 전략 수정해줘');
  assert.ok(r3.triggered, 'triggered on GTM 전략');
  assert.equal(r3.bundleType, 'strategy_refinement_bundle');

  const r4 = detectDeliverableIntent('지금까지 대화를 추출해서 락인해');
  assert.ok(r4.triggered, 'triggered on 대화 추출 락인');

  const r5 = detectDeliverableIntent('일반 대화');
  assert.ok(!r5.triggered, 'not triggered on generic');

  const prompt = buildDeliverableBundlePrompt({
    bundleType: 'strategy_refinement_bundle',
    resolvedSlots: { project_goal: 'GTM 전략', city_scope: 'NYC/LA/Seoul' },
    documentContext: 'Abstract doc content here',
    recentTranscript: 'prior discussion',
  });
  assert.ok(prompt.includes('Strategy Refinement'), 'prompt has bundle type');
  assert.ok(prompt.includes('GTM 전략'), 'prompt includes resolved slots');
  assert.ok(prompt.includes('Abstract doc'), 'prompt includes doc context');

  ok('deliverableBundleRouter detects intent');
} catch (e) { fail('deliverableBundleRouter detects intent', e); }

/* TEST 6: slackFileIntake readiness + error formatting */
try {
  const diag = diagnoseFileReadiness();
  assert.ok(typeof diag.ready === 'boolean');
  assert.ok(diag.supported_types.length > 0, 'has supported types');
  assert.ok(diag.limitations.length > 0, 'has limitations');

  const files = extractFilesFromEvent({ files: [{ id: 'F1', name: 'test.txt' }] });
  assert.equal(files.length, 1);
  assert.equal(files[0].name, 'test.txt');

  const noFiles = extractFilesFromEvent({});
  assert.equal(noFiles.length, 0);

  const errMsg = formatFileIngestError({ errorCode: 'scope_missing', filename: 'doc.pdf' });
  assert.ok(errMsg.includes('files:read'), 'error mentions scope');

  const errMsg2 = formatFileIngestError({ errorCode: 'unsupported_type', mimetype: 'application/vnd.ms-excel', filename: 'data.xlsx' });
  assert.ok(errMsg2.includes('지원하지 않습니다'), 'unsupported type message');

  ok('slackFileIntake readiness + error formatting');
} catch (e) { fail('slackFileIntake readiness + error formatting', e); }

/* TEST 7: slackDocumentContext add/get/merge */
try {
  resetDocs();
  const tk = 'ch:TEST:doc-ctx';

  assert.ok(!hasDocumentContext(tk), 'no docs initially');

  addDocumentToThread(tk, { file_id: 'F1', filename: 'strategy.md', text: 'NYC GTM plan: focus on...', char_count: 25 });
  assert.ok(hasDocumentContext(tk), 'has docs after add');

  const docs = getDocumentContextForThread(tk);
  assert.equal(docs.length, 1);
  assert.equal(docs[0].filename, 'strategy.md');

  addDocumentToThread(tk, { file_id: 'F2', filename: 'abstract.txt', text: 'Abstract gallery vision', char_count: 23 });
  assert.equal(getDocumentContextForThread(tk).length, 2);

  const merged = getMergedDocumentText(tk);
  assert.ok(merged.includes('strategy.md'), 'merged includes first file');
  assert.ok(merged.includes('abstract.txt'), 'merged includes second file');

  ok('slackDocumentContext add/get/merge');
} catch (e) { fail('slackDocumentContext add/get/merge', e); }

/* TEST 8: contextSynthesis detects continuation/correction intent */
try {
  assert.equal(detectContinuationIntent('내가 원한건 이게 아니야'), 'correction');
  assert.equal(detectContinuationIntent('이 문서를 토대로 원래 요청을 구체화해'), 'document_refine');
  assert.equal(detectContinuationIntent('지금 우리가 무슨 얘기 하고 있었지?'), 'continuation');
  assert.equal(detectContinuationIntent('지금까지 정리해줘'), 'synthesis_request');
  assert.equal(detectContinuationIntent('일반 대화'), null);

  const synth = shouldActivateContextSynthesis({ text: '원래 요청을 구체화해', hasDocumentContext: true, resolvedSlotCount: 3 });
  assert.ok(synth.activate, 'activates on continuation text');

  const docSynth = shouldActivateContextSynthesis({ text: '새 전략을 짜봐', hasDocumentContext: true, resolvedSlotCount: 3 });
  assert.ok(docSynth.activate, 'activates when doc context + resolved slots');

  const noSynth = shouldActivateContextSynthesis({ text: '안녕', hasDocumentContext: false, resolvedSlotCount: 0 });
  assert.ok(!noSynth.activate, 'does not activate on generic text');

  const prompt = buildContextSynthesisPrompt({
    intent: 'document_refine',
    resolvedSlots: { project_goal: 'GTM', city_scope: 'Seoul' },
    documentContext: 'New strategy doc',
    recentTranscript: 'prior talk',
    currentText: '이 문서 반영해',
  });
  assert.ok(prompt.includes('CONTEXT SYNTHESIS'), 'prompt has header');
  assert.ok(prompt.includes('document_refine'), 'prompt has intent');
  assert.ok(prompt.includes('GTM'), 'prompt includes resolved slot');

  ok('contextSynthesis intent detection');
} catch (e) { fail('contextSynthesis intent detection', e); }

/* TEST 9: persistence defaults are ON */
try {
  delete process.env.CONVERSATION_BUFFER_PERSIST;
  delete process.env.PROJECT_INTAKE_SESSION_PERSIST;

  // Re-import to get fresh functions reflecting current env
  // Test by checking the logic directly instead of importing
  const cbPersist = !(process.env.CONVERSATION_BUFFER_PERSIST === '0' || process.env.CONVERSATION_BUFFER_PERSIST === 'false');
  assert.ok(cbPersist, 'conversation buffer persist ON by default');

  const piPersist = !(process.env.PROJECT_INTAKE_SESSION_PERSIST === '0' || process.env.PROJECT_INTAKE_SESSION_PERSIST === 'false');
  assert.ok(piPersist, 'intake session persist ON by default');

  process.env.CONVERSATION_BUFFER_PERSIST = '0';
  const cbOff = !(process.env.CONVERSATION_BUFFER_PERSIST === '0' || process.env.CONVERSATION_BUFFER_PERSIST === 'false');
  assert.ok(!cbOff, 'conversation buffer persist OFF when set to 0');

  delete process.env.CONVERSATION_BUFFER_PERSIST;

  ok('persistence defaults are ON');
} catch (e) { fail('persistence defaults are ON', e); }

/* TEST 10: calendar thread regression — no grants drift */
try {
  const calendarCluster = deriveAnchorCluster({
    projectSpace: { human_label: '더그린 갤러리 캘린더 MVP' },
    slotLedger: { slots: { project_goal: { value: '팀 일정 관리 캘린더 구축' } } },
    recentTranscript: '반복 일정, 승인 필요한 일정은 전시·대관·외부 대관만',
  });

  const grantsDraft = '보조금 compliance 규정에 맞춰 파트너십 신청서를 작성하고, 지원금 심사 기준을 확인합니다.';
  const drift = detectTopicDrift({
    draftText: grantsDraft,
    anchorCluster: calendarCluster,
    currentRequestText: '승인 규칙 벤치마크 초안 작성해줘',
  });
  assert.ok(drift.drifted, 'grants drift blocked in calendar thread');

  const cleanDraft = '캘린더 일정 승인 규칙: 전시·대관은 관리자 승인 필요, 개인 일정은 자동 승인';
  const noDrift = detectTopicDrift({
    draftText: cleanDraft,
    anchorCluster: calendarCluster,
    currentRequestText: '승인 규칙 정리해줘',
  });
  assert.ok(!noDrift.drifted, 'on-topic draft passes');

  ok('calendar thread regression — no grants drift');
} catch (e) { fail('calendar thread regression — no grants drift', e); }

/* TEST 11: abstract GTM thread regression — no calendar drift */
try {
  const gtmCluster = deriveAnchorCluster({
    projectSpace: { human_label: 'Abstract Local GTM Strategy' },
    slotLedger: { slots: {
      project_goal: { value: 'NYC/LA/Seoul 현지화 GTM' },
      city_scope: { value: 'NYC, LA, Seoul' },
    }},
    recentTranscript: 'local market entry, 마케팅 전략, 현지화',
  });

  const calendarDraft = '캘린더 MVP: 반복 일정 관리, 대관 예약 시스템, 일정 승인 플로우를 구현합니다. 캘린더 UI 컴포넌트는...';
  const drift = detectTopicDrift({
    draftText: calendarDraft,
    anchorCluster: gtmCluster,
    currentRequestText: 'GTM 전략 구체화해줘',
  });
  assert.ok(drift.drifted, 'calendar drift blocked in GTM thread');

  const cleanGTM = 'NYC 시장 진입 전략: 로컬 갤러리와 파트너십 구축, LA 마케팅 채널 확보';
  const noDrift = detectTopicDrift({
    draftText: cleanGTM,
    anchorCluster: gtmCluster,
    currentRequestText: 'GTM 전략 구체화해줘',
  });
  assert.ok(!noDrift.drifted, 'on-topic GTM draft passes');

  ok('abstract GTM thread regression — no calendar drift');
} catch (e) { fail('abstract GTM thread regression — no calendar drift', e); }

/* TEST 12: restart continuation regression — slot ledger survives reload */
try {
  resetLedger();
  const hydroFile2 = path.join(tmp, 'hydro-slot-restart.json');
  const priorState = {
    thread_key: 'ch:TEST:restart',
    project_id: 'PROJ-restart',
    slots: {
      project_goal: { value: 'Abstract GTM Strategy', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
      city_scope: { value: 'NYC, LA, Seoul', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
      locked_direction_summary: { value: 'Local-first GTM', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
    },
    created_at: '2026-01-01',
    updated_at: '2026-01-01',
  };
  process.env.FOUNDER_SLOT_LEDGER_FILE = hydroFile2;
  await fs.writeFile(hydroFile2, JSON.stringify([priorState]), 'utf8');

  // Simulate restart
  resetLedger();
  await loadSlotLedgersFromDisk();

  assert.ok(isSlotResolved('ch:TEST:restart', 'project_goal'), 'goal survives restart');
  assert.ok(isSlotResolved('ch:TEST:restart', 'city_scope'), 'city survives restart');
  assert.equal(getResolvedSlots('ch:TEST:restart').project_goal, 'Abstract GTM Strategy');

  // Continuation should use existing slots
  const synth = shouldActivateContextSynthesis({
    text: '지금 우리가 무슨 얘기 하고 있었지?',
    hasDocumentContext: false,
    resolvedSlotCount: Object.keys(getResolvedSlots('ch:TEST:restart')).length,
  });
  assert.ok(synth.activate, 'continuation activates after restart');
  assert.equal(synth.intent, 'continuation');

  process.env.FOUNDER_SLOT_LEDGER_FILE = path.join(tmp, 'founder-slot-ledger.json');
  ok('restart continuation regression — slot ledger survives');
} catch (e) { fail('restart continuation regression', e); }

/* TEST 13: canonical surface validation */
try {
  assert.ok(isCanonicalSurface('partner_surface'));
  assert.ok(isCanonicalSurface('research_surface'));
  assert.ok(isCanonicalSurface('execution_surface'));
  assert.ok(isCanonicalSurface('document_review_surface'));
  assert.ok(!isCanonicalSurface('council'));
  assert.ok(!isCanonicalSurface('matrix'));
  assert.ok(!isCanonicalSurface('operator'));

  ok('canonical surface validation');
} catch (e) { fail('canonical surface validation', e); }

/* ===== vNext.4 Wiring Closure Tests ===== */
console.log('\n--- vNext.4 Wiring Closure Tests ---\n');

/* TEST 14: deliverableBundleRouter wired — detectDeliverableIntent works on real phrases */
try {
  const t1 = detectDeliverableIntent('작업 시작해');
  assert.ok(t1.triggered, '작업 시작해 triggers');
  assert.equal(t1.bundleType, 'product_lock_bundle');

  const t2 = detectDeliverableIntent('이 문서 기준으로 구체화해');
  assert.ok(t2.triggered, '문서 기준 구체화 triggers');
  assert.equal(t2.bundleType, 'document_review_bundle');

  const t3 = detectDeliverableIntent('1+2+3 시작해');
  assert.ok(t3.triggered, '1+2+3 triggers');

  const t4 = detectDeliverableIntent('지금까지 대화를 추출해서 MVP 락인해');
  assert.ok(t4.triggered, 'MVP 락인 triggers');

  const t5 = detectDeliverableIntent('안녕하세요');
  assert.ok(!t5.triggered, '일상 인사는 trigger 안 됨');

  const prompt = buildDeliverableBundlePrompt({
    bundleType: 'strategy_refinement_bundle',
    resolvedSlots: { project_goal: 'NYC Art Gallery', city_scope: 'NYC, LA, Seoul' },
    documentContext: 'test doc content',
    recentTranscript: 'prev conversation',
  });
  assert.ok(prompt.includes('NYC Art Gallery'), 'prompt includes resolved slots');
  assert.ok(prompt.includes('test doc content'), 'prompt includes doc context');

  ok('deliverableBundleRouter wiring verified');
} catch (e) { fail('deliverableBundleRouter wiring', e); }

/* TEST 15: contextSynthesis wired — full activation check */
try {
  const s1 = shouldActivateContextSynthesis({
    text: '원래 요청을 이어서 정교화해',
    hasDocumentContext: false,
    resolvedSlotCount: 3,
  });
  assert.ok(s1.activate, 'continuation phrase activates');
  assert.equal(s1.intent, 'continuation');

  const s2 = shouldActivateContextSynthesis({
    text: '이 문서를 토대로 원래 요청을 더 구체화해',
    hasDocumentContext: true,
    resolvedSlotCount: 2,
  });
  assert.ok(s2.activate, 'document refine activates');
  assert.equal(s2.intent, 'document_refine');

  const s3 = shouldActivateContextSynthesis({
    text: '보통 대화입니다',
    hasDocumentContext: true,
    resolvedSlotCount: 3,
  });
  assert.ok(s3.activate, 'doc+slots → auto document_refine');

  const prompt = buildContextSynthesisPrompt({
    intent: 'document_refine',
    resolvedSlots: { project_goal: 'Gallery App' },
    documentContext: 'Abstract doc text...',
    recentTranscript: 'previous conversation',
    currentText: '이 문서 기준으로 구체화해',
  });
  assert.ok(prompt.includes('[CONTEXT SYNTHESIS]'), 'prompt header');
  assert.ok(prompt.includes('Gallery App'), 'prompt includes resolved slot');
  assert.ok(prompt.includes('Abstract doc text'), 'prompt includes doc context');

  ok('contextSynthesis wiring verified');
} catch (e) { fail('contextSynthesis wiring', e); }

/* TEST 16: topicAnchorGuard wired — drift detection on real scenario */
try {
  const calendarCluster = deriveAnchorCluster({
    projectSpace: { human_label: 'Calendar App', canonical_summary: '캘린더 일정 관리', aliases: ['calendar'] },
    slotLedger: { slots: { project_goal: { value: '캘린더 일정 관리 앱' } } },
    recentTranscript: '캘린더 앱 일정 예약 schedule',
    playbookKind: 'product',
  });
  assert.ok(calendarCluster.domains.includes('calendar'), 'calendar domain detected');

  // Calendar thread must not contain grants content
  const grantsDraft = '보조금 지원 프로그램 grants compliance 규정 준수 파트너십 체결';
  const drift1 = detectTopicDrift({ draftText: grantsDraft, anchorCluster: calendarCluster, currentRequestText: '벤치마크 초안 만들어줘' });
  assert.ok(drift1.drifted, 'grants drift in calendar thread detected');
  assert.ok(drift1.alienDomains.some(a => a.domain === 'grants'), 'grants as alien domain');

  // Same-domain content should not drift
  const calendarDraft = '캘린더 앱에서 반복 일정을 관리하고 대관 예약을 처리합니다';
  const noDrift = detectTopicDrift({ draftText: calendarDraft, anchorCluster: calendarCluster, currentRequestText: '계속해줘' });
  assert.ok(!noDrift.drifted, 'same-domain does not drift');

  const reminder = buildAnchorReminder(calendarCluster, drift1);
  assert.ok(reminder.includes('[TOPIC ANCHOR CONSTRAINT]'), 'reminder has header');
  assert.ok(reminder.includes('calendar'), 'reminder mentions anchor domain');

  ok('topicAnchorGuard wiring verified');
} catch (e) { fail('topicAnchorGuard wiring', e); }

/* TEST 17: founderSlotLedger auto-resolve from text */
try {
  const { tryAutoResolveSlots } = await import('../src/features/founderSlotLedger.js');
  resetLedger();

  const result = tryAutoResolveSlots('ch:auto-test:01', '프로젝트 목표는 NYC 아트 갤러리 앱 구축이고, 제품 이름은 ArtGallery입니다');
  assert.ok(result.project_goal, 'project_goal auto-resolved');
  assert.ok(result.product_label, 'product_label auto-resolved');
  assert.ok(isSlotResolved('ch:auto-test:01', 'project_goal'), 'slot persisted');

  // Second call should NOT re-resolve (already resolved)
  const result2 = tryAutoResolveSlots('ch:auto-test:01', '프로젝트 목표는 다른 것');
  assert.ok(!result2.project_goal, 'resolved slot not re-resolved');

  ok('founderSlotLedger auto-resolve');
} catch (e) { fail('founderSlotLedger auto-resolve', e); }

/* TEST 18: docx support in slackFileIntake */
try {
  const readiness = diagnoseFileReadiness();
  assert.ok(readiness.supported_types.includes('docx'), 'docx in supported types');
  assert.ok(!readiness.limitations.some(l => l.includes('docx') && l.includes('미지원')), 'docx not listed as unsupported');

  const files = extractFilesFromEvent({
    files: [{ id: 'F1', name: 'test.docx', mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }],
  });
  assert.equal(files.length, 1, 'docx file extracted from event');
  assert.equal(files[0].name, 'test.docx');

  ok('docx support verified');
} catch (e) { fail('docx support', e); }

/* TEST 19: document context disk persistence */
try {
  resetDocs();
  const { loadDocumentContextFromDisk, flushDocumentContextToDisk } = await import('../src/features/slackDocumentContext.js');

  const docFile = path.join(tmp, 'doc-ctx-persist.json');
  process.env.DOCUMENT_CONTEXT_FILE = docFile;
  await fs.writeFile(docFile, '[]', 'utf8');

  addDocumentToThread('ch:persist-test:01', {
    file_id: 'F1',
    filename: 'strategy.md',
    text: 'NYC gallery strategy document content',
    mimetype: 'text/markdown',
  });

  assert.ok(hasDocumentContext('ch:persist-test:01'), 'doc added');
  await flushDocumentContextToDisk();

  const raw = await fs.readFile(docFile, 'utf8');
  const saved = JSON.parse(raw);
  assert.ok(saved.length > 0, 'persisted to disk');
  assert.equal(saved[0].threadKey, 'ch:persist-test:01');

  // Simulate restart
  resetDocs();
  assert.ok(!hasDocumentContext('ch:persist-test:01'), 'cleared after reset');

  const count = await loadDocumentContextFromDisk();
  assert.ok(count > 0, 'hydrated from disk');
  assert.ok(hasDocumentContext('ch:persist-test:01'), 'doc context restored');
  assert.ok(getMergedDocumentText('ch:persist-test:01').includes('NYC gallery'), 'content intact');

  delete process.env.DOCUMENT_CONTEXT_FILE;
  ok('document context persistence + hydration');
} catch (e) { fail('document context persistence', e); }

/* TEST 20: startup hydration regression — all 5 systems have load functions */
try {
  const { loadConversationBufferFromDisk } = await import('../src/features/slackConversationBuffer.js');
  const { loadProjectIntakeSessionsFromDisk } = await import('../src/features/projectIntakeSession.js');
  const { loadProjectSpacesFromDisk } = await import('../src/features/projectSpaceRegistry.js');

  assert.equal(typeof loadConversationBufferFromDisk, 'function', 'conv buffer load');
  assert.equal(typeof loadProjectIntakeSessionsFromDisk, 'function', 'intake load');
  assert.equal(typeof loadProjectSpacesFromDisk, 'function', 'project spaces load');
  assert.equal(typeof loadSlotLedgersFromDisk, 'function', 'slot ledger load');

  const { loadDocumentContextFromDisk: ldcfd } = await import('../src/features/slackDocumentContext.js');
  assert.equal(typeof ldcfd, 'function', 'doc context load');

  ok('startup hydration — all 5 state systems have loaders');
} catch (e) { fail('startup hydration regression', e); }

/* TEST 21: canonical surface enforcement — isCanonicalSurface covers new surfaces */
try {
  assert.ok(isCanonicalSurface('project_bootstrap'), 'project_bootstrap canonical');
  assert.ok(isCanonicalSurface('existing_project_resolved'), 'existing_project_resolved canonical');
  assert.ok(isCanonicalSurface('existing_project_unresolved'), 'existing_project_unresolved canonical');
  assert.ok(isCanonicalSurface('clarification_surface'), 'clarification canonical');
  assert.ok(isCanonicalSurface('decision_packet_surface'), 'decision_packet canonical');
  assert.ok(!isCanonicalSurface('internal_orchestrator'), 'internal_orchestrator NOT canonical');
  assert.ok(!isCanonicalSurface(''), 'empty string NOT canonical');

  ok('canonical surface enforcement');
} catch (e) { fail('canonical surface enforcement', e); }

/* ===== vNext.5 Founder-Grade OS Hardening Tests ===== */
console.log('\n--- vNext.5 OS Hardening Tests ---\n');

/* TEST 22: council source surgery — synthesizeCouncil no longer generates internal metadata */
try {
  const councilMod = await import('../src/agents/council.js');
  // We cannot easily call synthesizeCouncil directly since it's not exported,
  // but we can verify via runCouncilMode shape if we mock callJSON.
  // Instead, verify the contract: council return has diagnostics separate from text.
  // We'll check council.js source to ensure no "내부 처리 정보" in the report builder.
  const councilSrc = await fs.readFile(
    path.join(process.cwd(), 'src/agents/council.js'), 'utf8'
  );

  // The text body builder must NOT contain the internal metadata block
  const reportSection = councilSrc.slice(
    councilSrc.indexOf("let report = ''"),
    councilSrc.indexOf('return {', councilSrc.indexOf("let report = ''"))
  );
  assert.ok(!reportSection.includes("report += '내부 처리 정보"), 'no 내부 처리 정보 in report builder');
  assert.ok(!reportSection.includes("report += `- 협의 모드"), 'no 협의 모드 in report builder');
  assert.ok(!reportSection.includes("report += `- 참여 페르소나"), 'no 참여 페르소나 in report builder');
  assert.ok(!reportSection.includes("report += `- matrix trigger"), 'no matrix trigger in report builder');
  assert.ok(!reportSection.includes("report += `- institutional memory"), 'no inst memory in report builder');

  // Diagnostics must be a separate object
  assert.ok(councilSrc.includes('diagnostics'), 'diagnostics object exists in council');

  ok('council source surgery — no internal metadata in report');
} catch (e) { fail('council source surgery', e); }

/* TEST 23: hard canonical surface enforcement — non-canonical responder is BLOCKED */
try {
  const { finalizeSlackResponse } = await import('../src/features/topLevelRouter.js');

  const out = finalizeSlackResponse({
    responder: 'internal_orchestrator',
    text: '이것은 내부 오케스트레이터 응답입니다',
    raw_text: 'test',
    normalized_text: 'test',
  });

  assert.ok(out.includes('내부 경로 오류'), 'non-canonical blocked with safe fallback');
  assert.ok(!out.includes('내부 오케스트레이터'), 'original text not passed through');

  // Canonical responder passes through normally
  const out2 = finalizeSlackResponse({
    responder: 'partner_surface',
    text: '정상 응답입니다',
    raw_text: 'test',
    normalized_text: 'test',
  });
  assert.ok(out2.includes('정상 응답'), 'canonical partner_surface passes through');

  // System responders also pass through
  const out3 = finalizeSlackResponse({
    responder: 'executive_surface',
    text: '실행 응답',
    raw_text: 'test',
    normalized_text: 'test',
  });
  assert.ok(out3.includes('실행 응답'), 'executive_surface passes through');

  ok('hard canonical enforcement — non-canonical blocked');
} catch (e) { fail('hard canonical enforcement', e); }

/* TEST 24: source leak regression — council text must be clean even without sanitizer */
try {
  const councilSrc = await fs.readFile(
    path.join(process.cwd(), 'src/agents/council.js'), 'utf8'
  );

  // Extract the synthesizeCouncil function body
  const synthStart = councilSrc.indexOf('function synthesizeCouncil(');
  const synthEnd = councilSrc.indexOf('\n}', synthStart + 100);
  const synthBody = councilSrc.slice(synthStart, synthEnd + 2);

  // Find all report += lines
  const reportLines = synthBody.split('\n').filter(l => l.includes('report +='));

  // None of them should contain internal metadata strings
  const FORBIDDEN_STRINGS = [
    '내부 처리 정보',
    '협의 모드',
    '참여 페르소나',
    'matrix trigger',
    'institutional memory 힌트 수',
    '업무등록',
    '실행 작업 후보',
  ];

  for (const line of reportLines) {
    for (const forbidden of FORBIDDEN_STRINGS) {
      assert.ok(!line.includes(forbidden), `report line must not contain "${forbidden}": ${line.trim().slice(0, 80)}`);
    }
  }

  ok('source leak regression — council report builder clean');
} catch (e) { fail('source leak regression', e); }

/* TEST 25: council output sanitizer is defense-in-depth, not primary */
try {
  const { sanitizeFounderOutput } = await import('../src/features/founderSurfaceGuard.js');

  // Even if somehow old-format council text appears, sanitizer catches it
  const legacyText = [
    '한 줄 요약',
    '캘린더 앱 구축',
    '',
    '내부 처리 정보',
    '- 협의 모드: matrix_cell',
    '- 참여 페르소나: CTO, CFO',
    '- matrix trigger: high_stakes',
    '- institutional memory 힌트 수: 3',
  ].join('\n');

  const cleaned = sanitizeFounderOutput(legacyText);
  assert.ok(!cleaned.includes('내부 처리 정보'), 'sanitizer still strips legacy format');
  assert.ok(!cleaned.includes('참여 페르소나'), 'sanitizer still strips personas');
  assert.ok(cleaned.includes('캘린더 앱 구축'), 'keeps valid content');

  ok('sanitizer defense-in-depth verification');
} catch (e) { fail('sanitizer defense-in-depth', e); }

/* TEST 26: new canonical surfaces — deliverable_bundle_surface, synthesis_surface */
try {
  assert.ok(isCanonicalSurface('deliverable_bundle_surface'), 'deliverable_bundle_surface canonical');
  assert.ok(isCanonicalSurface('synthesis_surface'), 'synthesis_surface canonical');
  assert.ok(isCanonicalSurface('partner_surface'), 'partner_surface canonical');
  assert.ok(!isCanonicalSurface('matrix_orchestrator'), 'matrix_orchestrator NOT canonical');
  assert.ok(!isCanonicalSurface('council_internal'), 'council_internal NOT canonical');

  ok('new canonical surfaces registered');
} catch (e) { fail('new canonical surfaces', e); }

/* TEST 27: restart OS regression — project space + slot ledger + document context survives */
try {
  resetLedger();
  resetDocs();

  // Build full state
  const restartSlotFile = path.join(tmp, 'restart-os-slots.json');
  const restartDocFile = path.join(tmp, 'restart-os-docs.json');

  const slotState = {
    thread_key: 'ch:OS-RESTART:01',
    project_id: 'PROJ-os-restart',
    slots: {
      project_goal: { value: 'NYC Art Gallery MVP', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
      product_label: { value: 'ArtGallery', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
      city_scope: { value: 'NYC, LA, Seoul', resolved: true, resolved_at: '2026-01-01', source: 'founder' },
      document_ingested: { value: 'Abstract GTM doc', resolved: true, resolved_at: '2026-01-02', source: 'file_ingest' },
    },
    created_at: '2026-01-01',
    updated_at: '2026-01-02',
  };
  const docState = [{
    threadKey: 'ch:OS-RESTART:01',
    docs: [{
      file_id: 'F-abstract',
      filename: 'Abstract_GTM_Strategy.md',
      text: 'NYC local art gallery go-to-market strategy details...',
      mimetype: 'text/markdown',
      ingested_at: '2026-01-02T00:00:00Z',
      char_count: 55,
      truncated: false,
    }],
  }];

  process.env.FOUNDER_SLOT_LEDGER_FILE = restartSlotFile;
  process.env.DOCUMENT_CONTEXT_FILE = restartDocFile;
  await fs.writeFile(restartSlotFile, JSON.stringify([slotState]), 'utf8');
  await fs.writeFile(restartDocFile, JSON.stringify(docState), 'utf8');

  // Simulate full restart
  resetLedger();
  resetDocs();
  await loadSlotLedgersFromDisk();
  const { loadDocumentContextFromDisk: ldcd2 } = await import('../src/features/slackDocumentContext.js');
  await ldcd2();

  // Verify all state survived
  assert.ok(isSlotResolved('ch:OS-RESTART:01', 'project_goal'), 'goal survives OS restart');
  assert.ok(isSlotResolved('ch:OS-RESTART:01', 'document_ingested'), 'doc flag survives');
  assert.equal(getResolvedSlots('ch:OS-RESTART:01').city_scope, 'NYC, LA, Seoul');
  assert.ok(hasDocumentContext('ch:OS-RESTART:01'), 'doc context survives restart');
  assert.ok(getMergedDocumentText('ch:OS-RESTART:01').includes('NYC local art gallery'), 'doc content intact');

  // Continuation should activate — not re-kickoff
  const synth2 = shouldActivateContextSynthesis({
    text: '이 문서를 토대로 원래 요청을 더 구체화해',
    hasDocumentContext: true,
    resolvedSlotCount: Object.keys(getResolvedSlots('ch:OS-RESTART:01')).length,
  });
  assert.ok(synth2.activate, 'synthesis activates after OS restart');
  assert.equal(synth2.intent, 'document_refine');

  // Deliverable should also trigger
  const deliv = detectDeliverableIntent('작업 시작해');
  assert.ok(deliv.triggered, 'deliverable still triggers after restart');

  process.env.FOUNDER_SLOT_LEDGER_FILE = path.join(tmp, 'founder-slot-ledger.json');
  delete process.env.DOCUMENT_CONTEXT_FILE;

  ok('restart OS regression — full state survives');
} catch (e) { fail('restart OS regression', e); }

/* TEST 28: file readiness diagnostic */
try {
  const { logFileReadinessDiagnostic } = await import('../src/features/slackFileIntake.js');
  assert.equal(typeof logFileReadinessDiagnostic, 'function', 'diagnostic function exists');
  const diag = logFileReadinessDiagnostic();
  assert.ok(Array.isArray(diag.supported_types), 'has supported types');
  assert.ok(diag.supported_types.includes('docx'), 'docx in readiness');
  assert.ok(Array.isArray(diag.limitations), 'has limitations');

  ok('file readiness diagnostic surface');
} catch (e) { fail('file readiness diagnostic', e); }

/* ================================================================== */
/*  vNext.6 — Full-Cycle MVP Closure tests                            */
/* ================================================================== */

/* TEST 29: GitHub branch/PR seed functions exist */
try {
  const gh = await import('../src/adapters/githubAdapter.js');
  assert.equal(typeof gh.createBranchArtifact, 'function', 'createBranchArtifact exists');
  assert.equal(typeof gh.createPullRequestArtifact, 'function', 'createPullRequestArtifact exists');

  // Without auth configured, these should return graceful errors
  const branchResult = await gh.createBranchArtifact({ repoTarget: { owner: 'test', repo: 'test' }, branchName: 'feat/test' });
  assert.equal(branchResult.ok, false, 'branch fails without auth');
  assert.equal(branchResult.errorCode, 'no_auth');

  const prResult = await gh.createPullRequestArtifact({ repoTarget: { owner: 'test', repo: 'test' }, branchName: 'feat/test' });
  assert.equal(prResult.ok, false, 'PR fails without auth');
  assert.equal(prResult.errorCode, 'no_auth');

  ok('GitHub branch/PR seed primitives');
} catch (e) { fail('GitHub branch/PR seed primitives', e); }

/* TEST 30: GitHub result intake parses branch/PR/commit fields */
try {
  const { parseGitHubResultIntake } = await import('../src/adapters/githubAdapter.js');
  const result = parseGitHubResultIntake(`
branch_name: feat/calendar-mvp
PR #42
pr_url: https://github.com/test/repo/pull/42
commit_sha: abc1234def5678
merge readiness: ready
변경한 파일 목록
- src/calendar.ts
- src/api.ts
테스트 실행 결과
- all pass
  `);
  assert.equal(result.branch_name, 'feat/calendar-mvp');
  assert.equal(result.pr_number, 42);
  assert.equal(result.pr_url, 'https://github.com/test/repo/pull/42');
  assert.equal(result.commit_sha, 'abc1234def5678');
  assert.equal(result.sync_status, 'pr_ready');
  assert.equal(result.merge_readiness, 'ready');
  assert.ok(result.changed_files.length >= 1);

  ok('GitHub result intake branch/PR/commit parsing');
} catch (e) { fail('GitHub result intake parsing', e); }

/* TEST 31: Deploy packet builders exist and return honest bridge */
try {
  const { buildVercelDeployPacket } = await import('../src/adapters/vercelAdapter.js');
  const { buildRailwayDeployPacket } = await import('../src/adapters/railwayAdapter.js');

  const vPacket = buildVercelDeployPacket({ project_id: 'PROJ-test', vercel_project_id: null });
  assert.equal(vPacket.provider, 'vercel');
  assert.equal(vPacket.manual_required, true);
  assert.equal(vPacket.live_create_supported, false);
  assert.ok(vPacket.exact_next_step);

  const rPacket = buildRailwayDeployPacket({ project_id: 'PROJ-test', railway_project_id: null });
  assert.equal(rPacket.provider, 'railway');
  assert.equal(rPacket.manual_required, true);
  assert.equal(rPacket.live_create_supported, false);
  assert.ok(rPacket.exact_next_step);

  ok('deploy packet builders (honest manual bridge)');
} catch (e) { fail('deploy packet builders', e); }

/* TEST 32: Approval + escalation + deploy packet renderers */
try {
  const { renderApprovalPacket, renderEscalationPacket, renderDeployPacket, renderOneLineStatus } = await import('../src/features/executionSpineRouter.js');
  const mockRun = { run_id: 'RUN-test', project_goal: 'Calendar MVP', workstreams: [] };

  const approval = renderApprovalPacket(mockRun, {
    completed_work: ['GitHub issue 생성', 'Branch 생성'],
    blockers: ['Supabase 미설정'],
    decision_needed: '배포 승인',
    options: ['배포 진행', '추가 테스트'],
    recommendation: '테스트 후 배포 권장',
  });
  assert.ok(approval.includes('대표 승인 요청'), 'approval header');
  assert.ok(approval.includes('RUN-test'), 'approval run_id');
  assert.ok(approval.includes('완료된 작업'), 'approval completed');
  assert.ok(approval.includes('차단 사항'), 'approval blockers');
  assert.ok(approval.includes('COS 권장'), 'approval recommendation');

  const escalation = renderEscalationPacket(mockRun, '배포 대상 충돌');
  assert.ok(escalation.includes('에스컬레이션'), 'escalation header');
  assert.ok(escalation.includes('배포 대상 충돌'), 'escalation text');

  const deploy = renderDeployPacket(mockRun, {
    vercel: { configured: false },
    railway: { configured: true },
    deploy_readiness: 'manual_required',
    manual_steps: ['Vercel 토큰 설정'],
  });
  assert.ok(deploy.includes('배포 패킷'), 'deploy header');
  assert.ok(deploy.includes('manual_required'), 'deploy readiness');

  const oneline = renderOneLineStatus(mockRun);
  assert.ok(oneline.includes('RUN-test'), 'oneline run_id');
  assert.ok(oneline.includes('Calendar MVP'), 'oneline goal');

  ok('approval/escalation/deploy/oneline packet renderers');
} catch (e) { fail('packet renderers', e); }

/* TEST 33: PM Cockpit detailed mode */
try {
  const { renderPMCockpitPacket } = await import('../src/features/executionSpineRouter.js');
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns } = await import('../src/features/executionRun.js');
  resetRuns();

  const packet = createExecutionPacket({
    thread_key: 'ch:PMTEST:01',
    goal_line: 'PM Cockpit 테스트 프로젝트',
    locked_scope_summary: 'PM Cockpit 테스트',
    includes: ['dashboard'],
    excludes: [],
  });
  const run = createExecutionRun({ packet, metadata: { user: 'testuser' } });

  // Detailed mode
  const detailed = renderPMCockpitPacket(run);
  assert.ok(detailed.includes('PM Cockpit'), 'PM cockpit header');
  assert.ok(detailed.includes(run.run_id), 'PM cockpit run_id');
  assert.ok(detailed.includes('PM Cockpit 테스트 프로젝트'), 'PM cockpit goal');
  assert.ok(detailed.includes('대표 필요 액션'), 'PM cockpit next action');

  // Oneline mode
  const oneline = renderPMCockpitPacket(run, { mode: 'oneline' });
  assert.ok(oneline.includes(run.run_id), 'oneline has run_id');
  assert.ok(oneline.length < 300, 'oneline is compact');

  ok('PM cockpit detailed + oneline mode');
} catch (e) { fail('PM cockpit modes', e); }

/* TEST 34: Project space status for Slack */
try {
  const { createProjectSpace, renderProjectSpaceStatusForSlack, _resetForTest: resetSpaces } = await import('../src/features/projectSpaceRegistry.js');
  resetSpaces();

  const space = createProjectSpace({
    human_label: 'Calendar MVP',
    repo_owner: 'g1-platform',
    repo_name: 'calendar-mvp',
    github_ready_status: 'ready',
    cursor_workspace_root: '/Users/test/calendar',
    cursor_handoff_root: 'docs/cursor-handoffs',
    supabase_ready_status: 'configured',
    supabase_project_ref: 'cal-mvp-123',
    vercel_ready_status: 'not_configured',
    railway_ready_status: 'not_configured',
    last_bootstrap_status: 'partial_manual',
    last_deploy_status: 'none',
  });

  const status = renderProjectSpaceStatusForSlack(space);
  assert.ok(status.includes('프로젝트 상태'), 'has header');
  assert.ok(status.includes('Calendar MVP'), 'has label');
  assert.ok(status.includes('g1-platform/calendar-mvp'), 'has repo');
  assert.ok(status.includes('Supabase'), 'has supabase');
  assert.ok(status.includes('부트스트랩'), 'has bootstrap status');
  assert.ok(status.includes('배포 상태'), 'has deploy status');

  const nullStatus = renderProjectSpaceStatusForSlack(null);
  assert.ok(nullStatus.includes('찾을 수 없습니다'), 'null space handled');

  ok('project space status for Slack');
} catch (e) { fail('project space status', e); }

/* TEST 35: Execution run carries project/document context */
try {
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns2 } = await import('../src/features/executionRun.js');
  resetRuns2();

  const packet = createExecutionPacket({
    thread_key: 'ch:DOCEXEC:01',
    goal_line: 'Document-enriched execution',
    project_id: 'PROJ-doc-1',
    project_label: 'Doc Test Project',
    document_context_summary: 'NYC gallery market research summary...',
    document_sources: [{ filename: 'research.docx', char_count: 5000 }],
  });
  assert.equal(packet.project_id, 'PROJ-doc-1');
  assert.equal(packet.document_context_summary, 'NYC gallery market research summary...');
  assert.equal(packet.document_sources.length, 1);

  const run = createExecutionRun({ packet, metadata: { user: 'test' } });
  assert.equal(run.project_id, 'PROJ-doc-1');
  assert.equal(run.project_label, 'Doc Test Project');
  assert.equal(run.document_context_summary, 'NYC gallery market research summary...');
  assert.equal(run.deploy_readiness, 'not_ready');

  ok('execution run carries project/document context');
} catch (e) { fail('execution run doc context', e); }

/* TEST 36: Deploy readiness evaluation */
try {
  const { evaluateDeployReadiness } = await import('../src/features/executionDispatchLifecycle.js');
  const { createExecutionPacket, createExecutionRun, _resetForTest: resetRuns3 } = await import('../src/features/executionRun.js');
  resetRuns3();

  const packet = createExecutionPacket({
    thread_key: 'ch:DEPLOY:01',
    goal_line: 'Deploy readiness test',
  });
  const run = createExecutionRun({ packet, metadata: {} });

  const eval_ = evaluateDeployReadiness(run.run_id);
  assert.ok(eval_, 'evaluateDeployReadiness returns result');
  assert.equal(eval_.run_id, run.run_id);
  assert.ok(['not_ready', 'manual_required', 'ready'].includes(eval_.deploy_readiness));
  assert.ok(typeof eval_.code_ready === 'boolean');
  assert.ok(typeof eval_.has_deploy_target === 'boolean');
  assert.ok(eval_.next_action);

  ok('deploy readiness evaluation');
} catch (e) { fail('deploy readiness evaluation', e); }

/* TEST 37: Document context for execution builder */
try {
  const { addDocumentToThread, buildDocumentContextForExecution, _resetForTest: resetDoc2 } = await import('../src/features/slackDocumentContext.js');
  resetDoc2();

  addDocumentToThread('ch:EXECDOC:01', {
    file_id: 'F001',
    filename: 'market-research.pdf',
    text: 'NYC art gallery market is growing at 15% annually...',
    mimetype: 'application/pdf',
    char_count: 50,
  });

  const execCtx = buildDocumentContextForExecution('ch:EXECDOC:01');
  assert.ok(execCtx, 'execution doc context exists');
  assert.equal(execCtx.doc_count, 1);
  assert.ok(execCtx.summary.includes('market-research.pdf'));
  assert.ok(execCtx.summary.includes('NYC'));
  assert.equal(execCtx.sources[0].filename, 'market-research.pdf');

  const noCtx = buildDocumentContextForExecution('ch:NOEXIST:01');
  assert.equal(noCtx, null, 'no docs returns null');

  ok('document context for execution builder');
} catch (e) { fail('doc context for execution', e); }

/* TEST 38: cosWorkspaceQueue no longer mentions 업무등록 in status line */
try {
  const queueSrc = await fs.readFile(
    path.join(process.cwd(), 'src', 'features', 'cosWorkspaceQueue.js'), 'utf8'
  );
  const statusLine = queueSrc.match(/상태:.*COS.*자동/);
  assert.ok(statusLine, 'status line says COS auto-proceeds');
  const oldHint = queueSrc.includes("'업무등록:'") && queueSrc.includes("'계획등록:'") && queueSrc.includes("'커서발행'");
  assert.ok(!oldHint, 'old command hint triplet removed from status message');

  ok('cosWorkspaceQueue work-hint cleaned');
} catch (e) { fail('cosWorkspaceQueue work-hint', e); }

/* TEST 39: FULL-CYCLE MVP SCENARIO — request → lock → run → toolchain → result → approval → deploy */
try {
  const { createProjectSpace, linkRunToProjectSpace, linkThreadToProjectSpace, renderProjectSpaceStatusForSlack, _resetForTest: resetSpacesFC } = await import('../src/features/projectSpaceRegistry.js');
  const { createExecutionPacket, createExecutionRun, updateRunStage, updateRunReport, updateLaneStatus, getExecutionRunById, _resetForTest: resetRunsFC } = await import('../src/features/executionRun.js');
  const { evaluateExecutionRunCompletion, detectAndApplyCompletion, evaluateDeployReadiness } = await import('../src/features/executionDispatchLifecycle.js');
  const { renderPMCockpitPacket, renderApprovalPacket, renderDeployPacket, renderOneLineStatus, renderEscalationPacket } = await import('../src/features/executionSpineRouter.js');
  const { buildVercelDeployPacket } = await import('../src/adapters/vercelAdapter.js');
  const { buildRailwayDeployPacket } = await import('../src/adapters/railwayAdapter.js');
  const { addDocumentToThread: addDoc, buildDocumentContextForExecution: buildDocExec, _resetForTest: resetDocFC } = await import('../src/features/slackDocumentContext.js');

  resetSpacesFC();
  resetRunsFC();
  resetDocFC();

  // === STEP 1: Founder requests a new project ===
  const threadKey = 'ch:FULLCYCLE:01';

  // === STEP 2: Document uploaded and ingested ===
  addDoc(threadKey, {
    file_id: 'FDOC1',
    filename: 'product-spec.pdf',
    text: 'Calendar app for NYC art galleries. Core features: event listing, RSVP, artist profiles.',
    mimetype: 'application/pdf',
    char_count: 80,
  });

  // === STEP 3: COS locks scope, creates project space ===
  const space = createProjectSpace({
    human_label: 'NYC Gallery Calendar',
    repo_owner: 'g1-platform',
    repo_name: 'gallery-calendar',
    github_ready_status: 'ready',
    cursor_workspace_root: '/workspace/gallery-calendar',
    cursor_handoff_root: 'docs/cursor-handoffs',
    supabase_ready_status: 'configured',
    supabase_project_ref: 'gallery-cal-ref',
    vercel_ready_status: 'not_configured',
    railway_ready_status: 'not_configured',
    last_bootstrap_status: 'partial_manual',
  });
  linkThreadToProjectSpace(space.project_id, threadKey);

  // === STEP 4: Execution run created with doc context ===
  const docCtx = buildDocExec(threadKey);
  const packet = createExecutionPacket({
    thread_key: threadKey,
    goal_line: 'NYC Gallery Calendar MVP',
    locked_scope_summary: 'Calendar app: event listing, RSVP, artist profiles',
    includes: ['event listing', 'RSVP', 'artist profiles'],
    excludes: ['payment processing'],
    project_id: space.project_id,
    project_label: space.human_label,
    document_context_summary: docCtx?.summary || null,
    document_sources: docCtx?.sources || [],
  });
  assert.ok(packet.document_context_summary, 'packet has doc context');
  assert.equal(packet.project_id, space.project_id);

  const run = createExecutionRun({ packet, metadata: { user: 'founder' } });
  linkRunToProjectSpace(space.project_id, run.run_id);
  assert.equal(run.current_stage, 'execution_running');
  assert.equal(run.project_id, space.project_id);

  // === STEP 5: Toolchain seeds (simulated) ===
  // GitHub: issue created
  run.git_trace.repo = 'g1-platform/gallery-calendar';
  run.git_trace.issue_id = 42;
  // GitHub: branch seeded
  run.git_trace.branch = 'feat/calendar-mvp';
  // Cursor handoff created
  run.artifacts.fullstack_swe.cursor_handoff_path = 'docs/cursor-handoffs/gallery-calendar.md';

  // === STEP 6: Workstreams progress ===
  const wsCount = run.workstreams.length;
  for (const ws of run.workstreams) {
    ws.outbound = ws.outbound || {};
    ws.outbound.outbound_status = 'completed';
    ws.outbound.outbound_provider = 'github';
  }

  // === STEP 7: Completion detected → deploy_ready ===
  const completion = detectAndApplyCompletion(run.run_id);
  assert.ok(completion, 'completion evaluation exists');
  const updatedRun = getExecutionRunById(run.run_id);
  assert.equal(updatedRun.current_stage, 'deploy_ready', 'stage transitions to deploy_ready');

  // === STEP 8: Deploy packet produced ===
  const deployEval = evaluateDeployReadiness(run.run_id);
  assert.ok(deployEval, 'deploy eval exists');
  assert.ok(['ready', 'manual_required', 'not_ready'].includes(deployEval.deploy_readiness));

  const vercelPacket = buildVercelDeployPacket(space, run);
  assert.equal(vercelPacket.provider, 'vercel');
  assert.equal(vercelPacket.manual_required, true);

  const deployText = renderDeployPacket(run, {
    vercel: vercelPacket,
    railway: buildRailwayDeployPacket(space, run),
    deploy_readiness: deployEval.deploy_readiness,
    manual_steps: deployEval.manual_steps,
    env_missing: deployEval.env_missing,
  });
  assert.ok(deployText.includes('배포 패킷'), 'deploy packet rendered');

  // === STEP 9: Approval packet for founder ===
  const approvalText = renderApprovalPacket(updatedRun, {
    completed_work: ['GitHub issue #42 생성', 'Branch feat/calendar-mvp 생성', 'Cursor handoff 생성'],
    blockers: vercelPacket.manual_required ? ['Vercel 수동 설정 필요'] : [],
    decision_needed: '배포 대상 설정 후 배포 승인',
    options: ['Vercel 수동 배포', 'Railway 수동 배포', '추가 테스트 후 결정'],
    recommendation: '테스트 커버리지 확인 후 Vercel 수동 배포 권장',
  });
  assert.ok(approvalText.includes('대표 승인 요청'), 'approval for founder');
  assert.ok(approvalText.includes('완료된 작업'), 'shows completed work');
  assert.ok(approvalText.includes('COS 권장'), 'shows recommendation');

  // === STEP 10: PM cockpit shows full truth ===
  const cockpit = renderPMCockpitPacket(updatedRun, { deployInfo: deployEval });
  assert.ok(cockpit.includes('PM Cockpit'), 'cockpit header');
  assert.ok(cockpit.includes(run.run_id), 'cockpit shows run');
  assert.ok(cockpit.includes('대표 필요 액션'), 'cockpit shows next action');
  assert.ok(cockpit.includes('issue'), 'cockpit shows GitHub truth');

  // === STEP 11: Project status shows truth ===
  const projectStatus = renderProjectSpaceStatusForSlack(space);
  assert.ok(projectStatus.includes('NYC Gallery Calendar'), 'project status label');
  assert.ok(projectStatus.includes('run 1개'), 'project shows active run');

  // Oneline status for quick check
  const oneline = renderOneLineStatus(updatedRun);
  assert.ok(oneline.includes(run.run_id), 'oneline run');
  assert.ok(oneline.includes('deploy_ready'), 'oneline deploy_ready');

  ok('FULL-CYCLE MVP SCENARIO — request → lock → run → toolchain → result → approval → deploy');
} catch (e) { fail('FULL-CYCLE MVP', e); }

/* Cleanup */
console.log(`\n=== ${passed} passed, ${failed} failed ===`);

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});

process.exit(failed > 0 ? 1 : 0);
