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

## 8. Next Patch Priorities

1. **Live provider integration** — Vercel/Railway API create, Cursor cloud callback
2. **Project space UI surface** — 대표가 "내 프로젝트 목록" 조회 가능
3. **Supabase CLI auto-apply** — `supabase db push` 자동화
4. **GitHub repo bootstrap** — `gh repo create` live path
5. **Multi-run tracking per space** — space 내 여러 run 간 status aggregation
