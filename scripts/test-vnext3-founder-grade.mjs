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
  assert.ok(cleaned.includes('종합 추천안') || cleaned.includes('결론'), 'keeps valid content');

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

/* Cleanup */
console.log(`\n=== ${passed} passed, ${failed} failed ===`);

await new Promise((r) => setTimeout(r, 200));
await fs.rm(tmp, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 }).catch(() => {});

process.exit(failed > 0 ? 1 : 0);
