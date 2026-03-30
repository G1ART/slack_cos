# COS vNext — Execution Closure Finalization + Project Space Registry Bootstrap

**Date**: 2026-03-29  
**Patch**: vNext Closure + Project Space  
**npm test**: ALL PASS (34+ scripts, 0 failed)

---

## 1. 검증 결과 (Reality Check)

| 항목 | 결과 |
|---|---|
| Verify A: runInboundAiRouter.js playbook promotion | ✅ createExecutionRun → linkPlaybookToExecution → ensureExecutionRunDispatched |
| Verify B: startProjectLockConfirmed.js | ✅ createExecutionRun → ensureExecutionRunDispatched |
| Verify C: projectSpecSession.js | ✅ canonical lifecycle 사용, old path 없음 |
| Verify D: codebase-wide dispatch | ✅ 모든 경로 ensureExecutionRunDispatched 기반 |
| resolveApproval() gap | ⚠️ createExecutionRun 호출하지만 현재 미사용. run 반환에 포함시킴 |

---

## 2. 구조적으로 닫힌 것

### A. Execution Closure Finalization
- **PM Cockpit**: `renderExecutionReportingPacket` 대폭 강화
  - overall_status, lane dependency 상태, provider별 truth (GitHub/Cursor/Supabase)
  - blocked reason, next unblock action, retry 가능 여부
  - project_id 표시
- **PM Intent Routing**: 6개 intent 감지
  - progress, retry, manual_status, blocked_status, completion_check, (null=일반)
  - "뭐가 막혔어", "다 끝났어?", "어떤 lane이 기다리는 중이야" 등 natural utterance 지원
- **Completion Wiring**: `detectAndApplyCompletion()` → progress 응답에 실제 반영
- **scanPendingCursorResults**: no-op → 실제 구현 (data/cursor-results/ 스캔 + ingest)

### B. Provider Operationalization
- **Supabase path bug 수정**: step 3이 `cursor-results` → `supabase-results`로 정정
- **Cursor scan**: `scanPendingCursorResults()` 실구현, 매 execution spine turn에서 호출
- **GitHub truth**: `diagnoseGithubConfig()` 결과가 PM cockpit에 직접 노출

### C. Project Space Registry (NEW)
- `src/features/projectSpaceRegistry.js`: CRUD + search + thread/run linking
- `src/features/projectSpaceResolver.js`: 5단계 우선순위 resolve
- `src/features/projectSpaceBootstrap.js`: bootstrap plan + draft-first orchestrator

### D. Provider Adapters (NEW)
- `src/adapters/vercelAdapter.js`: readiness diagnose + draft bootstrap
- `src/adapters/railwayAdapter.js`: readiness diagnose + draft bootstrap
- 둘 다 live create API 미구현 → `manual_required` + instructions 생성

### E. Routing Integration
- `runInboundAiRouter.js`: project space resolve + bootstrap 감지
  - "새 프로젝트 만들자" → bootstrap plan 응답
  - playbook promotion → resolved project_id 연결
- `startProjectLockConfirmed.js`: scope lock 시 자동 project space 생성/resolve
- `projectSpecSession.js`: spec build 완료 시 자동 project space 생성/resolve

---

## 3. 아직 Live가 아닌 것 / Manual Required

| 항목 | 상태 | 비고 |
|---|---|---|
| GitHub repo create | manual_required | issue create는 live, repo bootstrap은 미구현 |
| Vercel project create | draft_only | VERCEL_TOKEN 설정 시 link 가능, live create 미구현 |
| Railway project create | draft_only | RAILWAY_TOKEN 설정 시 link 가능, live create 미구현 |
| Cursor cloud webhook | manual | file-drop scan으로 대체 |
| Supabase CLI auto-apply | manual_apply | `buildSupabaseManualApplyInstructions()` 안내 제공 |

---

## 4. Project Space Registry 사용법

```javascript
import { createProjectSpace, linkRunToProjectSpace } from './src/features/projectSpaceRegistry.js';
import { resolveProjectSpaceForThread } from './src/features/projectSpaceResolver.js';
import { bootstrapProjectSpace } from './src/features/projectSpaceBootstrap.js';

// 새 프로젝트
const { space, plan } = bootstrapProjectSpace({ label: 'My App', threadKey: 'ch:C123:ts456' });

// 기존 프로젝트 resolve
const result = resolveProjectSpaceForThread({ threadKey: 'ch:C123:ts456' });
if (result.resolved) console.log(result.project_id);

// run 연결
linkRunToProjectSpace(space.project_id, 'RUN-abc123');
```

---

## 5. 테스트 시나리오 (대표가 바로 해볼 수 있는 것)

1. **execution 시작 + progress 질의**: 프로젝트 시작 → "지금 어디까지 됐어?" → PM cockpit truth surface 확인
2. **Cursor 결과 file-drop**: `data/cursor-results/{runId}.json` 생성 → progress 질의 시 ingestion 반영
3. **새 프로젝트 bootstrap**: "새 앱 만들자" → project space + bootstrap plan 응답
4. **기존 프로젝트 후속 피드백**: 같은 스레드에서 "이 프로젝트에 기능 추가" → 기존 space로 resolve
5. **수동 조치 확인**: "수동으로 내가 해야 할 게 뭐야" → provider별 manual action 목록

---

## 6. 변경 파일 목록

### 수정
- `src/features/executionDispatchLifecycle.js` — supabase path bug fix, scanPendingCursorResults 실구현, PM intent 확장
- `src/features/executionSpineRouter.js` — PM cockpit 대폭 강화, 새 intent 핸들링, project_id 표시
- `src/features/executionRun.js` — resolveApproval에 run 반환 추가
- `src/features/runInboundAiRouter.js` — project space resolve/bootstrap 통합
- `src/features/startProjectLockConfirmed.js` — project space auto-create 통합
- `src/features/projectSpecSession.js` — project space auto-create 통합
- `scripts/test-final-operating-closure.mjs` — PM cockpit header 변경 반영
- `package.json` — 새 테스트 스크립트 추가

### 신규
- `src/features/projectSpaceRegistry.js`
- `src/features/projectSpaceResolver.js`
- `src/features/projectSpaceBootstrap.js`
- `src/adapters/vercelAdapter.js`
- `src/adapters/railwayAdapter.js`
- `scripts/test-vnext-closure-project-space.mjs`

---

## 7. vNext.1 — Project Space Truth Hardening (2026-03-30)

**Patch**: vNext.1 — existing-reference routing / hydration / idempotent bootstrap / provider truth

### 변경 요약

| 항목 | 상태 |
|---|---|
| existing_reference routing in runInboundAiRouter | ✅ 전용 분기 추가. resolved → thread 바인딩 + 확인 표면, ambiguous → 후보 리스트, unresolved → 프로젝트 식별 요청 |
| tokenized NL resolution | ✅ searchProjectSpacesWithScore() 토큰 분리 + stop word 제거 + confidence threshold 10점 |
| registry hydration on app startup | ✅ app.js에 loadProjectSpacesFromDisk() 연결, 카운트 로깅, 파일 부재/corrupt 시 안전 복구 |
| idempotent bootstrap | ✅ getOrCreateProjectSpaceForBootstrap() — thread-linked/label-match 재사용 후 create |
| canonical PM cockpit routing | ✅ detectPMIntent()가 유일한 intent classifier. 로컬 regex 5개 제거, COMPLETION_RE/ESCALATION_RE만 사전 필터 |
| provider run truth | ✅ renderExecutionReportingPacket: readiness (env 준비)와 run truth (issue/branch/PR/cursor trace/supabase migration) 분리 |

### 방지되는 잘못된 바인딩 케이스

1. **"지난번 그 프로젝트"** 발화 시 기존 thread-linked space로 resolve → partner surface 낙하 방지
2. **ambiguous match** (Calendar App vs Calendar Admin 등): 자동 바인딩 없이 후보 리스트 표면
3. **unresolved text**: 자동 space 생성 없이 프로젝트 ID/별칭 요청
4. **같은 스레드 반복 "새 프로젝트"**: 기존 thread-linked space 재사용 (duplicate 방지)
5. **strong label match** 시 bootstrap 재사용 (score ≥ 12)

### 수정 파일

- `src/features/projectSpaceRegistry.js` — searchProjectSpacesWithScore(), tokenized search, stop words
- `src/features/projectSpaceResolver.js` — confidence threshold, phrase extraction, renderProjectResolutionSurface()
- `src/features/projectSpaceBootstrap.js` — getOrCreateProjectSpaceForBootstrap(), idempotent bootstrap
- `src/features/executionSpineRouter.js` — detectPMIntent canonical routing, buildProviderRunTruth(), PM cockpit 분리
- `src/features/runInboundAiRouter.js` — existing_reference 라우팅 분기
- `app.js` — loadProjectSpacesFromDisk() startup wiring
- `scripts/test-vnext-closure-project-space.mjs` — 7개 신규 테스트 (14-20)

### 테스트 추가

| # | 테스트 | 검증 내용 |
|---|---|---|
| 14 | existing_reference resolves existing project | thread-linked space가 있을 때 intent='existing_reference' 시 올바른 space resolve |
| 15 | ambiguous project match returns candidates | 동일 키워드 2개 space → ambiguous + 후보 리스트 |
| 16 | unresolved existing does not auto-bind | 무관한 텍스트 → project_id 없이 unresolved |
| 17 | startup hydration restores persisted registry | 파일 → reset → load → thread index 복원 |
| 18 | repeated same-thread bootstrap is idempotent | 같은 thread 반복 bootstrap → 1개 space, reused=true |
| 19 | PM intent routing uses detectPMIntent canonically | 5종 intent 문자열 매칭 |
| 20 | provider truth shows readiness + run state | cockpit에 준비 상태 / 실행 상태 분리 확인 |

---

## 8. vNext.3 — Founder-Grade Surface Integrity + Slack File Intake + Context Lock (2026-03-30)

**Patch**: vNext.3 — Founder-Grade Surface Integrity + Slack File Intake + Context Lock OS

### Section 0 검증 결과

| 가정 | 실제 |
|---|---|
| B. app.js에 loadProjectSpacesFromDisk 없음 | ❌ **vNext.1에서 이미 추가됨** |
| C. existing_reference 라우팅 없음 | ❌ **vNext.1에서 이미 추가됨** |
| D. getOrCreateProjectSpaceForBootstrap 없음 | ❌ **vNext.1에서 이미 추가됨** |
| E. persistence opt-in (default OFF) | ✅ → **이번 패치에서 default ON으로 변경** |
| F. founder-grade guard 모듈 없음 | ✅ → **이번 패치에서 신규 생성** |
| G. Slack file intake 없음 | ✅ → **이번 패치에서 구현** |

### 변경 요약

| 항목 | 상태 |
|---|---|
| founderSurfaceGuard.js | ✅ 신규. sanitizeFounderOutput() — internal metadata 자동 제거. finalizeSlackResponse에 통합 |
| council work-hint footer 제거 | ✅ "실행 작업 후보" / "업무등록:" 푸터 normal flow에서 완전 제거. internal log만 |
| founderSlotLedger.js | ✅ 신규. 12개 slot, resolve/reopen/bulk, 디스크 persist + startup hydration |
| topicAnchorGuard.js | ✅ 신규. domain cluster 추출, cross-project drift 감지 (calendar↔grants, GTM↔calendar) |
| deliverableBundleRouter.js | ✅ 신규. 4종 bundle type, deliverable intent 감지, LLM prompt 생성 |
| slackFileIntake.js | ✅ 신규. file event에서 파일 추출, fetch, text 파싱. 5종 실패 사유 정밀 반환 |
| slackDocumentContext.js | ✅ 신규. thread별 문서 저장/조회/병합 |
| contextSynthesis.js | ✅ 신규. continuation/correction/document_refine/synthesis_request 4종 감지 |
| registerHandlers.js file intake 통합 | ✅ DM event.subtype='file_share' 허용, app_mention에도 파일 처리 추가 |
| persistence default ON | ✅ conversation_buffer + intake_session 모두 기본 ON (0/false로만 비활성화) |
| founderSlotLedger startup hydration | ✅ app.js에 loadSlotLedgersFromDisk() 추가 |

### 차단되는 founder-facing 실패 패턴

1. **"내부 처리 정보" / "참여 페르소나" / "matrix trigger" / "institutional memory"** — sanitizeFounderOutput이 자동 제거
2. **"실행 작업 후보로 보입니다. 필요하면 '업무등록:...'"** — normal flow에서 완전 제거
3. **Calendar thread에 grants/compliance 침투** — topicAnchorGuard drift 감지
4. **Abstract GTM thread에 calendar kickoff 침투** — topicAnchorGuard drift 감지
5. **Restart 후 킥오프 리셋** — founderSlotLedger persist + hydration으로 방지

### Slack 파일 인제스트 실패 시 정밀 사유

| 코드 | 메시지 |
|---|---|
| scope_missing | 앱에 files:read scope가 없어 파일 내용을 읽을 수 없습니다 |
| no_url | 이 대화 유형(Slack Connect/admin policy)에서 파일 접근이 제한 |
| unsupported_type | 파일 형식은 현재 파서가 지원하지 않습니다 |
| empty_content | 파일 메타데이터 확인했지만 본문 추출 실패 |
| fetch_failed | 파일 fetch 실패 (HTTP status) |

### 신규 파일

- `src/features/founderSurfaceGuard.js`
- `src/features/founderSlotLedger.js`
- `src/features/topicAnchorGuard.js`
- `src/features/deliverableBundleRouter.js`
- `src/features/contextSynthesis.js`
- `src/features/slackFileIntake.js`
- `src/features/slackDocumentContext.js`
- `scripts/test-vnext3-founder-grade.mjs`

### 수정 파일

- `src/features/topLevelRouter.js` — sanitizeFounderOutput 통합
- `src/features/runInboundAiRouter.js` — work-hint footer 제거
- `src/slack/registerHandlers.js` — file intake 통합, subtype=file_share 허용
- `src/features/slackConversationBuffer.js` — persistence default ON
- `src/features/projectIntakeSession.js` — persistence default ON
- `app.js` — founderSlotLedger hydration 추가
- `package.json` — 새 테스트 스크립트 추가

### 테스트 추가 (13개)

| # | 테스트 | 검증 |
|---|---|---|
| 1 | founderSurfaceGuard strips internal metadata | 6종 internal pattern 제거, debug mode 보존 |
| 2 | work-hint footer removal | 업무등록 푸터 제거, 원본 콘텐츠 보존 |
| 3 | founderSlotLedger CRUD + hydration | resolve/reopen/bulk, 파일 기반 hydration |
| 4 | topicAnchorGuard drift detection | calendar↔grants, GTM↔calendar 양방향 drift |
| 5 | deliverableBundleRouter intent | 5종 trigger, prompt 생성 |
| 6 | slackFileIntake readiness + errors | 진단, 에러 메시지 정밀도 |
| 7 | slackDocumentContext | add/get/merge 기본 동작 |
| 8 | contextSynthesis intent | 4종 continuation/correction 감지 |
| 9 | persistence defaults ON | env 미설정 시 persist 활성화 |
| 10 | calendar regression | grants drift 차단 |
| 11 | abstract GTM regression | calendar drift 차단 |
| 12 | restart continuation | slot ledger survives reload |
| 13 | canonical surface validation | 허용/차단 surface 분류 |

---

## 9. Next Patch Priorities

1. **LLM integration** — topicAnchorGuard/deliverableBundleRouter/contextSynthesis를 실제 LLM 호출 경로에 통합
2. **Live provider integration** — Vercel/Railway API create, Cursor cloud callback
3. **Project space UI surface** — 대표가 "내 프로젝트 목록" 조회 가능
4. **Supabase CLI auto-apply** — `supabase db push` 자동화
5. **PDF/DOCX parser** — slackFileIntake에 추가 파서 통합
