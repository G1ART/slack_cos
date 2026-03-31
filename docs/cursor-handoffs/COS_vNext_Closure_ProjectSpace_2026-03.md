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

---

## 9. vNext.4 — Founder-Grade Wiring Closure (2026-03-30)

### Public-Main Reality Table (patch 전)

| # | 항목 | 상태 |
|---|---|---|
| 1 | app.js loads conversation buffer | ✅ VERIFIED |
| 2 | app.js loads intake sessions | ✅ VERIFIED |
| 3 | app.js loads project spaces | ✅ VERIFIED |
| 4 | app.js loads slot ledgers | ✅ VERIFIED |
| 5 | conversation buffer persist default-on | ✅ VERIFIED |
| 6 | intake session persist default-on | ✅ VERIFIED |
| 7 | sanitizeFounderOutput on outbound | ✅ VERIFIED |
| 8 | council/work-hint footer removed at source | ✅ VERIFIED |
| 9 | existing_reference routing wired | ✅ VERIFIED |
| 10 | deliverableBundleRouter wired in router | ❌→✅ THIS PATCH |
| 11 | contextSynthesis wired in router | ❌→✅ THIS PATCH |
| 12 | topicAnchorGuard before outbound | ❌→✅ THIS PATCH |
| 13 | file_share in DM | ✅ VERIFIED |
| 14 | app_mention file handling | ✅ VERIFIED |
| 15 | docx extraction supported | ❌→✅ THIS PATCH |
| 16 | document context persists across restart | ❌→✅ THIS PATCH |

### 이 patch에서 추가/변경된 배선

#### 3) deliverableBundleRouter + contextSynthesis + topicAnchorGuard → runInboundAiRouter.js

Partner Surface 경로에 다음 순서로 배선:

1. **founderSlotLedger** — `tryAutoResolveSlots()` 자동 resolve (inbound 텍스트 파싱)
2. **resolvedSlots / documentText** — LLM 입력에 확정 슬롯 + 문서 컨텍스트 주입
3. **detectDeliverableIntent** — "작업 시작해", "1+2+3 시작해" 등 → deliverable bundle prompt 생성 → LLM 호출
4. **shouldActivateContextSynthesis** — "원래 요청을 이어서", "이 문서 토대로 구체화해" 등 → synthesis prompt → LLM 호출
5. **topicAnchorGuard** — partner surface 응답에 대해 drift detection → drift 시 anchor reminder로 regeneration
6. **documentText** — thread에 인제스트된 문서가 있으면 일반 대화에도 자동 inject

#### 4) founderSlotLedger 활성 사용

- `tryAutoResolveSlots()` — 패턴 기반 자동 slot resolve (project_goal, product_label, city_scope 등)
- 확정 슬롯은 LLM 입력에 `[이미 확정된 사항 — 다시 묻지 마세요]` 블록으로 주입
- deliverable/synthesis prompt에도 resolved slots 전달

#### 5) DOCX 지원 (mammoth)

- `slackFileIntake.js` — `mammoth` 라이브러리로 .docx 텍스트 추출
- SUPPORTED_MIMETYPES + PARSEABLE_EXTENSIONS에 docx 추가
- `diagnoseFileReadiness()` limitations에서 docx 미지원 제거

#### 6) Document Context 디스크 영속성

- `slackDocumentContext.js` — `persistDocContext()` / `loadDocumentContextFromDisk()` / `flushDocumentContextToDisk()` 추가
- `app.js` startup — document context hydration 추가 (5번째 state system)
- `app.js` shutdown — `flushDocumentContextToDisk()` 추가

#### 7) handleExistingProjectReference — named handler

- `runInboundAiRouter.js`에서 `handleExistingProjectReference()` 함수로 추출
- resolved → bind + continue, ambiguous → candidates, unresolved → clarification

#### 8) Canonical surface enforcement

- `topLevelRouter.js`에서 `isCanonicalSurface(responder)` 검증
- non-canonical responder 시 경고 로그

### Startup hydration 현황 (5 state systems)

| System | Import | Hydration | Flush | Default |
|---|---|---|---|---|
| conversation buffer | ✅ | ✅ startup | ✅ shutdown | ON |
| intake sessions | ✅ | ✅ startup | ✅ shutdown | ON |
| project spaces | ✅ | ✅ startup | - (on-write) | ON |
| slot ledgers | ✅ | ✅ startup | - (on-write) | ON |
| document context | ✅ | ✅ startup | ✅ shutdown | ON |

### 신규 테스트 (8개, vNext.4)

| # | 테스트 | 검증 |
|---|---|---|
| 14 | deliverableBundleRouter wiring | 5종 trigger + prompt 생성 + slot 주입 |
| 15 | contextSynthesis wiring | continuation/document_refine/auto-activate |
| 16 | topicAnchorGuard wiring | calendar→grants drift 차단 + same-domain 통과 |
| 17 | founderSlotLedger auto-resolve | 텍스트 파싱 자동 resolve + 재resolve 차단 |
| 18 | docx support | PARSEABLE_EXTENSIONS + diagnoseFileReadiness 반영 |
| 19 | document context persistence | persist → clear → hydrate → content intact |
| 20 | startup hydration regression | 5개 state system 전부 load function 존재 |
| 21 | canonical surface enforcement | 정상/비정상 surface 분류 |

### 수정 파일

- `src/features/runInboundAiRouter.js` — deliverable/synthesis/topicGuard/ledger 배선, handleExistingProjectReference 추출
- `src/features/topLevelRouter.js` — isCanonicalSurface 검증 추가
- `src/features/founderSlotLedger.js` — tryAutoResolveSlots() 추가
- `src/features/slackFileIntake.js` — docx 지원 (mammoth), BINARY_EXTENSIONS, extractDocxText()
- `src/features/slackDocumentContext.js` — 디스크 persist/load/flush 전체 구현
- `app.js` — document context hydration + shutdown flush
- `scripts/test-vnext3-founder-grade.mjs` — vNext.4 테스트 8개 추가
- `package.json` — mammoth 의존성

---

---

## 10. vNext.5 — Founder-Grade OS Hardening (2026-03-30)

### Public-Main Reality Table (patch 전)

| # | 항목 | 패치 전 | 패치 후 |
|---|---|---|---|
| 1-9 | startup hydration, persist, sanitizer | ✅ VERIFIED | ✅ 유지 |
| **10** | **canonical surface enforcement HARD** | **❌ LOG ONLY** | **✅ force-convert (safe fallback)** |
| **11** | **council source no internal metadata** | **❌ 232-236행에서 생성** | **✅ diagnostics 분리, report clean** |
| 12-20 | routing, file intake, docx, persist | ✅ VERIFIED | ✅ 유지 |
| **21** | **replay tests cover all regressions** | **❌ 별도 script에만** | **✅ 28 tests including hardening** |

### 핵심 수술: Council Source Surgery

**Before**: `synthesizeCouncil()` 이 `report` 텍스트 본문에 직접 "내부 처리 정보" 블록을 생성
```
report += '내부 처리 정보\n';
report += `- 협의 모드: ${...}\n`;
report += `- 참여 페르소나: ${...}\n`;
report += `- matrix trigger: ${...}\n`;
report += `- institutional memory 힌트 수: ${...}\n`;
```

**After**: 내부 메타데이터가 `diagnostics` 객체로 분리. `report`는 founder-safe 텍스트만 포함.
- `synthesis.diagnostics` → `return { report, diagnostics, ... }`
- `runCouncilMode` → `return { text, diagnostics, meta, ... }`
- 로그 전용: `console.info(JSON.stringify({ event: 'council_diagnostics', ... }))`
- `sanitizeFounderOutput`은 defense-in-depth로만 유지

### Hard Canonical Surface Enforcement

**Before**: `topLevelRouter.js`에서 non-canonical responder는 `logRouterEvent('non_canonical_surface_normalized')` — 경고만

**After**: non-canonical + non-system responder → **safe fallback 강제 변환**
```
out = '[COS] 응답을 처리하는 중 내부 경로 오류가 발생했습니다. 다시 시도해 주세요.';
```

허용 responder:
- Canonical: partner_surface, research_surface, kickoff_surface, execution_surface, clarification_surface, document_review_surface, decision_packet_surface, deliverable_bundle_surface, synthesis_surface, executive_surface, project_bootstrap, existing_project_*
- System: council, query, planner, help, error, single, legacy_single, navigator, structured, executive_surface, execution_*

### File Truth Alignment

- `diagnoseFileReadiness()` — docx가 `supported_types`에 포함, `limitations`에서 제외
- `logFileReadinessDiagnostic()` — app.js startup에서 호출, 파일 준비 상태 로그
- mammoth 기반 .docx 텍스트 추출 경로 완전 정렬

### Council 마커 정리

- `topLevelRouter.js` — `COUNCIL_SYNTHESIS_MARKERS`에서 '내부 처리 정보', '- 협의 모드:' 제거 (더 이상 council이 생성하지 않으므로)

### 신규 테스트 (7개, vNext.5)

| # | 테스트 | 검증 |
|---|---|---|
| 22 | council source surgery | report builder에 내부 메타 문자열 없음 확인 |
| 23 | hard canonical enforcement | non-canonical responder → safe fallback 강제 변환 |
| 24 | source leak regression | council report의 모든 `report +=` 줄에 금지 문자열 없음 |
| 25 | sanitizer defense-in-depth | 레거시 포맷이 남더라도 sanitizer가 잡음 |
| 26 | new canonical surfaces | deliverable_bundle_surface, synthesis_surface 등록 |
| 27 | restart OS regression | slot ledger + document context + deliverable/synthesis 전부 재시작 생존 |
| 28 | file readiness diagnostic | startup 진단 함수 + docx in readiness |

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/agents/council.js` | "내부 처리 정보" 블록을 report에서 제거, diagnostics 분리 |
| `src/features/topLevelRouter.js` | non-canonical → safe fallback 강제, council markers 정리 |
| `src/features/founderSurfaceGuard.js` | deliverable_bundle_surface, synthesis_surface 추가 |
| `src/features/slackFileIntake.js` | logFileReadinessDiagnostic() 추가 |
| `app.js` | file readiness diagnostic startup 추가 |
| `scripts/test-vnext3-founder-grade.mjs` | vNext.5 테스트 7개 추가 (총 28개) |

---

## 10. vNext.6 — Full-Cycle MVP Closure (execution autopilot + approval loop)

**패치 일자**: 2026-03-30

### Reality Table (before → after)

| # | 항목 | Before | After |
|---|---|---|---|
| 1 | 업무등록/work-hint removed | ✅ | ✅ |
| 2 | app.js hydrates conversation buffer | ✅ (no count log) | ✅ (with count log) |
| 3 | app.js hydrates intake sessions | ✅ (no count log) | ✅ (with count log) |
| 4 | app.js hydrates project spaces | ✅ | ✅ |
| 5 | app.js hydrates slot ledgers | ✅ | ✅ |
| 6 | app.js hydrates document context | ✅ | ✅ |
| 7 | GitHub repo bootstrap | ❌ | ⚠️ manual bridge (honest) |
| 8 | GitHub issue create | ✅ live | ✅ live |
| 9 | GitHub branch/PR seed | ❌ | ✅ live `createBranchArtifact` + `createPullRequestArtifact` |
| 10 | Vercel live create | ❌ | ⚠️ manual bridge + deploy packet |
| 11 | Railway live create | ❌ | ⚠️ manual bridge + deploy packet |
| 12 | projectSpaceBootstrap idempotent | ✅ | ✅ |
| 13 | execution run deploy-ready state | ❌ | ✅ `deploy_ready` stage + `evaluateDeployReadiness` |
| 14 | approval/escalation packet from run | ⚠️ partial | ✅ normalized `renderApprovalPacket` + `renderEscalationPacket` |
| 15 | full-cycle MVP replay test | ❌ | ✅ TEST 39 — 전체 루프 검증 |

### Core Changes

**GitHub Execution Primitives (item 9)**
- `createBranchArtifact()`: live `git.createRef` — default branch HEAD에서 새 branch 생성
- `createPullRequestArtifact()`: live `pulls.create` — branch→default PR 자동 생성
- `ensureGithubIssueForRun`: issue 생성 후 branch seed → PR seed 자동 체인
- `parseGitHubResultIntake`: `pr_number`, `pr_url`, `commit_sha`, `branch_name` 파싱

**Deploy State & Packets (items 5, 13)**
- `deploy_ready` stage: 모든 lane 완료 시 자동 전이 (기존 `execution_reporting` → `deploy_ready`)
- `evaluateDeployReadiness()`: code readiness + provider config → deploy readiness 평가
- `buildUnifiedDeployPacket()`: Vercel/Railway deploy packet 통합 빌더
- `renderDeployPacket()`: founder-facing deploy 상태 Slack 렌더링
- Run 객체에 `deploy_provider`, `deploy_status`, `deploy_url`, `deploy_error` 필드 추가

**Approval/Escalation Normalization (item 6, 14)**
- `renderApprovalPacket()`: 완료 작업 / 차단 사항 / 결정 필요 / 선택지 / COS 권장 포함
- `renderDeployPacket()`: provider별 readiness + 차단 사항 + 다음 액션
- `renderOneLineStatus()`: "지금 어디까지 됐어?" 한 줄 응답
- `renderExecutionStatusPacket()`: 종합 상태 보고

**PM Cockpit Upgrade (item 7)**
- `renderPMCockpitPacket()`: GitHub/Cursor/Supabase run truth + 배포 준비 상태 + 대표 필요 액션
- `deriveFounderNextAction()`: 실행 상태에 따른 대표 다음 조치 자동 추론
- deploy_ready 상태 → 자동 approval packet + deploy packet 출력

**Startup Hydration (item 2)**
- 5시스템 모두 structured JSON count 로그 출력:
  `startup_conversation_buffer_hydrated`, `startup_intake_sessions_hydrated`,
  `startup_project_spaces_hydrated`, `startup_slot_ledgers_hydrated`,
  `startup_document_context_hydrated`

**Project Space SSOT (item 3)**
- `renderProjectSpaceStatusForSlack()` 보강: 활성 run 인라인 표시 (stage + deploy 포함)
- Run 생성 시 project space `active_run_ids` 연동

**Document Context → Execution (item 8)**
- GitHub issue body에 document context summary + source documents 포함
- Cursor handoff 파일에 Document Context 섹션 자동 삽입

### Full-Cycle MVP Test (TEST 39)

검증 경로: request → scope lock → project space → execution run → GitHub issue + branch + PR seed → Cursor handoff → result ingestion → deploy_ready → approval packet → deploy packet → PM cockpit truth

### 수정 파일

| 파일 | 변경 |
|---|---|
| `src/adapters/githubAdapter.js` | `createBranchArtifact`, `createPullRequestArtifact` live API 추가 |
| `src/features/executionRun.js` | `deploy_provider`/`deploy_status`/`deploy_url` 필드, `updateRunDeployStatus`, `_resetForTest` |
| `src/features/executionDispatchLifecycle.js` | `deploy_ready` stage, `evaluateDeployReadiness`, `buildUnifiedDeployPacket` |
| `src/features/executionSpineRouter.js` | `renderDeployPacket`, `renderApprovalPacket`, `renderOneLineStatus`, `renderExecutionStatusPacket`, deploy_ready 라우팅, `deriveFounderNextAction` |
| `src/features/executionOutboundOrchestrator.js` | branch/PR auto-seed, document context → issue body + cursor handoff |
| `src/features/projectSpaceRegistry.js` | `renderProjectSpaceStatusForSlack` 보강 (run 인라인) |
| `src/features/slackConversationBuffer.js` | `loadConversationBufferFromDisk` count 반환 |
| `src/features/projectIntakeSession.js` | `loadProjectIntakeSessionsFromDisk` count 반환 |
| `app.js` | 5시스템 hydration count 로그 |
| `scripts/test-vnext3-founder-grade.mjs` | 11개 테스트 추가 (총 39개) |
| `scripts/test-final-operating-closure.mjs` | PM cockpit assertion 업데이트 |
| `scripts/test-vnext-closure-project-space.mjs` | provider truth assertion 업데이트 |

### Remaining Limitations

1. **GitHub repo bootstrap**: live `repos.create` 미구현 — honest manual bridge 제공
2. **Vercel/Railway live create**: API 미구현 — deploy packet + manual bridge
3. **LLM 기반 end-to-end**: 실제 Slack thread + LLM 호출 포함 테스트는 아직 없음
4. **Supabase auto-apply**: `supabase db push` 자동화 미구현

---

## 11. vNext.7 — Public-Main Reconciliation + Golden Path MVP

### Reconciliation Table (14 항목)

| # | 항목 | Before vNext.7 | After vNext.7 |
|---|---|---|---|
| 1 | loadProjectSpacesFromDisk startup | ✅ verified app.js:927 | OK |
| 2 | loadSlotLedgersFromDisk startup | ✅ verified app.js:933 | OK |
| 3 | loadDocumentContextFromDisk startup | ✅ verified app.js:939 | OK |
| 4 | **업무등록/실행작업후보 제거** | ❌ 10+ files still had founder-facing | ✅ 3건 founder-facing 제거 |
| 5 | existing_reference route | ✅ runInboundAiRouter:961 | OK |
| 6 | deliverable bundle wiring | ✅ runInboundAiRouter:982 | OK |
| 7 | context synthesis wiring | ✅ runInboundAiRouter:1048 | OK |
| 8 | DM file_share intake | ✅ registerHandlers:123 | OK |
| 9 | app_mention file intake | ✅ registerHandlers:62 | OK |
| 10 | mammoth in package.json | ✅ package.json:19 | OK |
| 11 | docx parsing reachable | ✅ slackFileIntake:166 | OK |
| 12 | branch/PR live path | ✅ adapter + orchestrator call sites | OK |
| 13 | deploy_ready stage | ✅ lifecycle:201 + run:212 | OK |
| 14 | approval/escalation rendering | ✅ spineRouter + call sites | OK |

### Core Changes

1. **Founder-facing 업무등록 제거** (3건)
   - `customerFeedbackAwqBridge.js`: 내부 명령 구문 → 자연어
   - `g1cosLineageTransport.js`: 내부 명령 구문 → 자연어
   - `executiveStatusRollup.js`: 내부 명령 구문 → 자연어

2. **GitHub honest status model** — `deriveGithubExecutionTruth()` export
   - 명확한 구분: `issue_created_live`, `branch_planned`, `branch_seeded`, `branch_created_live`, `pr_created_live`
   - PM cockpit에서 honest status model 사용

3. **Deploy status transitions** — `DEPLOY_STATUS_VALUES` canonical set
   - `none` → `manual_bridge_prepared` → `awaiting_founder_action` → `linkage_recorded` → `deploy_ready` → `deployed_manual_confirmed`
   - Deploy packet에 `배포 상태` + result-drop path 표시

4. **Auto-escalation** — `manual_blocked` 상태에서 자동 escalation packet 생성

5. **Golden path integration test** — `test-golden-path-full-cycle-mvp.mjs` (8 tests)
   - Full-cycle OS loop: request → lock → run → toolchain → deploy → approval
   - GitHub execution truth honest model
   - Deploy status transitions
   - Founder-facing 업무등록 regression
   - 5-system startup hydration verification
   - File intake path verification
   - docx + mammoth reachable
   - Execution status packet rendering

### Modified Files

| File | Changes |
|---|---|
| `src/features/customerFeedbackAwqBridge.js` | 내부 명령 구문 → 자연어 |
| `src/features/g1cosLineageTransport.js` | 내부 명령 구문 → 자연어 |
| `src/features/executiveStatusRollup.js` | 내부 명령 구문 → 자연어 |
| `src/features/executionSpineRouter.js` | `deriveGithubExecutionTruth`, honest PM cockpit, auto-escalation, deploy packet 보강 |
| `src/features/executionRun.js` | `DEPLOY_STATUS_VALUES`, `updateRunDeployStatus` validation |
| `scripts/test-golden-path-full-cycle-mvp.mjs` | NEW — 8 golden path tests |
| `package.json` | test script에 golden path 추가 |

### Remaining Limitations

1. **GitHub repo bootstrap**: live `repos.create` 미구현 — honest manual bridge
2. **Vercel/Railway live create**: API 미구현 — deploy packet + manual bridge
3. **LLM 기반 end-to-end**: 실제 Slack thread + LLM 호출 포함 테스트는 아직 없음
4. **Supabase auto-apply**: `supabase db push` 자동화 미구현
5. **Approval response routing**: 대표 승인/거부 → run state 자동 전이 미구현

---

## 12. vNext.8 — Source-Truth Cleanup + Golden Path Closure

### Public-Main Truth Reconciliation

| # | 항목 | Before vNext.8 | After vNext.8 |
|---|---|---|---|
| 1 | council.js founder report internal meta | ❌ 4 section headers (종합 추천안, 페르소나별 핵심 관점, 가장 강한 반대 논리, 핵심 리스크) | ✅ founder-grade (COS 권고, 주요 관점, 주요 반론, 리스크) |
| 2 | g1cosLineageTransport 내부 명령 노출 | ❌ `실행큐계획화` founder-facing | ✅ 자연어 |
| 3 | executiveStatusRollup 내부 명령 노출 | ❌ `실행큐계획화`, `계획등록:` founder-facing | ✅ 자연어 |
| 4 | executiveSurfaceHelp 내부 명령 노출 | ❌ `실행큐계획화`, `커서발행` in founder help | ✅ 자연어 안내 |
| 5 | Approval response → run state | ❌ 미구현 | ✅ detectApprovalIntent + applyApprovalDecision |
| 6 | Deploy status extended values | 7 values | ✅ 10 values (+approved, rework_requested, paused) |
| 7 | docx support | ✅ 이미 구현 | ✅ 확인 (mammoth + PARSEABLE_EXTENSIONS + extractDocxText) |
| 8 | File intake failure reasons | ✅ 9 error codes | ✅ (no_file, no_url, unsupported_type, no_download_url, no_token, scope_missing, fetch_failed, empty_content, ingest_error) |

### Core Changes

**A. Source-Level Founder Leak Surgery**
- `council.js`: report에서 `종합 추천안` → `*COS 권고*`, `페르소나별 핵심 관점` → `*주요 관점*` (persona ID 제거), `가장 강한 반대 논리` → `*주요 반론*`, `핵심 리스크` → `*리스크*`. diagnostics는 내부 전용 유지
- `g1cosLineageTransport.js`: `실행큐계획화` → 자연어
- `executiveStatusRollup.js`: `실행큐계획화`, `계획등록:`, `실행큐:` → 자연어
- `executiveSurfaceHelp.js`: 전면 리라이트 — 자연어 중심 사용 안내, 승인 응답 예시 포함

**B. Approval Response → Run State Transition (신규)**
- `detectApprovalIntent(text)` — "배포 승인" / "추가 수정 요청" / "보류" 감지
- `applyApprovalDecision(run, decision, note)` — 실제 run/deploy state 전이
  - approve → `approved_for_deploy` + `deploy_status: approved`
  - rework → `in_progress_rework` + `deploy_status: rework_requested`
  - hold → `paused_for_founder` + `deploy_status: paused`
- `tryFinalizeExecutionSpineTurn`에서 `deploy_ready` / `paused_for_founder` 상태일 때 approval intent 먼저 체크

**C. Deploy Status Taxonomy 확장**
- `DEPLOY_STATUS_VALUES`: `approved`, `rework_requested`, `paused` 추가 (총 10개 상태)

### Modified Files

| File | Changes |
|---|---|
| `src/agents/council.js` | report 빌드 — founder-grade로 리팩 |
| `src/features/g1cosLineageTransport.js` | `실행큐계획화` → 자연어 |
| `src/features/executiveStatusRollup.js` | 3건 내부 명령 → 자연어 |
| `src/features/executiveSurfaceHelp.js` | 전면 리라이트 — 자연어 help |
| `src/features/executionSpineRouter.js` | `detectApprovalIntent`, `applyApprovalDecision`, approval routing |
| `src/features/executionRun.js` | `DEPLOY_STATUS_VALUES` 확장 |
| `scripts/test-golden-path-full-cycle-mvp.mjs` | 14 tests (6 new: approval approve/rework/hold, council leak, help regression, full approval closure) |
| `scripts/test-executive-status-rollup.mjs` | assertion 업데이트 |

### Test Results

```
Golden Path: 14 passed, 0 failed
npm test: ALL PASS (전체 스위트)
```

---

## 13. vNext.9 — Slack-Native Deploy Closure + Truth Reconciliation

### Public-Main Truth Reconciliation

| 항목 | Before vNext.9 | After vNext.9 |
|---|---|---|
| Deploy approval Block Kit buttons | ❌ text-only | ✅ `g1cos_exec_deploy_approve/rework/hold` |
| Deploy button action handler | ❌ 없음 | ✅ registerHandlers.js에 전용 handler |
| Deploy URL ingestion | ❌ 없음 | ✅ `detectDeployUrlAndCompletion` + `ingestDeployUrl` |
| Deploy completion closure | ❌ 없음 | ✅ `confirmDeployComplete` → `deployed_manual_confirmed` |
| Council fallback banned text | ⚠️ line 207/209에 잔존 | ✅ 제거 |
| Deploy packet UX | generic text | ✅ founder action-centric (stage별 next action) |

### Core Changes

**A. Execution Deploy Approval Block Kit Buttons**
- `buildDeployApprovalBlocks(run)` — 3개 버튼 (배포 승인/추가 수정 요청/보류)
- action_id: `g1cos_exec_deploy_approve`, `g1cos_exec_deploy_rework`, `g1cos_exec_deploy_hold`
- value에 `run_id`, `packet_id`, `current_stage`, `deploy_status` 포함
- `registerHandlers.js`에 전용 action handler 추가
- text fallback 유지 (Block Kit 실패 시에도 자연어 동작)

**B. Deploy URL Ingestion + Linkage Recording**
- `detectDeployUrlAndCompletion(text)` — URL + 완료 의도 동시 감지
- `ingestDeployUrl(run, url, providerHint, isComplete)` — URL 검증 + state 전이
  - URL만: `linkage_recorded`
  - URL + 완료: `deployed_manual_confirmed` + `deployment_confirmed`
- `confirmDeployComplete(run)` — URL 있을 때 "배포 완료" 응답 처리
- provider hint: vercel.app / railway.app / custom
- error codes: `invalid_url`, `wrong_stage`, `no_active_run`

**C. Council Fallback Fix**
- line 207: "가장 강한 반대 논리" → "반론"
- line 209: "핵심 리스크" → "주요 리스크"

**D. Deploy Packet UX**
- stage별 next action 분기 (approved → URL 요청, linkage_recorded → 완료 확인, deployed → 확인 완료)
- manual bridge 명시 (Vercel/Railway "live API 미구현 — 수동 배포")
- URL 자동 연결 안내

### State Transition Table

| 대표 행동 | Before Stage | After Stage | Deploy Status |
|---|---|---|---|
| "배포 승인" | deploy_ready | approved_for_deploy | approved |
| "추가 수정 요청" | deploy_ready | in_progress_rework | rework_requested |
| "보류" | deploy_ready | paused_for_founder | paused |
| URL 붙여넣기 | approved_for_deploy | (unchanged) | linkage_recorded |
| URL + "배포 완료" | approved_for_deploy | deployment_confirmed | deployed_manual_confirmed |
| "배포 완료" (URL 기록 후) | linkage_recorded | deployment_confirmed | deployed_manual_confirmed |

### Modified Files

| File | Changes |
|---|---|
| `src/features/executionSpineRouter.js` | `buildDeployApprovalBlocks`, `detectDeployUrlAndCompletion`, `ingestDeployUrl`, `confirmDeployComplete`, deploy packet UX, URL/completion routing |
| `src/slack/registerHandlers.js` | `g1cos_exec_deploy_*` button action handler |
| `src/agents/council.js` | fallback text fix (line 207, 209) |
| `scripts/test-golden-path-full-cycle-mvp.mjs` | 22 tests (8 new) |

### Test Results

```
Golden Path: 22 passed, 0 failed
npm test: ALL PASS
```

### Remaining Limitations

1. **GitHub repo bootstrap**: `repos.create` 미구현 — honest manual bridge
2. **Vercel/Railway live deploy**: API 미구현 — deploy packet + manual bridge (명시)
3. **LLM 기반 end-to-end**: 실제 Slack thread + LLM 호출 포함 테스트 미포함
4. **Supabase auto-apply**: `supabase db push` 자동화 미구현

---

## 14. vNext.9a — Main Reconciliation (감사 기반 truth lock)

### 감사 결과

vNext.9a 패치 지시서의 12개 항목에 대해 strict audit 수행. **12/12 모두 public main에서 VERIFIED.**

| # | 항목 | Public Main | 증거 |
|---|---|---|---|
| A1 | `buildDeployApprovalBlocks` | ✅ | spineRouter:532 |
| A2 | `blocks:` return in deploy_ready | ✅ | spineRouter:997 |
| A3 | exec deploy button handler | ✅ | registerHandlers:256 |
| B4 | `detectDeployUrlAndCompletion` | ✅ | spineRouter:585 |
| B5 | `ingestDeployUrl` | ✅ | spineRouter:605 |
| B6 | `confirmDeployComplete` | ✅ | spineRouter:659 |
| B7 | URL routing in spine turn | ✅ | spineRouter:957 |
| C8 | `detectApprovalIntent` | ✅ | spineRouter:741 |
| C9 | `applyApprovalDecision` (3 transitions) | ✅ | spineRouter:753 |
| C10 | Approval wiring in spine turn | ✅ | spineRouter:943 |
| D11 | Council — 7개 금지 문구 모두 부재 | ✅ | council.js:216-247 |
| E12 | DEPLOY_STATUS_VALUES 10개 | ✅ | executionRun:234-238 |

### Founder Journey (현재 상태)

```
founder: "캘린더 앱 만들자"
→ COS scope lock → project space → execution run
→ GitHub issue + branch + Cursor handoff + Supabase draft
→ all lanes complete → deploy_ready

COS: [승인 요청] + [배포 패킷] + [Block Kit: 배포 승인 | 추가 수정 | 보류]
→ founder: "배포 승인" (button or text)
→ run: approved_for_deploy / deploy_status: approved

COS: "배포 후 URL을 이 스레드에 붙여 넣으세요."
→ founder: "https://my-app.vercel.app"
→ run: deploy_status: linkage_recorded

COS: "이 URL이 실제 배포 결과면 '배포 완료'라고 답해 주세요."
→ founder: "배포 완료"
→ run: deployment_confirmed / deployed_manual_confirmed
```

### 코드 변경: 없음

vNext.8 + vNext.9에서 모든 구현이 완료되어 코드 변경 불필요.

### 테스트 검증

```
Golden Path: 22 passed, 0 failed
npm test: ALL PASS (전체 스위트)
```

### 정제된 Remaining Limitations (vNext.9a 기준)

1. **GitHub repo bootstrap**: `repos.create` live 미구현 — honest manual bridge
2. **Vercel/Railway live deploy**: API 미구현 — deploy packet에 "수동 배포" 명시
3. **LLM 기반 end-to-end**: 실제 Slack thread + OpenAI 호출 포함 테스트 미포함
4. **Supabase auto-apply**: `supabase db push` 자동화 미구현

**이전 limitation 중 해소된 것:**
- ~~Approval Slack button 미구현~~ → vNext.9에서 Block Kit 구현 완료
- ~~Deploy URL ingestion 미구현~~ → vNext.9에서 구현 완료
- ~~Approval response routing 미구현~~ → vNext.8에서 구현 완료
- ~~Council internal metadata 잔존~~ → vNext.8/9에서 제거 완료

---

## 15. vNext.10 — Leak Path Trace + Council Hard Block (2026-03-31)

### 목표
- (`founder_output_trace`) 로그 한 줄로 턴 단위 **responder / response_type / source_formatter / slack_route_label / raw vs sanitize preview / marker 플래그** 확인.
- **Council 포함** 전 responder에 대해 구형 Council 헤더·페르소나 bullet·레거시 `승인 대기열` 블록 **하드 제거**(조회 `query` 응답은 기존 계약대로 원문 신뢰).
- 소수 **founder 테스트 입력**은 Council 경로로 가지 않도록 라우팅 락(`runtime_meta_surface` / `meta_debug_surface` / 킥오프 문구 → `tryExecutiveSurfaceResponse`).

### 주요 변경 파일
- `src/features/founderSurfaceGuard.js` — 구형 섬션 스트립 + `getPersonaRegistryKeys()` 기반 `- id:` 줄 제거 + `formatFounderApprovalAppendix`
- `src/features/topLevelRouter.js` — `looksLikeCouncilSynthesisBody` 를 **council 에도 적용**, `buildFounderOutputTraceRecord`/`founder_output_trace` JSON 로그, `final_response_return` 에 `source_formatter`/`slack_route_label`
- `src/features/inboundTurnTrace.js` — `getInboundTurnTraceStore`, `setInboundTurnSlackRouteLabel`
- `src/features/inboundFounderRoutingLock.js` — 버전·메타·테스트용 킥오프 문구 분류
- `src/features/runInboundAiRouter.js` — 라우팅 락 선행, Council 승인 말미를 `formatFounderApprovalAppendix` 로 교체, `source_formatter` 일부 경로
- `app.js`, `src/slack/registerHandlers.js` — `slack_route_label` (`mention_ai_router` / `dm_ai_router`), 인터랙티브/쿼리 네비 로깅
- `src/slack/registerSlashCommands.js`, `src/features/queryOnlyRoute.js` — slash / 조회 finalize 메타
- `scripts/test-vnext10-leak-path-council-hard-block.mjs`, `package.json` test 스크립트

### Owner actions (vNext.10)
1. **로컬**: `npm test`
2. **슬랙 스모크**: `@봇 버전` → runtime 패킷; 동일 스레드에서 `COS responder는 어떻게 동작해?` → meta 패킷; `오늘부터 테스트용 작은 프로젝트 하나 시작하자` → start_project 흐름. 배포 로그에서 `founder_output_trace` JSON grep.

### vNext.10b (같은 § 보강, 2026-03-31)

- **`founderRoutingLockFinalize.js`**: 멘션/DM **명령 라우터 최상단** + `runInboundAiRouter` 동일 락 — `tryExecutiveSurfaceResponse` 앞에 메타/버전/테스트 킥오프가 먼저 처리됨.
- **`topLevelRouter`**: `query` 외 전 responder에 **페르소나 줄·승인 대기열 형태·구형 마커** 선제 차단; `founder_output_trace`에 `route_label`, `passed_finalize`, `passed_sanitize`.
- **`founderOutboundGate.js`**: 멘션/ DM / 버튼 / 쿼리 네비 `postMessage` 직전 2차 sanitize; `COS_ENFORCE_FOUNDER_GATE=1`이면 ALS 상 finalize 누락 시 throw(회귀).
- **메타 한 줄 지시** (`한 줄로만 말해` 등): `inboundFounderRoutingLock` `META_BRIEF_DIRECTIVE`.
- **`/g1cos 버전`**: `finalizeSlackResponse` + `formatRuntimeMetaSurfaceText` 로 SLACK 과 동일 트레이스.

---

## 16. COS Constitutional Reset v1.1 (2026-03-31)

**아키텍처 중심축 전환**: `intent → authority → surface` → `work_object → work_phase → policy → packet → surface`

### 핵심 변경
- **Constitution v1.1**: `docs/architecture/COS_CONSTITUTION_v1.md` 전면 재작성 — Work-State-First Chief of Staff OS
- **founderContracts.js**: `WorkPhase`(discover/align/lock/seed/execute/review/approve/deploy/monitor/exception/utility), `PolicyContext`/`PolicyDecision`, `RiskClass`, `Capability`, `Actor` 추가. `FounderSurfaceType` OS surfaces 20종.
- **workObjectResolver.js** (신규): ProjectSpace/ExecutionRun/IntakeSession 래핑 — pipeline 첫 단계 "이 turn이 어떤 work object에 속하는가?"
- **workPhaseResolver.js** (신규): IntakeStage + Run.current_stage → unified WorkPhase 매핑
- **policyEngine.js** (신규): `f(actor, work_state, risk_class, capability) → PolicyDecision` — `founderAuthority.js` 교체
- **packetAssembler.js** (신규): executor 결과 → founder-facing 운영 패킷 조립 (renderer 앞단)
- **founderSurfaceRegistry.js**: policy + phase → surface type 해석
- **founderRenderer.js**: OS surface 렌더러 20종 + Freedom Levels (L0/L1/L2) + internal marker hard block
- **founderRequestPipeline.js**: 전면 재작성 — workObjectResolver → workPhaseResolver → intentClassifier(signal) → policyEngine → routeToExecutor → packetAssembler → renderer
- **founderAuthority.js**: 삭제 (policyEngine.js로 교체)
- **app.js**: pipeline 시그니처 v1.1 (`intake_session` 전달 + blocks 반환)

### 변경 파일 목록
| 파일 | 작업 |
|---|---|
| `docs/architecture/COS_CONSTITUTION_v1.md` | 전면 재작성 |
| `src/core/founderContracts.js` | 전면 재작성 (확장) |
| `src/core/workObjectResolver.js` | **신규** |
| `src/core/workPhaseResolver.js` | **신규** |
| `src/core/policyEngine.js` | **신규** |
| `src/core/packetAssembler.js` | **신규** |
| `src/core/founderSurfaceRegistry.js` | 전면 재작성 |
| `src/core/founderRenderer.js` | 전면 재작성 |
| `src/core/founderRequestPipeline.js` | 전면 재작성 |
| `src/core/founderAuthority.js` | **삭제** |
| `app.js` | pipeline 시그니처 변경 |
| `package.json` | constitutional tests 7개 추가 |
| `scripts/tests-constitutional/*.mjs` | **신규** 7개 |

### Constitutional Tests (7개)
- `test-work-object-resolver.mjs` — 14 assertions
- `test-work-phase-resolver.mjs` — 16 assertions
- `test-policy-engine.mjs` — 33 assertions
- `test-packet-assembler.mjs` — 25 assertions
- `test-founder-renderer-v11.mjs` — 26 assertions
- `test-golden-path-pipeline.mjs` — 43 assertions
- `test-council-object-only.mjs` — 20 assertions

### Owner actions (v1.1)
1. **로컬**: `npm test` — 기존 40+ 테스트 + constitutional 7개 = 전체 통과
2. **슬랙 스모크**: `@G1COS 버전` → runtime_meta_surface; `@G1COS COS responder는 어떻게 동작해?` → meta_debug_surface; `@G1COS 도움말` → help_surface; `@G1COS 오늘부터 테스트용 작은 프로젝트 하나 시작하자` → executive_kickoff_surface

---

## 17. Next Patch Priorities

1. **Golden path live 검증** — 실제 Slack thread에서 kickoff→lock→execute→approve→deploy 전체 경로 pipeline 통과 확인
2. **Legacy router freeze** — command/AI router에서 pipeline 처리 가능한 경로 점진 이관 (structured commands + query 렌더러)
3. **Council object-only 강제** — `synthesizeCouncil`이 object만 반환하도록 live 코드 패치
4. **Project space 목록 조회** — 대표가 "내 프로젝트 목록" Slack에서 조회
5. **Monitoring/rollback surface** — 배포 후 모니터링·롤백 안내
