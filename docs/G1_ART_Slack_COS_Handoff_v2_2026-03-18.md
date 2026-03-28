# G1.ART Slack COS Handoff v2.0

**Authority role:** Implementation ledger / patch handoff

**Can define:**

- what has been built
- what changed
- what remains
- next implementation suggestions

**Cannot override:**

- Directive
- Alignment
- Runtime truth

**Use when:**

- continuing work from prior patches
- checking implementation history

---

## 0. 문서 목적

이 문서는 **구현 대장(implementation ledger)이자 실행 handoff** 로서, G1.ART의 Slack 기반 Chief of Staff(COS) 작업을 이어가기 위한 **무엇이 만들어졌고 무엇이 남았는지**를 담는다.

**제품 헌법이 아니다. 빌드 순서의 권위 문서도 아니다. 현재 코드 분기의 정본도 아니다.** 그 역할은 각각 `COS_Project_Directive_NorthStar_FastTrack_v1.md`, `COS_NorthStar_Alignment_Memo_2026-03-24.md`, `COS_Inbound_Routing_Current_*.md` 이고, 전체 권위 맵은 **`docs/cursor-handoffs/00_Document_Authority_Read_Path.md`** 에 고정한다.

다음을 빠르게 파악하기 위한 자료로 쓴다.

1. 지금까지 무엇을 만들었는가  
2. 현재 어디까지 정상 작동하는가  
3. 어떤 구조로 리팩터링되었는가  
4. 대표 운영 철학과 시스템 요구 *(상위 디렉티브·워크플로 문서와 함께 볼 것 — 본 문서만으로 제품 진리를 대체하지 않음)*  
5. 다음 개발 우선순위에 대한 **구현 관점의 제안** *(최종 순서는 Alignment·디렉티브가 이김)*  
6. 지금 바로 무엇부터 이어서 작업할지에 대한 실무 단서

기능 홍보용 브로슈어가 아니라, **패치 간 연속성**을 위한 기록이다. **단일 권위 문서**처럼 읽히는 표현으로 **제품·런타임·빌드 순서**를 덮어쓰지 않는다 (`00_Document_Authority_Read_Path.md`).

### Big Pivot · 세션 간 소통 (2026-03 부속)

- **Big Pivot**: 이 레포에서 돌아가는 Slack COS **런타임/봇**을 부를 때 쓰는 이름. 저장소 디렉터리명은 `g1-cos-slack`.
- **Cursor / ChatGPT / 사람**이 같은 맥락을 공유하려면 `docs/cursor-handoffs/` 및 본 문서를 **구현 연속성**에 쓰고, **권위·읽기 순서**는 **`00_Document_Authority_Read_Path.md`** 를 본다. 인바운드 분기 요약은 **`COS_Inbound_Routing_Current_*.md`**.
- 구현 변경 후에는 가능하면 **같은 PR·작업**에서 핸드오프를 고치고, 본 문서 **§23.x** 등 해당 소절을 맞춘다.
- **권위 맵**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`. **디렉티브 · Alignment**: `COS_Project_Directive_NorthStar_FastTrack_v1.md` (§1c·§4 M1–M5), `COS_NorthStar_Alignment_Memo_2026-03-24.md`. **(지원·보존) 재잠금 장문**: `COS_NorthStar_ReLock_Directive_2026-03.md`. **워크스페이스 비전**: `COS_Workspace_Vision_CompanyScale_2026-03.md`. **하네스 번역**: `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`. 코드 갭 맵: `COS_OpenClaw_Vision_Roadmap_2026-03.md`. 실행 요약: `COS_NorthStar_Workflow_2026-03.md`.

---

## 1. 프로젝트 개요

### 프로젝트명

G1.ART Slack COS

### 목적

Slack 안에서 대표 전용 비서실장(COS)을 중심으로, 향후 기능별 전문 에이전트와 승인/기록/브리프 체계를 갖춘 **운영형 AI 조직**을 구축하는 것.

### 현재 개발 철학

- Slack은 프런트도어다.  
- COS는 대표의 단일 진입점이다.  
- 기능 에이전트는 뒤에서 호출되는 구조다.  
- 중요한 의사결정은 기록되어야 한다.  
- 중요한 안건은 대표 승인 대기열로 올라갈 수 있어야 한다.  
- 채널은 단순 대화방이 아니라 기능적 조직 공간이어야 한다.  
- 시스템은 단순한 챗봇이 아니라 운영 기억과 승인 흐름을 가진 비서실이어야 한다.

---

## 2. 대표의 운영 철학 요약

이 시스템은 단순 자동응답기가 아니라, 대표의 실제 조직 철학을 구현해야 한다.

핵심 철학:

- 역할을 분담하되 의도적 오버랩과 회색지대를 남긴다.  
- 에이전트 사이에는 건설적 긴장과 상호 견제가 있어야 한다.  
- 비서실장(COS)과 대표는 이 긴장을 모니터링하고, 전략적 순간에 최종 방향을 결정한다.  
- 결정 전에는 강하게 반대하고, 결정 후에는 모두가 commit 한다.  
- 선택되지 않은 의견도 반드시 기록한다.  
- 실패는 비난 대상이 아니라 빠른 수정과 교훈 축적의 재료다.  
- 조직은 technically ambitious, operationally excellent, bias for action, ultimate ownership 철학을 가져야 한다.

상위 설계 문서의 방향성은 그대로 유효하다.

---

## 3. 상위 설계 문서 목록

아래 문서들이 이미 작성되어 있다.

1. **G1.ART Agent Constitution 1.0**  
   - 조직 철학, 긴장 구조, 반대 후 헌신, 실패와 피봇 원칙

2. **G1.ART Chief of Staff Operating Manual 1.0**  
   - 대표–비서실장 관계, 상향 보고, 승인 구조, 운영 리듬

3. **G1.ART Agent Role Specifications 1.0**  
   - 기능 에이전트별 목적, 책임, 오버랩, 반대 포인트, 품질 기준

현재 Slack COS 코드는 이 상위 문서들의 초기 실행체다.

---

## 4. 현재 로컬 프로젝트 위치

### 로컬 경로

`/Users/hyunminkim/g1-cos-slack`

### 실행 명령

```bash
cd ~/g1-cos-slack
npm start
```

### 현재 런타임 방식

- Node.js  
- Slack Bolt for JavaScript  
- OpenAI Responses API  
- Slack Socket Mode  
- 로컬 머신에서 실행 중

즉, 현재는 배포형 서버가 아니라 **로컬 개발/운영 상태**다.  
터미널을 끄면 봇도 멈춘다.

---

## 5. 환경 변수

`.env` 파일에는 최소한 아래 값들이 있어야 한다.

- `OPENAI_API_KEY`  
- `SLACK_SIGNING_SECRET`  
- `SLACK_BOT_TOKEN`  
- `SLACK_APP_TOKEN`  
- `OPENAI_MODEL=gpt-5.4`

주의:

- ChatGPT 유료 구독과 OpenAI API Billing은 별개다.  
- 과거 `insufficient_quota` 오류가 있었고, API billing 충전 후 해결되었다.

---

## 6. 현재 구현 완료 기능

### 6.1 Slack 연결

정상 작동 완료.

구현 내용:

- Slack 앱 생성  
- Socket Mode 연결  
- Bot token / App token / Signing secret 설정  
- App Home(Messages tab)에서 직접 대화 가능  
- 채널에서 `@G1 COS` 멘션 시 응답 가능  
- **`/g1cos`** 슬래시 커맨드(조회 5종만) — Bolt `registerG1CosSlashCommand`; Slack 앱에 Slash Command 로 **동일 이름 등록** 필요

상태:

- 정상

주의:

- 현재 채널 명령은 기본적으로 **앱 멘션** 또는 **`/g1cos` 조회** 로 들어온다.  
- 멘션 없이 일반 채널 메시지를 모두 수신하는 구조는 아직 기본값이 아니다.

### 6.2 COS 기본 응답

정상 작동 완료.

### 6.3 COS Router v2

정상 작동 완료.

구현 내용:

- 사용자 입력 분류  
- 주 담당 에이전트 선택  
- 필요 시 Risk Agent 동시 호출  
- 대표 보고 형식 고정

현재 내부 분류 카테고리:

- `general`  
- `strategy_finance`  
- `ops_grants`  
- `product_ux`  
- `engineering`  
- `summary`

현재 주요 내부 담당자 타입:

- `general_cos`  
- `strategy_finance`  
- `ops_grants`  
- `product_ux`  
- `engineering`

출력 형식:

- 한 줄 요약  
- 추천안  
- 가장 강한 반대 논리  
- 핵심 리스크  
- 다음 행동  
- 대표 결정 필요 여부  
- 내부 처리 정보

### 6.4 Risk Agent

정상 작동 완료.

구현 내용:

- 공식 반대자 역할 수행  
- strongest objection  
- hidden risks  
- reconsider triggers  
- decision should pause 판단

### 6.5 Decision Log / Lessons Learned / Interaction Log

정상 작동 완료.

사용 가능한 명령:

- `결정기록: ...`  
- `교훈기록: ...`  
- `최근결정`  
- `최근결정 10`  
- `최근교훈`  
- `최근교훈 10`

저장 방식:

- JSON 파일 로컬 저장

저장 파일:

- `data/decision-log.json`  
- `data/lessons-learned.json`  
- `data/interaction-log.json`

### 6.6 이벤트 중복 방지

정상 작동 완료.

구현 내용:

- `event_id` 우선 키 기반 중복 방지  
- fallback key 보완  
- DM에서 `bot_id` / `subtype` 차단

### 6.7 Channel Context v4

정상 작동 완료.

구현 내용:

- 채널별 기본 역할 저장  
- 질문 해석 시 채널 성격 반영  
- 채널 기본 성격은 라우터와 주 담당 에이전트, Risk Agent 프롬프트에 모두 힌트로 주입됨

사용 가능한 명령:

- `채널설정: general_cos`  
- `채널설정: strategy_finance`  
- `채널설정: ops_grants`  
- `채널설정: product_ux`  
- `채널설정: engineering`  
- `채널설정: risk_review`  
- `현재채널설정`  
- `채널설정해제`

주의:

- 채널에서는 현재 구조상 **`@G1 COS` 멘션 포함**이 안전하다.

### 6.8 Weekly Brief / Executive Report v5

정상 작동 완료.

사용 가능한 명령:

- `주간브리프`  
- `주간브리프 14`  
- `대표보고서`  
- `대표보고서 14`  
- `이번주핵심결정`  
- `이번주핵심교훈`  
- `이번주리스크`

입력 데이터 소스:

- decision log  
- lessons learned  
- interaction log  
- approval queue

### 6.9 Approval Queue v6

정상 작동 완료.

현재 구현:

- 대표 결정이 필요한 안건 자동 선별  
- approval queue에 pending 상태로 저장  
- 승인/보류/폐기 처리 가능  
- 대표보고서와 주간브리프에도 승인 대기 안건 반영

현재 사용 가능한 명령:

- `승인대기`  
- `승인대기 10`  
- `승인 APR-실제ID : 메모`  
- `보류 APR-실제ID : 메모`  
- `폐기 APR-실제ID : 메모`

주의:

- 승인 루프 고도화(우선순위 기반 `승인대기` 정렬, `승인대기요약`, `approval_key`/alias 파싱, Slack 버튼 승인 UX)는 **1차 구현이 완료**되었다.  
- 다만 버튼/토큰 파싱 edge-case와 UX 미세조정은 후속으로 다듬는다.

---

## 7. 이번 세션에서 완료된 구조 리팩터링

이번 세션에서 가장 중요한 변화는 **모듈 분리 1라운드 완료**다.  
원래 단일 파일 `app.js`에 몰려 있던 기능을 기능별 모듈로 분리했고, 대표 테스트 기준으로 정상 작동까지 검증했다.

### 7.1 완료된 분리 단계

#### Patch 1. Storage layer 분리

신규/변경 파일:

- `app.js`  
- `src/storage/paths.js`  
- `src/storage/jsonStore.js`  
- `src/storage/channelContext.js`

분리 내용:

- 데이터 파일 경로 정의  
- 저장소 초기화  
- JSON read/write/append/recent  
- channel context read/write/get/set/clear

검증 상태:

- 정상 작동 확인 완료

#### Patch 2. Approvals 모듈 분리

신규/변경 파일:

- `app.js`  
- `src/features/approvals.js`

분리 내용:

- `getPendingApprovals`  
- `upsertApprovalRecord`  
- `parseApprovalAction`  
- `updateApprovalStatus`  
- `formatPendingApprovals`  
- `formatApprovalUpdate`

중요:

- 과거 `parseApprovalAction` 중복 선언 이슈 재발 없이 정리 완료

검증 상태:

- 정상 작동 확인 완료

#### Patch 3. Briefs 모듈 분리

신규/변경 파일:

- `app.js`  
- `src/features/briefs.js`

분리 내용:

- `initBriefs`  
- `buildDecisionHighlights`  
- `buildLessonHighlights`  
- `buildRiskHighlights`  
- `buildWeeklyBrief`  
- `buildExecutiveReport`

검증 상태:

- 정상 작동 확인 완료

#### Patch 4. Agent pipeline 분리

신규/변경 파일:

- `app.js`  
- `src/agents/schemas.js`  
- `src/agents/callJson.js`  
- `src/agents/hints.js`  
- `src/agents/router.js`  
- `src/agents/primary.js`  
- `src/agents/risk.js`  
- `src/agents/reportComposer.js`  
- `src/agents/index.js`

분리 내용:

- `ROUTER_SCHEMA`  
- `PRIMARY_SCHEMA`  
- `routeTask`  
- `runPrimaryAgent`  
- `runRiskAgent`  
- `deriveDecisionState`  
- `composeFinalReport`

검증 상태:

- 정상 작동 확인 완료

#### Patch 5. Slack handlers 분리

신규/변경 파일:

- `app.js`  
- `src/slack/eventDedup.js`  
- `src/slack/reply.js`  
- `src/slack/registerHandlers.js`

분리 내용:

- `processedEvents` / `EVENT_TTL_MS`  
- `cleanupProcessedEvents`  
- `getEventKey`  
- `shouldSkipEvent`  
- `stripMention`  
- `replyInThread`  
- `app_mention` handler  
- `message` handler

검증 상태:

- 채널 멘션 / DM 모두 정상 작동 확인 완료

#### Patch 6. Work OS + Execution Adapter Bridge

신규/변경 파일:

- `app.js`  
- `src/features/workItems.js`  
- `src/features/workRuns.js`  
- `src/adapters/cursorAdapter.js`  
- `src/adapters/index.js`

분리/강화 내용:

- `work item`(해야 할 일) / `work run`(실행 단위) 분리로 실행 추적 기반 마련  
- tool별 dispatch payload 생성(특히 Cursor 패킷)과 Slack 복붙 운영 흐름 표준화  
- `커서발행` / `결과등록` / `결과검토` / `결과승인` / `결과반려` / `막힘등록`으로 run lifecycle 관리  
- Cursor 결과를 `parseResultIntake`로 구조화하고 `qa_checklist`/`qa_status`를 업데이트하는 QA gate 도입

검증 상태:

- 실행/결과 intake/QA gate 핸들러들이 동작하는 것 확인

#### Patch 7. Hosted Deployment v1 + Integration Readiness Profiles

신규/변경 파일:

- `src/storage/environmentProfiles.js`  
- `src/storage/environmentContext.js`  
- `src/storage/repoRegistry.js` / `src/storage/supabaseRegistry.js`(env-aware lookup 확장)  
- `src/runtime/health.js`(hosted/storage readiness 포함)  
- `app.js`(환경프로필설정/배포준비점검/연동프로필요약 명령 핸들러)

분리/강화 내용:

- `dev / staging / prod` 환경 프로필 레지스트리 + 채널별 env context 도입  
- project/env 조합을 기준으로 repo/db를 resolve하는 lookup 규칙 강화  
- `배포준비점검`/`연동프로필요약` 결과를 health/env 점검 출력과 함께 노출(단, 실제 hosted apply는 이번 범위 밖)

검증 상태:

- `상태점검` / `환경점검` / `배포준비점검` 출력에 env profile + repo/db + hosted readiness 표시 확인

#### Patch 8. Supabase Storage Migration Prep + Dual Store Layer

신규/변경 파일:

- `src/storage/core/*`(storeFactory/adapter/types/index/migrateJsonToSupabase)  
- `src/storage/core/supabaseStoreAdapter.js`(이번 단계는 stub/준비)  
- `src/runtime/health.js`(storage mode/migration readiness 포함)  
- `app.js`(저장소모드/저장소점검/마이그레이션계획/저장소요약 명령 핸들러)  
- `docs/SUPABASE_STORAGE_PLAN.md`(테이블/관계/마이그레이션 순서 초안)

분리/강화 내용:

- storage abstraction 공통 인터페이스 도입(JSON adapter + Supabase adapter 스텁)  
- `STORAGE_MODE=json|dual|supabase` 모드 스위치 기반의 dual-store 준비 구조 구현  
- 기존 JSON 저장소는 fallback/migration source로 유지  
- `migrateJsonToSupabase` 유틸의 dry-run 계획 생성으로 운영 전환 전에 준비 상태를 진단

검증 상태:

- 모듈 import/lint 통과 및 storage diagnostic 명령들이 동작하는 것 확인

### 7.2 리팩터링 1라운드 결과

현재 `app.js`는 사실상 아래 역할만 맡는다.

- 환경변수 체크  
- Slack app 생성  
- OpenAI client 생성  
- 모듈 init / wiring  
- `registerHandlers(...)` 호출  
- `app.start()` 실행

즉, 원래 handoff 문서가 목표로 두었던 **“app.js를 오케스트레이션 엔트리포인트로 축소”**는 사실상 1라운드 완료 상태다.

---

## 8. 현재 명령어 목록

### 일반

- `도움말`  
- 일반 자연어 질문

### 기록

- `결정기록: ...`  
- `교훈기록: ...`  
- `최근결정`  
- `최근결정 10`  
- `최근교훈`  
- `최근교훈 10`

### 채널 설정

- `채널설정: general_cos`  
- `채널설정: strategy_finance`  
- `채널설정: ops_grants`  
- `채널설정: product_ux`  
- `채널설정: engineering`  
- `채널설정: risk_review`  
- `현재채널설정`  
- `채널설정해제`

### 브리프/보고

- `주간브리프`  
- `주간브리프 14`  
- `대표보고서`  
- `대표보고서 14`  
- `이번주핵심결정`  
- `이번주핵심교훈`  
- `이번주리스크`

### 승인

- `승인대기`  
- `승인대기 10`  
- `승인 APR-... : 메모`  
- `보류 APR-... : 메모`  
- `폐기 APR-... : 메모`

### 상태/환경/배포
- `상태점검`  
- `환경점검`  
- `환경프로필설정: dev | staging | prod`  
- `현재환경프로필`  
- `환경프로필해제`  
- `배포준비점검`  
- `연동프로필요약`

### 저장소/마이그레이션(진단용)
- `저장소모드`  
- `저장소점검`  
- `저장소비교`
- `마이그레이션계획`  
- `저장소요약`

### 멀티 페르소나(협의)
- `협의모드: <질문>`  
- `협의모드 strategy,product,engineering: <질문>`  
- `매트릭스셀: <질문>`  
- `관점추가 risk: <질문>`

### 업무(Work Items)
- `업무등록: <자유 텍스트>`  
- `업무대기` / `업무대기 10`  
- `업무상세 <work_id|번호>`  
- `업무승인 <work_id|번호>`  
- `업무보류 <work_id|번호>`  
- `업무취소 <work_id|번호>`  
- `업무완료 <work_id|번호>`  
- `업무실패 <work_id|번호>`  
- `업무배정 <work_id|번호> <persona_or_tool>`  
- `업무요약` / `업무요약 <project_key>`  
- `프로젝트설정: <project_key>` / `현재프로젝트설정` / `프로젝트설정해제`

### 실행/결과(Work Runs)
- `업무발행 <work_id|번호>`  
- `커서발행 <work_id|번호>`  
- `실행대기` / `실행중` / `실행실패`  
- `실행상세 <run_id|번호>`  
- `업무진행 <work_id|번호>` / `업무검토 <work_id|번호>`  
- `업무차단 <work_id|번호> <사유>` / `업무재개 <work_id|번호>`  
- `업무재발행 <work_id|번호>`  
- `결과등록 <run_id|번호>: <자유 텍스트>`  
- `결과검토 <run_id|번호>`  
- `결과승인 <run_id|번호>`  
- `결과반려 <run_id|번호> <사유>`  
- `막힘등록 <run_id|번호> <사유>`

---

## 9. 현재 파일 구조 개요

### 현재 핵심 구조

```text
app.js
src/
  agents/
    callJson.js
    hints.js
    index.js
    primary.js
    reportComposer.js
    risk.js
    router.js
    schemas.js
  features/
    approvals.js
    briefs.js
  slack/
    eventDedup.js
    registerHandlers.js
    reply.js
  storage/
    channelContext.js
    projectContext.js
    environmentProfiles.js
    environmentContext.js
    core/
      index.js
      storeFactory.js
      jsonStoreAdapter.js
      supabaseStoreAdapter.js
      supabaseClient.js
      migrateJsonToSupabase.js
      types.js
    jsonStore.js
    paths.js
data/
  approval-queue.json
  channel-context.json
  project-context.json
  environment-profiles.json
  environment-context.json
  decision-log.json
  interaction-log.json
  lessons-learned.json
  work-items.json
  work-runs.json
  automation-settings.json
  repo-registry.json
  supabase-registry.json
```

### 현재 구조적 의미

- `storage/` = 파일 경로/JSON 저장/채널 컨텍스트 + Supabase 전환 대비 storage abstraction  
- `features/` = 승인 / 브리프 도메인 로직  
- `agents/` = router / primary / risk / report composition  
- `slack/` = Slack 진입부, dedup, reply

즉, **기능별 책임 분리는 1차 완료** 상태다.

---

## 10. 현재 데이터 구조 개요

### 10.1 decision-log.json

저장 목적:

- 대표가 채택한 판단과 반대 논리를 구조적으로 누적

대표 필드 예시:

- `id`  
- `created_at`  
- `title`  
- `adopted_option`  
- `strongest_objection`  
- `next_actions`  
- `tags`  
- `source`  
- `channel_context`

### 10.2 lessons-learned.json

저장 목적:

- 실패/성공 후 교훈 저장

대표 필드 예시:

- `id`  
- `created_at`  
- `title`  
- `what_worked`  
- `what_failed`  
- `what_to_change_next_time`  
- `future_trigger`  
- `tags`

### 10.3 interaction-log.json

저장 목적:

- 일반 질의 및 내부 라우팅/에이전트 결과 기록

대표 필드 예시:

- `id`  
- `created_at`  
- `user_text`  
- `source`  
- `channel_context`  
- `route`  
- `primary`  
- `risk`  
- `approval_id`  
- `decision_needed`

### 10.4 channel-context.json

저장 목적:

- Slack channel ID별 기본 역할 저장

형태:

```json
{
  "C123456": "strategy_finance",
  "C999999": "risk_review"
}
```

### 10.5 approval-queue.json

저장 목적:

- 대표 승인 필요 안건 관리

현재 대표 필드 예시:

- `id`  
- `status` (`pending`, `approved`, `on_hold`, `rejected`)  
- `created_at`  
- `resolved_at`  
- `title`  
- `question`  
- `recommendation`  
- `strongest_objection`  
- `key_risks`  
- `next_actions`  
- `source`  
- `channel_context`  
- `resolution_note`

주의:

- `priority_score`, `channel_sensitivity`, `priority_reasons`, `approval_key`, alias context 등은 아직 들어가지 않았다.

---

## 11. 지금까지 확인된 주요 이슈와 해결 이력

### 이슈 1. Slack 앱은 반응하는데 답변이 안 나옴

원인:

- OpenAI API billing / quota 부족 (`insufficient_quota`)

해결:

- OpenAI Platform Billing 충전 후 정상화

### 이슈 2. 직접 대화창에서 조용하고 채널에서는 에러 표시

원인:

- DM 경로 에러 처리 시 Slack 메시지 반환 누락

해결:

- 에러를 DM에도 표시하도록 수정

### 이슈 3. decision log 두 번 저장

원인:

- Slack 이벤트 중복 처리 방어 없음

해결:

- `event_id` 기반 deduplication 추가

### 이슈 4. 채널설정 명령이 채널에서 안 먹음

원인:

- 현재 구조가 `app_mention` 기반이라 멘션 없는 일반 채널 메시지를 수신하지 않음

해결/판단:

- 현재는 `@G1 COS 채널설정: ...` 형태로 사용  
- 향후 일반 채널 메시지 수신 확장은 별도 과제

### 이슈 5. approval queue 도입 후 SyntaxError

원인:

- `parseApprovalAction` 함수 중복 선언

해결:

- approvals 모듈 분리 시 중복 선언 완전 제거

---

## 12. 현재 사용법 권장 운영 방식

### 12.1 G1 COS 직접 채팅창(Messages tab)

용도:

- 기능 테스트  
- 대표 전용 질문  
- 주간브리프  
- 대표보고서  
- 최근결정/최근교훈 조회

즉, **개인 비서실**처럼 사용

### 12.2 Slack 채널

용도:

- 실제 운영 테스트  
- 채널별 역할 부여  
- 팀 운영 공간  
- 채널 설정 기반 답변 실험  
- decision / lesson 기록 남기기

즉, **전투실/운영실**처럼 사용

---

## 13. 현재 상태 진단

### 13.1 무엇이 완료되었는가

- Slack 연결  
- COS 응답  
- Router + Primary + Risk 파이프라인  
- decision / lesson / interaction logs  
- event deduplication (`event_id`; 기본 메모리 — 멀티 인스턴스 시 `SLACK_EVENT_DEDUP_FILE` 옵트인)  
- channel context  
- environment profile context(`환경프로필설정`)  
- work management layer(업무등록/업무대기/업무발행/커서발행/결과등록/QA gate)  
- multi-persona 1차 council(`협의모드`) + matrix cell(`매트릭스셀`)  
- hosted deployment readiness(`배포준비점검`, `연동프로필요약`) + 상태/환경점검 출력 연동  
- storage abstraction/dual-store 준비(`STORAGE_MODE`, JSON/Supabase 공통 인터페이스) + Supabase migration dry-run 진단 명령  
- weekly brief / executive report  
- approval queue 기본형  
- **모듈 분리 1라운드 완료**

### 13.2 무엇이 아직 미완성인가

- 스케줄러 기반 “자동 푸시” 브리프 미구현(수동/운영 트리거는 존재)  
- multi-persona/​council 품질 튜닝 2차(비용/정확도/표현 품질, 룰 정밀도)  
- matrix cell 자동 발동은 휴리스틱 기반 1차가 있으며 threshold/precision 튜닝은 추가  
- 일반 채널 메시지 수신 확장 미구현  
- 배포형 상시 실행 미구현  
- Supabase “system of record” 전면 전환(read/write 및 프로덕션 마이그레이션)은 미구현(현재는 core 5개 live dual-write v1, 나머지는 JSON 유지)

### 13.3 현재 시스템의 정확한 성격

현재 시스템은 **“멀티페르소나 지향 COS 시스템의 운영 가능한 초기형”**이다.  
즉, 아래는 이미 가능하다.

- COS가 대표 단일 진입점 역할 수행  
- router가 문맥에 맞는 담당축을 고름  
- primary agent가 본안 작성  
- risk agent가 반대/리스크 검토  
- 결과가 보고 형식으로 합성됨

하지만 아래는 아직 아니다.

- 여러 기능 에이전트 병렬 호출/합성은 1차 구현이 되어 있으나, agent 조합/표현 품질 튜닝은 추가가 필요  
- 조건 기반 matrix cell 자동 소집은 휴리스틱 기반 1차가 구현되어 있으나, 임계값/분기 정밀도는 후속 개선  
- 업무 이벤트를 자동으로 감지하고 스스로 주기적 보고를 밀어주는 운영형 assistant

---

## 14. 다음 개발 우선순위

**Historical implementation notes — not next-patch authority. Alignment wins.**

이제부터는 **기능 개발 2라운드**다.

### Priority 1. 승인 루프 고도화(1차 반영)

현재 approval queue는 1차 고도화가 반영되어 대표 실사용형에 가깝게 동작한다.  
남은 작업은 edge-case 회귀 테스트와 UX 미세조정이다.

1차 반영 범위:

- `priority_score`  
- `channel_sensitivity`  
- `priority_reasons`  
- `승인대기` 정렬 개선  
- `승인대기요약` 명령  
- 승인 시 decision-log 자동 연결  
- 보류/폐기 시 lessons-learned 자동 연결  
- 짧은 `approval_key` 도입  
- alias 기반 승인 처리  
- 가능하면 Slack 버튼 승인 UX 추가  
- 기존 텍스트 fallback 유지

현재 상태는 핵심 UX를 포함한 “대표 실사용형”에 근접해 있다.  
후속으로 정책 다듬기/호환성 회귀를 지속한다.

### Priority 2. 아침 브리프 / 저녁 정리 / 주간 회고 자동화

후보:

- `아침브리프`  
- `저녁정리`  
- `주간회고`  
- `승인대기요약` 자동 푸시

중요:

- 자동화는 approval queue 품질을 먼저 올린 뒤 들어가는 것이 맞다.

### Priority 3. 진짜 기능별 멀티페르소나 심화

현재는 `협의모드`/`매트릭스셀` 중심으로 council+병렬 persona 호출 1차가 구현되어 있다.
다음 목표는 persona 선택/룰 정밀도(특히 matrix threshold)와 cost/latency를 더 줄이면서 dissent(unresolved tension) 품질을 올리는 것이다.

### Priority 4. Matrix Cell 자동 발동

조건 예시:

- 세 개 이상 기능이 얽힘  
- 돈 + 브랜드 + 일정이 동시에 중요  
- 대외 제출/외부 발신 안건  
- 반대가 강하게 남아 있는 안건

이 조건을 포함한 휴리스틱 기반 **matrix cell 자동 발동 1차**가 동작한다.  
다음은 임계값/분기 정밀도와 reason 안정화다.

### Priority 5. Slack 일반 채널 메시지 수신 확장

필요 조건:

- Slack 앱 범위에 `channels:history` 추가  
- 이벤트에 `message.channels` 추가  
- 일반 채널 메시지 처리 핸들러 추가  
- 자기 자신/잡담 노이즈 방지 설계

현재는 멘션 기반이 안전하다.

### Priority 6. 배포형 전환

향후 목표:

- Render / Railway / Fly.io / 기타 상시 실행 환경  
- 환경변수/비밀키 관리  
- 로그 수집  
- 재시작 안정성  
- 파일 저장 방식 재검토

현재는 실제 “상시 실행/전환 apply”는 범위 밖이지만, 환경 프로필/채널 context와 `배포준비점검`, `연동프로필요약`, `상태점검/환경점검` 출력에 hosted readiness 및 storage 정보를 함께 노출하도록 준비했다.

### Priority 7. JSON 저장소 → 진짜 저장소 전환
현 저장 구조는 `data/*.json` 기반(JSON)이며, Supabase 전환을 **중단 없이** 진행하기 위한 storage abstraction/dual-store 준비를 확장했다.

- 이번 패치(1차 live): `supabase/migrations/20260319_g1cos_live_core_tables.sql`로 core 5개 테이블(`g1cos_work_items`, `g1cos_work_runs`, `g1cos_approvals`, `g1cos_project_context`, `g1cos_environment_context`)을 실제 생성했고,
  `STORAGE_MODE=dual`에서 dual-write v1을 core 5개에 한해 실제 수행한다.
- 새 저장 계층: `src/storage/core/*` (공통 인터페이스 뒤로 JSON/Supabase adapter를 숨김)
- 진단/검증 명령(슬랙 수동): `저장소모드`, `저장소점검`, `저장소비교`, `마이그레이션계획`, `저장소요약`

향후 전환 단계(범위 밖):
- JSON-only 컬렉션(`decisions`, `lessons`, `interactions`, `repo_registry`, `supabase_registry`, `automation_settings`)은 아직 Supabase 테이블이 없으므로 JSON 우선 유지
- 위 컬렉션에 테이블 추가/인덱스 설계 후 dual-write 범위를 단계적으로 확장
- `migrateJsonToSupabase`를 staged 방식(dry-run -> 부분 적용)으로 실행/검증
- collection 단위 coverage/무결성 검증 후 dev → staging → prod 순서로 최종 전환

우선순위는 “배포형 전환(운영 안정화) + 저장소 전환(단계적)”을 동시에 고려한다. 즉, 배포 직후에도 JSON fallback이 유지되는 구조가 목표다.

---

## 15. 멀티 페르소나 에이전트는 언제부터 “진짜로 일하는가”

**Historical implementation notes — not next-patch authority. Alignment wins.**

### 현재 상태

**부분적으로는 이미 일하고 있다.**

정확히는:

- Router가 안건을 분류한다.  
- Primary agent가 본안 담당을 한다.  
- Risk agent가 반대와 리스크를 검토한다.  
- COS가 최종 보고 형식으로 합성한다.

즉, **초기형 multi-persona**는 이미 작동 중이다.

### 하지만 아직 아닌 것

아래는 “시작”이 아니라 “정교화/확장” 단계다.

- Strategy / Finance / Ops / Product / Engineering / Risk 등 축별 multi-persona 참여는 1차 구현이 되어 있으며, agent 조합/표현 품질 튜닝이 추가로 필요하다.  
- COS의 conflict synthesis 및 dissent/unresolved tension 구조는 수행되며, 표현 품질만 더 다듬는다.  
- 안건 성격에 따라 자동으로 3인/4인/5인 cell로 확장되는 규칙은 휴리스틱 기반 1차가 제공되며 threshold/precision 튜닝이 남아 있다.

### 따라서 진짜 멀티페르소나 refinement 시점

**이제 핵심은 quality/cost/정확도 튜닝이다.**  
즉, 모듈 분리 이후 “운영 가능한 1차”는 이미 돌아가고 있고, 다음 단계는 대표 실사용형 완성으로 끌어올리는 것이다.

다만 현실적으로는 아래 두 가지 경로가 있다.

#### 경로 A. 대표 실사용 우선

1. 자동화 브리프 자동 푸시(스케줄러 기반)  
2. hosted 전환/apply 연결  
3. 그 다음 저장소 안정화(Supabase staged migration 실행)

장점:

- 대표가 당장 매일 쓸 수 있는 운영 효율이 빨리 올라간다.

#### 경로 B. 멀티페르소나 시연 우선

1. multi-persona 2차 정교화(quality/cost/edge-case)  
2. matrix cell precision 튜닝(임계값/분기/근거 reason 안정화)  
3. knowledge steward memory 품질 고도화  
4. 그 다음 자동화/hosted 전환 경로 안정화

장점:

- “진짜 multi-persona AI 조직” 시연이 빨리 가능하다.

현재 대표님의 목적이 **실운영 효율**이라면 경로 A가 더 합리적이다.

---

## 21. Supabase Live Smoke Test (Dual Write v1)

### 실행 커맨드
- `node scripts/storage-smoke-test.js --collection project_context`
- `node scripts/storage-smoke-test.js --collections work_items,work_runs,approvals,project_context,environment_context --cleanup`

### 결과 요약
- `json` adapter 흐름: PASS
- `supabase` adapter 흐름: PASS
- `compare`(JSON vs Supabase 샘플): PASS (sample mismatch 없음)
- 결론: `.env` 기준 Supabase 연결 및 1차 live core 5개 컬렉션(`g1cos_work_items`, `g1cos_work_runs`, `g1cos_approvals`, `g1cos_project_context`, `g1cos_environment_context`)의 dual-write v1 동작이 확인됨

### 참고/주의
- 이 테스트는 지정된 core 컬렉션 5개에 한정된 smoke test다.
- 대량 데이터/동시성/추가 컬렉션(예: `decisions/lessons/interactions` 등)은 별도 검증이 필요하다.

---

## 22. E2E Thin Slice 재정렬 (Slack Front Door 기준)

**Historical implementation notes — not next-patch authority. Alignment wins.**

### 22.1 최종 제품 목표 (디렉티브 정본; 본 절은 구현 로드맵 요약)
- Slack이 단일 front door 역할을 수행한다.
- 자연어 요청 intake -> planner가 구조화 -> multi-agent 협업 -> approval/risk gate -> Cursor/GitHub 실행 -> 결과 회수/감사 가능 상태 저장까지 닫는다.

### 22.2 현재 위치 vs 최종 목표 vs gap
- 현재 위치(이미 있음): approval/work/run, bridges(Cursor/GitHub/Supabase), context(project/env), automation foundation, storage abstraction+dual-write core live.
- 최종 목표(아직 미닫힘): Slack 자연어 요청이 planner를 거쳐 외부 실행 artifact와 review/revise/done closure까지 일관되게 이어지는 운영형 루프.
- 핵심 gap:
  - planner/intake 정규화 계층
  - GitHub live artifact loop closure
  - Cursor patch/result loop closure
  - multi-agent state machine 명시화
  - review/revise/done closure

### 22.3 빌드 원칙(운영 우선)
- destructive/approval/deploy 계열은 deterministic command/guard를 기본으로 한다.
- read/query/summarize 계열은 자연어 허용 범위를 점진 확대한다.
- “일반화”보다 “one thin slice closure”를 먼저 닫는다.

### 22.4 Milestone 1 — GitHub Live E2E Thin Slice
- 목표: dev sandbox repo에서 최소 1개 GitHub artifact(issue/branch/PR) loop를 닫는다.
- 포함:
  - repo target config 고정
  - work_item <-> GitHub artifact 링크 저장
  - status 회수 및 중복/실패 최소 가드
- 완료 기준:
  - work item 1건이 최소 1개 실 artifact로 이어짐
  - artifact 링크가 work_item/work_run에서 조회 가능

### 22.5 Milestone 2 — Cursor Execution Loop Closure
- 목표: work item -> Cursor spec/payload -> 결과 ingest -> qa/review 상태 반영을 닫는다.
- 포함:
  - Cursor handoff payload 표준
  - result ingestion + qa/review status update
  - 실패 시 retry/human escalation 기준
- 완료 기준:
  - 1개 작업이 spec 생성 -> patch/result 회수 -> run/work 상태 업데이트까지 종료

### 22.6 Milestone 3 — Slack Intake -> Planner -> Work Breakdown
- 목표: 자연어 요청을 planner가 canonical structured work로 변환한다.
- 포함:
  - intake normalization
  - goal/scope/output extraction
  - subtask generation
  - risk/approval tag
  - project/env binding
- 완료 기준:
  - 자연어 요청 1건이 structured plan + work items + approval need 판단으로 변환

### 22.7 상태기계 초안 (v0)
- 상태: `intake -> clarified -> planned -> approval_needed -> approved -> dispatched -> cursor_in_progress/github_in_progress -> review_pending -> revise_needed -> done -> archived`
- 각 상태 정의 요소:
  - entry condition
  - exit condition
  - required fields
  - linked artifacts(issue/branch/PR/patch/result)
  - failure path(retry/escalation/rollback note)
- 현재 코드 매핑:
  - 있음: `approved/dispatched/review/done/blocked` 중심의 work/run 상태 흐름
  - 부족: `intake/clarified/planned/revise_needed/archived`의 명시적 lifecycle/전이 규칙

### 22.8 이번 단계에서 의도적으로 제외
- 자연어 alias 대량 확장
- health/env/storage UX polish
- hosted deployment 자동화
- prod rollout
- broad multi-project support
- full natural language freedom

### 22.9 dev sandbox 운영 준비 체크리스트
- dev sandbox GitHub repo 준비
- GitHub auth/app/token strategy 확정
- branch naming rule 고정
- PR/issue linking convention 정의
- Cursor handoff location/format 고정
- Slack entrypoint command/trigger 확정
- required env vars 점검
- artifact link persistence 점검
- retry/error logging 점검
- handoff update flow 점검

### 22.10 다음 세션에서 바로 이어질 액션 1개
- **Milestone 1( GitHub Live E2E Thin Slice ) 구현 패치 1회**: dev sandbox repo 대상으로 work_item -> issue/branch/PR 중 1개 실 artifact를 생성하고, work_item/work_run에 링크를 영속 저장해 조회까지 닫는다.


## 16. 지금으로부터 “바로 업무 투입 가능한 완성 단계”까지 남은 작업

**Historical implementation notes — not next-patch authority. Alignment wins.**

이 질문은 두 가지 수준으로 나눠서 보는 것이 정확하다.

### Level 1. 대표 실사용형 완성

정의:

- 대표가 매일 Slack 안에서 안정적으로 쓰고  
- 승인/보류/폐기 UX가 번거롭지 않고  
- 요약/브리프가 자동으로 밀려오고  
- 시스템이 운영 비서실처럼 작동하는 상태

남은 필수 작업:

1. 자동화 브리프 자동 푸시(스케줄러 기반)  
2. 배포형 전환: 실제 hosted 전환/apply 연결  
3. 저장소 안정화: Supabase 중심 staged migration 실행(실 read/write 포함)

즉, **크게 3개 작업 묶음**이 남아 있다.

### Level 2. 진짜 멀티페르소나 조직형 완성

정의:

- 복수의 기능 에이전트가 같은 안건에 병렬로 들어와  
- 서로 다른 관점을 내고  
- COS가 합성하고  
- 승인/기록/회고/자동화까지 하나의 조직 루프로 도는 상태

남은 필수 작업:

1. multi-persona 2차 정교화(규칙/비용/edge-case synthesis polish)  
2. matrix cell precision 튜닝(임계값/분기/근거 reason 안정화)  
3. 저장소 안정화(Supabase system-of-record 실행)  
4. 배포형 전환 hosted 전환/apply 연결 고도화

즉, **크게 4개 작업 묶음**이 남아 있다.

### 체감 난이도 기준으로 보면

- 이미 끝난 것: 구조 정리  
- 바로 다음 핵심: 승인 루프 UX / 자동 연결  
- 진짜 멀티페르소나의 핵심 본체: orchestration + persona packs  
- 운영 완성의 핵심: 자동화 + 배포

정리하면,

- **“multi-persona refinement”는 지금 바로다.**  
- **“대표 실사용형 완성”까지는 3개 큰 묶음**  
- **“진짜 조직형 완성”까지는 4개 큰 묶음**

---

## 17. 다음 창에서 바로 이어서 해야 할 작업 제안

**Historical implementation notes — not next-patch authority. Alignment wins.**

가장 추천하는 순서:

1. 이 handoff 문서를 읽고 현재 상태 재확인  
2. 현재 모듈 구조와 `data/*.json` 파일 구조 확인  
3. **저장소 안정화 + 자동화 “자동 푸시” 설계**부터 착수  
4. 회귀 테스트

회귀 테스트 항목:

- 일반 질문  
- 결정기록  
- 교훈기록  
- 최근결정/최근교훈  
- 채널설정/현재채널설정  
- 주간브리프/대표보고서  
- 승인대기/승인/보류/폐기

5. 이후  
   - 경로 A: 자동화 브리프 자동 푸시 → hosted 전환/apply → 저장소 안정화(실 read/write)  
   - 경로 B: multi-persona 2차 정교화 → matrix cell precision → 자동화/배포

---

## 18. 새 창 첫 프롬프트 추천

**Historical implementation notes — not next-patch authority. Alignment wins.**

새 대화에서 아래 취지로 시작하면 좋다.

- 이 handoff 문서를 읽고 현재 시스템 상태를 정확히 요약하라  
- 현재 모듈 구조를 기준으로 storage migration 실행(dual/supabase) 단계를 설계하라  
- 동시에 자동화 브리프 “자동 푸시” 스케줄러(운영 안전)까지 같이 반영하라  
- 기존 기능을 깨지 않는 회귀 테스트 항목을 함께 제시하라

멀티페르소나를 바로 우선할 경우에는 아래 취지로 시작한다.

- 이 handoff 문서를 읽고 multi-persona 2차 정교화(quality/cost/edge-case) 설계를 제안하라  
- matrix cell precision 튜닝 기준(임계값/근거 reason)을 규칙화하라  
- knowledge steward memory 품질(최근 기록 요약 규칙)도 함께 고도화하라

---

## 19. 버전 상태 요약

### 현재 운영 기능 버전

**G1 COS v6 (기능 기준)**

### 현재 코드 구조 상태

**모듈 분리 1라운드 완료**

### 대표 테스트 기준 상태

- 채널 멘션 정상  
- DM 정상  
- 브리프/보고 정상  
- approval queue 정상  
- 리팩터링 후 회귀 테스트 정상

### 현재 가장 분명한 다음 병목

- 자동화 자동 푸시(스케줄러) 부재  
- Supabase system-of-record 전환 실행 미완성(실 read/write + staged migration)  
- hosted 전환/apply 연결 미완성  
- multi-persona/approval UX는 1차 구현이 있으며 2차 정교화/edge-case 안정화가 추가로 필요

---

## 20. 마지막 메모

**Historical implementation notes — not next-patch authority. Alignment wins.**

지금까지의 방향은 맞다.  
특히 이번 세션에서 **구조 정리 1라운드가 끝난 것**이 가장 큰 진전이다.

이제부터는 더 이상 `app.js` 비대화 문제에 발목 잡히지 않아도 된다.  
다음 핵심은 아래 둘 중 하나다.

- 대표 실사용 효율을 먼저 올리는 **자동화 자동 푸시 + hosted 전환/apply + Supabase 저장소 안정화**  
- 진짜 AI 조직 시연을 먼저 만드는 **multi-persona 2차 정교화 + matrix precision 경로**

현재 대표님의 사용 맥락상, 우선 추천은 다음과 같다.

**자동화 브리프 자동 푸시 → hosted 전환/apply 연결 → Supabase staged migration 실행 → multi-persona 2차 정교화**

이 문서는 그 다음 단계의 출발점이다.

---

## 23. Milestone 1 Phase 1a - GitHub Issue Thin Slice

**Historical implementation notes — not next-patch authority. Alignment wins.**

### 23.1 구현 범위 (완료)

- 범위를 `work_item -> GitHub issue 생성 -> artifact 영속 저장 -> 재조회/중복방지`로 제한해 first loop를 닫았다.
- PR/branch 자동화, planner/intake, hosted 자동화는 의도적으로 제외했다.

### 23.2 이번 패치에서 추가/변경된 핵심

- **Phase 1a 인증: Fine-grained PAT 우선** (ChatGPT 작업지시서 기준)
  - 권장 env: `GITHUB_FINE_GRAINED_PAT` (Issues + 대상 repo 권한)
  - 호환: `GITHUB_TOKEN` (PAT/클래식 토큰 등, 동일 용도로 사용 가능)
  - **폴백**: PAT가 없을 때만 GitHub App installation token (`GITHUB_APP_ID`, `GITHUB_APP_PRIVATE_KEY`, `GITHUB_APP_INSTALLATION_ID`)
  - App 토큰은 lazy refresh + 만료 버퍼(1분) 캐시
  - **토큰·키는 로그에 절대 노출하지 않음**
- 고정 repo 운영 예: `GITHUB_DEFAULT_OWNER=G1ART`, `GITHUB_DEFAULT_REPO=slack_cos` (registry보다 env default가 나을 때 resolve)
- **결정형 명령**: `이슈발행`을 1순위, `깃허브발행`은 동일 동작 alias
  - repo resolve 실패 / auth 실패 / GitHub API 실패 / **저장소(로컬) persistence 실패** 메시지를 구분
- 중복 방지(idempotency): 동일 work + 동일 repo에 issue artifact가 있으면 **신규 생성 없이** API로 state 갱신 후 기존 링크 반환
- artifact 필드(요약): `provider`, `artifact_type`, `repo_owner`, `repo_name`, `issue_number`, `issue_id`, `issue_url`, **`state`**, **`created_at`**, **`updated_at`**, `sync_status`
- `work_run.github_issue_artifact`에 동일 스냅샷 저장 → `실행상세`에서 issue 링크·state 확인 가능
- `깃허브상세` 성공 시 live issue로 artifact를 merge해 `work_item`에 다시 저장(`sync_status: synced`)

### 23.3 새/강화 명령어

- `깃허브점검` (read-only 진단)
- `이슈발행 <work_id|번호>` (권장)
- `깃허브발행 <work_id|번호>` (`이슈발행`과 동일)
- `깃허브상세 <work_id|run_id|번호>`

### 23.4 run/work 상태 반영 규칙

- 발행 시 run 생성: `dispatched -> running`
- issue 생성 성공:
  - run: `done`, `github_status=opened` (또는 duplicate면 `linked_existing`)
  - run에 `result_link`, **`github_issue_artifact`** 저장
  - work: `in_progress`로 전환
- issue API 실패: run `failed`, work `blocked`, 응답에 `[auth]` / `[github_api]` 등 분류
- **저장 실패**(GitHub에는 생성됐으나 JSON/dual-write 기록 실패): run `blocked`, `github_status=persist_failed`, 응답에 issue URL 안내

### 23.5 issue body 템플릿(정형)

- `brief`
- `project_key`, `work_id`, `priority`, **`owner_type`**, `assigned_persona`, `assigned_tool`, `approval_status`, `work_type`
- requested outcome (`acceptance_criteria`)
- Slack source context (`source_channel`, `source_message_ts`, 요청자)
- internal tracking (`provider/artifact_type/work_item_id/work_run_id`)

### 23.6 운영 주의사항

- Fine-grained PAT는 **대상 repo에 Issues 읽기/쓰기** 및 필요 시 **Metadata** 등 권한이 맞는지 확인
- `GITHUB_APP_PRIVATE_KEY`는 App 폴백 시에만 필요; 멀티라인 PEM 또는 `\n` 이스케이프
- repo key가 `owner/repo` 형태가 아니면 `GITHUB_DEFAULT_OWNER` + 짧은 repo 이름 조합 또는 env default로 resolve
- 이 단계는 **단일 dev sandbox repo** 중심 thin slice; broad multi-project는 Phase 이후

### 23.7 검증 체크리스트 (Phase 1a)

1. work item 1건 생성 후 `이슈발행 <work_id>` 실행
2. `G1ART/slack_cos`(또는 설정된 repo)에 실제 issue 1건 생성 확인
3. `업무상세` / `실행상세`에서 `issue_url`, `state` 확인
4. 동일 명령 재실행 시 duplicate guard(신규 미생성) 확인
5. `깃허브상세`로 live `state` 동기화 확인
6. 주요 회귀: `업무등록`, `커서발행`, `승인대기` 등

### 23.8 다음 단계 (순서 고정)

1. **Phase 1a Slack 라이브 검증 완료** (§23.10) — 실제 issue 생성·duplicate·조회·점검 명령까지 대표 확인
2. 그 다음에만 **Phase 1b**(branch/PR 등) 확장 검토. **지금은 1a 라이브 검증이 먼저.**

### 23.9 Phase 1a 하드닝 (실전 검증 UX)

- **`깃허브점검`**: destructive 없음. `auth configured`, `auth mode`(`pat`|`github_app`|`none`), default **target repo**, **issues path readiness**, **overall PASS/FAIL**, stages `auth → repo_resolve → issue_create → persist(n/a) → sync`
- **`이슈발행` Slack 응답**: `persistence_status`(`ok`|`persist_failed`), `duplicate` 문구(신규 미생성 시 명시), `work_id`/`run_id`/`repo`/`issue_number`/`issue_url`/`state`, **force 재발행 미지원** 정책
- **`persist_failed`**: GitHub에는 이슈가 있으나 COS 저장 실패 — **반드시 `issue_url` 노출**, 다음 액션 안내
- **내부 콘솔 로그**(secret 미포함): `[github:auth]`, `[github:repo_resolve]`, `[github:issue_create]`, `[github:persist]`, `[github:sync]`, `[github:precheck]`
- **`업무상세`**: 상단 **── GitHub issue (요약) ──** 블록(repo / # / url / state / updated_at / sync_status)
- **`실행상세`**: **── GitHub issue (이 실행 연결) ──** 블록(`github_issue_artifact`)
- **`깃허브상세`**: **semantics 고정** — 호출 시 live GET 시도 → 성공 시 `work_item` artifact **refresh 저장**(`sync_status: synced`). 실패 시 **저장 artifact 불변**, 응답에 `live_refresh` 실패·오류 분류만 표시

#### duplicate 규칙 (문서·Slack 일치)

- 동일 **work_item + 동일 repo**에 연결된 issue artifact가 있으면 **재발행 금지**(새 issue 생성 안 함)
- **force** 재발행: 미구현 유지

### 23.10 Slack 라이브 테스트 절차 (권장)

1. `npm start` 후 **`깃허브점검`** → `overall: PASS`, target repo·issues path 확인
2. **`업무등록: …`** 로 테스트 work 1건
3. **`이슈발행 <번호|WRK-…>`** → `persistence_status: ok`, 브라우저에서 `issue_url` 확인
4. **`업무상세`** + **`실행상세`** — 요약 블록에 artifact 필드 확인 (2곳 이상)
5. **동일 work**에 **`이슈발행` 재실행** → duplicate, 신규 이슈 없음
6. **`깃허브상세`** — `live_refresh` 성공 시 저장 반영; (선택) GitHub에서 issue 상태 변경 후 재호출해 `state` 반영 확인
7. 회귀: `승인대기`, `커서발행`, `저장소점검` 등 기존 명령 스모크

### 23.11 지속 원칙 (에이전트)

- 외부(GPT 등) 작업지시는 **맹목 적용 금지** — **반론·플래깅**을 handoff/코멘트에 남김
- **벤치마킹**(유사 오케스트레이션·artifact loop 패턴)은 과도한 프레임워크 도입 없이 **패턴 이식**으로 유지

### 23.12 Phase 1b 예고 (라이브 검증 이후)

- branch 또는 PR artifact로 루프 확장, work_run artifact 관계 정리 등 — **1a 라이브 PASS 이후**

### 23.13 Milestone 2 — Cursor Handoff Thin Slice (Execution loop closure 1차)

**목적**: `work_item`을 Cursor가 바로 실행할 수 있는 **handoff/spec 파일**로보내고, **`work_run`에 dispatch를 남긴 뒤**, Slack에서 **수동 결과 ingest**로 루프를 닫는 최소 경로.

#### 명령어

| 명령 | 설명 |
|------|------|
| `커서발행 <work_id\|번호>` | handoff 마크다운 파일 생성, `work_run`(tool=`cursor`) 생성·갱신, work에 cursor artifact 기록 |
| `커서상세 <work_id\|run_id\|번호>` | (선택) 해당 work의 최신 cursor run 또는 지정 run의 handoff/dispatch/결과 요약 |
| `커서결과기록 <work_id\|run_id\|번호> <한 줄 요약>` | (선택) 수동 ingest — 요약에서 결과 상태 추론 후 run/work artifact 갱신 |

- `업무발행`은 기존과 동일하게 **할당된 도구** 기준 일반 dispatch 패킷만 생성한다. **Handoff 파일 경로는 `커서발행` 전용.**

#### Handoff 파일 위치·형식

- **디렉터리**: 프로젝트 루트 `docs/cursor-handoffs/` (코드 상수 `CURSOR_HANDOFFS_DIR`)
- **파일명**: `{work_id}_{run_id}_handoff.md` (안전 문자 치환)
- **상대 경로 예**: `docs/cursor-handoffs/WRK-260318-01_RUN-260318-01_handoff.md`
- **본문 최소 포함**: `work_id`, brief, goal/title, `project_key`, priority, assigned_persona/tool, approval_status, GitHub issue 블록(없으면 placeholder), in/out scope, acceptance, handoff 문서 업데이트 요구, `커서결과기록` 안내
- 채널·환경 프로필(`envKey`, display name), `source_channel_id`, registry 기준 **repo 힌트**는 가능한 범위에서 포함

#### work_run / work_item에 저장되는 cursor artifact 구조

공통 객체(요약): `cursor_handoff_artifact` 및 `work_item.cursor_artifacts[]` 항목에 동일 스키마로 적재(발행 시 배열에 append, 최신을 `cursor_handoff_artifact`에도 반영).

- `provider`: `cursor`
- `artifact_type`: `handoff`
- `work_id`, `run_id`
- `handoff_path`, `handoff_title`
- `dispatch_status`: 발행 직후 `cursor_in_progress` (결과 기록 시에는 기존 값 유지·필요 시 `unknown` 폴백)
- `linked_github_issue`: 있으면 `{ repo_owner, repo_name, issue_number, issue_url, state }`, 없으면 `null`
- `result_status`: `none` → ingest 후 `patch_complete` \| `needs_followup` \| `failed` \| `unknown`
- `result_notes`, `result_recorded_at`
- `created_at`, `updated_at`

**work_run 추가 필드**

- `dispatch_payload`: handoff 전문(마크다운)
- `dispatch_target`: handoff 상대 경로
- `tool_key` / `adapter_type` / `executor_type`: 기존 `cursor` / `cursor_adapter` 계열
- 발행 성공 시 run 상태: `running`, 실패 시 `failed` 등

#### 결과 ingest 규칙 (`커서결과기록`)

- **자동화 아님** — 운영자가 Cursor 작업 후 한 줄로 상태를 남김
- 요약 텍스트 키워드로 `result_status` 추론(예: 완료/패치 완료 → `patch_complete`, 실패/에러 → `failed`, 추가 수정/후속 → `needs_followup`)
- run 갱신: `cursor_handoff_artifact` 병합, `result_summary`, `result_status`(run 레벨), `qa_status`(완료→`passed`, 실패→`failed`, 그 외→`pending`), `status`는 `review` \| `failed` \| `running`(후속) 등
- work: `cursor_artifacts` 내 동일 `run_id` 항목 갱신. **`cursor_handoff_artifact`(요약 헤더용)는 해당 work의 최신 cursor `work_run`과 `run_id`가 일치할 때만 갱신** — 과거 run에만 기록할 때 최신 handoff 요약이 덮이지 않도록 함
- `업무` 상태는 결과에 맞게 `review` / `blocked` / `in_progress` 최소 반영

#### 에러 메시지(슬랙 응답 prefix)

- work 없음: `[커서발행] work item 없음: …`
- GitHub issue 없음: **경고 한 줄** (발행은 계속)
- handoff 파일 쓰기 실패: `[커서발행] handoff 생성 실패:`
- 저장소 반영 실패: `[커서발행] persistence 실패:` (파일은 이미 있을 수 있음)
- ingest 실패: `[커서결과기록] ingest 실패:`

#### 내부 로그(비밀 금지)

- `[cursor:handoff_write]`, `[cursor:persist]`, `[cursor:ingest]`

#### Phase 2b 우선순위 제안

1. **GitHub branch/PR 자동화** — 이미 issue thin slice가 있으므로 동일 repo에서 실행 루프와 artifact 정합성을 맞추기 좋음  
2. **Cursor 결과 자동 회수**(웹훅/CLI 등) — 수동 `커서결과기록`으로 운영 검증 후 도입하는 편이 리스크가 낮음  

(둘 다 필요하면 **branch/PR → 자동 회수** 순을 권장.)

#### 운영 주의사항

- Handoff는 **봇 프로세스가 쓰는 워크스페이스**에 파일이 생긴다. 배포/도커에서는 해당 경로가 **영구 볼륨**이 아니면 재기동 시 유실될 수 있음 → 필요 시 repo에 커밋하거나 아티팩트 스토리지로 이전하는 Phase 별도 검토
- `cursor_artifacts` 배열은 발행할 때마다 증가 — 보관 정책(오래된 항목 정리)은 후속
- 멀티 프로젝트 일반화·원격 Cursor 제어는 **이번 범위 외**

#### 검증 체크리스트 (Milestone 2)

1. `커서발행 <WRK-…|번호>` → Slack에 `handoff_path`, `run_id` 확인
2. 워크스페이스에 `docs/cursor-handoffs/*.md` 파일 생성 확인
3. `업무상세` / `실행상세`에 **── Cursor handoff ──** 요약 블록 확인
4. `커서결과기록 <run_id|work_id> …` → `result_status` / `qa_status` / 업무 상태 변화 확인
5. 회귀: `업무발행`, `이슈발행`, 승인 플로우

### 23.14 Milestone 3 — Planner / Intake Thin Slice (Phase 3a)

**비판적 범위 고정**: 이번 단계는 **휴리스틱 정규화 + JSON artifact + work 자동 생성**까지이며, LLM 품질·Self-replan·광역 alias·Supabase `plans` 테이블은 **의도적으로 제외**했다. “완전한 planner”가 아니라 **운영 가능한 얇은 층**으로 본다.

#### 새 명령 (deterministic)

| 명령 | 설명 |
|------|------|
| `계획등록: <자연어>` | 요청을 정규화해 `plans`에 저장하고 `proposed_subtasks` 기반으로 `work_item` N건 생성 |
| `계획상세 <PLN-\|번호>` | goal/scope/risk/승인/work 요약 |
| `계획작업목록 <PLN-\|번호>` | 연결된 work 한 줄 요약 |
| `계획승인 <PLN-\|번호>` | plan `approved`, 연결 work `draft`→`assigned` (이미 승인이면 idempotent) |
| `계획기각 <PLN-\|번호> <사유?>` | plan `rejected` (이미 승인된 plan은 기각 불가) |

- 번호 alias `[n]`은 최근 plan 목록(내부적으로 최신 40건 로드) 기준.

#### plan artifact 저장 (`data/plans.json`)

- **Supabase dual-write 비대상** — `STORAGE_MODE`와 무관하게 JSON 코어 스토어에만 기록(`plans.supabaseTable: null` 정의).
- 최소 필드: `plan_id`, `source_text`, `normalized_plan`, `status`(`draft` \| `review_pending` \| `approved` \| `rejected`), `created_at` / `updated_at`, `linked_work_items[]`, `approval_required`, `approval_reason`, `planner_version`, `source_channel`, `source_user`.

#### `normalized_plan` 구조 (요약)

- `request_text`, `goal`, `scope_in` / `scope_out`, `requested_outputs`, `assumptions`, `constraints` — 불명확 시 **null** (지어내지 않음)
- `project_key`, `environment`, `risk_tags`, `approval_required`, `approval_reason`
- `proposed_subtasks[]`: `{ title, brief?, suggested_tool }` — 목록 줄(`- ` / `1.` 등)이 없으면 **요청 전체를 쪼개지 않고 단일 subtask**로 둔다 (fabricated 분해 금지).
- `recommended_tooling`, `next_action_recommendation`
- 상태기계 힌트: `lifecycle_phase`(`planned`/`approval_needed`/`approved`/`rejected`), `dispatch_state`(`not_dispatched` 등)

#### work 자동 생성 규칙

- `createWorkItem` 확장: `source_plan_id`, `status_override`/`approval_status_override` 지원.
- 각 subtask → `title`/`brief`, `project_key`는 정규화 결과, `assigned_persona`는 채널 persona, `assigned_tool`은 subtask·전체 텍스트 키워드 힌트.
- **자동 dispatch 없음** — `커서발행`/`이슈발행`은 수동.
- **Plan 게이트(Phase 3b 일반화)**: `source_plan_id`가 있는 work만 대상. plan이 **`approved` / `ready_for_dispatch` / `in_progress`** 일 때만 dispatch·외부 부작용 명령 허용. 상세는 **§23.15** 참고.

#### 승인 판단 (보수적)

- 키워드: 운영/prod, destructive/대량 삭제, 배포, secret/env/token, bulk/migration, 대외 영향 등 → `approval_required=true`, `approval_reason`에 근거 나열.
- `approval_required=true` → plan `review_pending`, work는 `draft` 유지 → **`계획승인`** 후 `assigned`.
- `approval_required=false` → plan 즉시 `approved`, work는 생성 후 **`assigned`로 승격**(저위험 자동 통과; 여전히 수동 dispatch).

#### Phase 3c 제안 (이전 3b 예고 — 구현은 §23.15)

1. **Review/revise/done closure** 자동화: linked work 전부 `done` 시 plan 제안 등
2. **plans 저장소 승격**: Supabase 테이블·dual-write (스키마·마이그레이션 별도)

#### 운영 주의

- 정규화 품질은 **규칙 기반** — 복잡 요청은 `계획상세`로 사람이 보정 후 work를 수동 편집·추가할 것.
- `plans.json`만 쓰므로 백업/버전관리 정책은 운영 정책에 따름.
- 내부 로그: `[planner:intake]` (secret 미포함)

#### 검증 체크리스트 (Phase 3a)

1. `계획등록: …` → `plan_id` + work 1건 이상
2. `계획상세` / `계획작업목록`
3. 고위험 키워드 포함 시 `approval_required: yes` 및 `계획승인` 전 `커서발행` 차단
4. 저위험만 포함 시 plan 자동 `approved`, work `assigned`
5. 회귀: `업무등록`, `이슈발행`, `커서발행`, `커서결과기록`

### 23.15 Phase 3b — Planner → Dispatch Bridge + Generalized Plan Gate

**벤치마킹 관점**: 오케스트레이션 제품의 “승인 후 실행 큐” 패턴을 **Slack 텍스트 + JSON artifact**로 최소 이식한 것이다. **자동 배치 dispatch·버튼 UI·NLP**는 의도적으로 제외.

#### 새 명령

| 명령 | 역할 |
|------|------|
| `계획발행 <PLN-\|번호>` | plan이 **승인된 뒤**(`approved`/`ready_for_dispatch`/`in_progress`) 실행 브리지: 최초 `approved`이면 → `ready_for_dispatch`, `bridged_at` 기록, **발행 후보 work + 추천 명령** 출력 (GitHub/Cursor 자동 호출 없음) |
| `계획발행목록 <PLN-\|번호>` | 위와 동일 본문(상태 전이 없음) — 조회 전용 |
| `계획요약` | 최근 plan 요약표 (work 수·run 합) |
| `계획진행 <PLN-\|번호>` | (선택) `in_progress` 로 표시 |
| `계획완료 <PLN-\|번호>` | (선택) `done` — 이후 **plan_gate에서 신규 dispatch 차단** |
| `계획차단 <PLN-\|번호> <사유>` | (선택) `blocked` + 차단 사유 |

- **`계획발행` vs `계획발행목록`**: Slack 라우팅상 **`계획발행목록`을 먼저** 매칭한다(접두사 충돌 방지).

#### plan 상태 전이 (최소)

- 기존: `draft` / `review_pending` / `approved` / `rejected`
- 추가: `ready_for_dispatch` (`계획발행`으로 `approved`→전이), `in_progress`, `done`, `blocked`
- **dispatch 허용**: `approved`, `ready_for_dispatch`, `in_progress` (§ `PLAN_GATE_ALLOWED_STATUSES`)
- **차단**: `review_pending`, `draft`, `rejected`, `done`, `blocked` 등

#### Generalized plan gate (적용 범위)

`source_plan_id`가 **없는** legacy work → 게이트 없음.

다음 명령 **직후 work 조회 성공 시** 공통 검사 (`evaluatePlanGateForWorkItem` → `formatPlanGateResult`):

- `업무발행`
- `커서발행`
- `이슈발행` / `깃허브발행`
- `수파베이스발행`

**에러 코드 (Slack prefix 통일)**

- `[plan_gate:plan_missing]` — plan 레코드 없음
- `[plan_gate:plan_not_approved]` — 미승인·done·blocked 등
- `[plan_gate:plan_rejected]` — 기각
- `[plan_gate:plan_lookup_failed]` — 조회 예외

#### 가시성

- `계획상세`: 연결 work별 **run 개수**, 행마다 추천 dispatch 명령(`커서발행`/`이슈발행`/…) 한 줄
- `계획발행`/`계획발행목록`: ready/blocked/waiting/done 카운트 + work별 `runs:N`

#### Slack 라이브 테스트 (권장)

1. `계획등록: …` (고위험 키워드 포함) → `review_pending` 확인  
2. 연결 work에 `커서발행` 시도 → `plan_not_approved` 차단  
3. `계획승인` → `업무발행` 또는 `커서발행` 허용  
4. `계획발행` → `ready_for_dispatch` + 목록 확인  
5. `계획요약` / `계획발행목록`  
6. (선택) `계획진행` / `계획완료` 후 dispatch 시도 시 차단 여부  
7. **legacy**: `업무등록`만 한 work는 위 명령들이 기존과 동일하게 동작하는지 스모크  

#### 내부 로그

- `[planner:bridge]` — 브리지 성공/차단 (secret 없음)

#### Phase 3c 우선순위 제안

1. **Review/revise/done closure**: linked work 기준 plan 자동 제안·경고 (수동 `계획완료` 보조)  
2. **plans Supabase 승격**: dual-write·쿼리 인덱스 (운영 부하 시)  

#### 운영 주의

- `계획발행`은 **자동 실행이 아님** — 대표가 목록의 백틱 명령을 **수동**으로 복사 실행.  
- `done`/`blocked` plan은 의도적으로 dispatch를 막음 — 재개가 필요하면 **새 plan** 또는 데이터 수동 정리(고급).  
- `plans.json` 단일 소스는 백업 정책과 함께 관리.

### 23.16 Planner ↔ APR Identity Linking (출력 계약 + 동기화)

**문제 정의**: 고위험 `계획등록`만 APR 텍스트가 보이고 **PLN/WRK ID가 끊기면** planner front door가 실패한 것으로 본다.

#### Planner 멀티라인 (Council 오분류 방지)

- 첫 줄만 `계획등록:` / `계획등록` 이고 본문이 **다음 줄**에만 있으면, 과거에는 `extractPlannerRequest`가 null → Council 로 새었음.  
- `normalizePlannerInputForRoute` 끝에서 `계획등록: {이후 줄 합침}` 으로 **collapse** 처리.  
- `event.text` 가 잘리고 blocks 가 더 길면 `getInboundCommandText` 가 blocks 우선(길이 휴리스틱).

#### `계획등록` Slack 출력 계약 (고정)

성공 시 **항상** 다음 블록을 포함한다 (`formatPlanRegisterContract`):

- `Plan: PLN-…`
- `Status: …`
- `Approval required: yes|no`
- `APR: …` — 저위험은 `no`; 고위험은 `APR-… (key …)` 또는 APR 생성 실패 시 안내 문구
- `Works (N): WRK-…, …`
- `Next:` — `계획상세` / `계획발행목록` / (고위험 시) `승인 <key|id>` + `계획승인` / `계획기각` / (저위험) `계획발행` + 대표 work에 대한 `이슈발행`/`커서발행` 예시

Plan·work는 **항상** `plans.json` / `work_items`에 먼저 저장된 뒤 APR을 붙인다.

#### APR 레코드 필드 (planner 전용)

- `approval_kind: 'planner'`
- `linked_plan_id`
- `linked_work_ids[]`
- `linked_plan_status_snapshot` (등록 시점 plan.status)
- `createPlannerApprovalRecord` — council `upsertApprovalRecord`와 분리

#### 동기화 규칙

| 트리거 | 효과 |
|--------|------|
| `승인 APR-…` (planner APR) | `approvePlan(linked_plan_id)` — plan `approved`, draft work → `assigned`, pending APR는 이미 `updateApprovalStatus`로 종료 |
| `폐기 APR-…` | `rejectPlan` — plan `rejected`, 연결 work `canceled`, pending APR 이미 종료 |
| `보류 APR-…` | `appendPlanHoldNote` — plan은 `review_pending` 유지, 메모만 누적 |
| `계획승인 PLN-…` | plan 승인 + `resolvePlannerAprIfPending(..., approved)` — 남아 있는 pending planner APR을 승인 처리로 맞춤 |
| `계획기각 PLN-…` | plan 기각 + pending APR `rejected`로 맞춤 + 연결 work `canceled` |

`resolvePlannerAprIfPending`은 **결정 로그(DEC) 자동 생성 없이** APR 행만 패치한다(이중 DEC 방지). 사용자가 `승인 APR`을 쓴 경우에만 기존 `updateApprovalStatus`의 DEC 삽입이 유지된다.

#### `계획상세` / `계획작업목록`

- `linked_approval_id`, 최신 planner APR의 `id` / `approval_key` / `status`
- `── Next (복붙) ──` 블록: `승인 …`, `계획승인 …`, `계획발행목록 …`, `이슈발행 WRK-…` 등

#### 승인대기 UI

- `승인대기` / 요약 목록에 planner 건은 **연결 Plan: PLN-…** 한 줄 추가

#### Slack 테스트 (연결 끊김 방지)

1. 저위험 `계획등록:` → 응답에 **PLN + WRK**만 있어도 APR 줄은 `no`로 명시  
2. 고위험(배포/secret 등 키워드) → **PLN + WRK + APR** 동시 확인  
3. `승인대기`에서 동일 PLN 표시  
4. `승인 APR-…` 후 `계획상세 PLN-…` → plan `approved`, work `assigned`  
5. 대안 경로: `계획승인 PLN-…` 후 `승인대기`에서 해당 APR이 사라졌는지(종료) 확인  
6. `계획기각` → work `canceled` 확인  

### 23.17 Phase 4 — Hosted Runtime + Plans Supabase Promotion

**목표**: plans / works / approvals를 **호스티드 환경에서 Supabase 우선 읽기(primary read path)** 로 올리고, hosted에서 기동·헬스·로그로 운영 가능하게 정리. (**문서 권위**와 무관한 **데이터 레이어** 표현.)

#### 승격 범위

- **plans**: 테이블 `g1cos_plans`, `CORE_DUAL_WRITE_COLLECTIONS`에 포함, `supabaseStoreAdapter` 매핑.
- **works / approvals**: 기존 core dual-write와 동일 스토어 팩토리; **read preference가 supabase일 때** list/get/summarize 전반이 Supabase 우선.

#### Production read preference

- `RUNTIME_MODE=hosted`(또는 운영 프로파일)에서 **기본** `STORAGE_MODE=dual`, `STORE_READ_PREFERENCE=supabase`. 명시 env가 있으면 그 값 우선.
- JSON 파일은 **백업·fallback**; Supabase read 실패 시 **구조화 로그** 후 JSON 재시도(`store_read_fallback` 등). **silent fallback 없음**.

#### Hosted 필수 env

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (hosted storage 검증; 누락 시 기동 실패).
- 권장: `RUNTIME_MODE=hosted`, 필요 시 `STORAGE_MODE` / `STORE_READ_PREFERENCE` 명시.

#### 헬스 / 로그

- `health`: `plans` / `g1cos_plans` 연결·카운트.
- 부팅: `startup_storage_profile` JSON — `environment`, `read_source` (`supabase_primary` \| `json_primary`), `write_mode`, `fallback_on_supabase_read_error`, `silent_fallback: false`, `supabase_configured`, `ssot_collections`.
- read/write: `src/storage/core/storageTelemetry.js` 이벤트(`store_read_ok`, `store_read_fallback`, `store_dual_write_supabase_fail` 등).

#### 상세 handoff

- `docs/cursor-handoffs/Phase_4_Hosted_Supabase_Promotion_handoff.md` — 변경 파일, TEST 표, 리스크, 다음 패치 제안.

#### 마이그레이션

- Supabase에 `supabase/migrations/20260320_g1cos_plans.sql` 적용 후 운영. 기존 `plans.json`만 있는 환경은 **백필** 절차가 필요할 수 있음(다음 패치 권장).

### 23.18 Query Commands — Council-Free Structured Response

**목표**: 조회형 명령은 **저장소 read + 포맷터만** 사용하고, Council·추천 장문·페르소나 푸터를 **절대 붙이지 않음**.

#### query-only 명령 (라우터: `handleQueryOnlyCommands`, `도움말` 직후)

- `계획상세 <PLN-…>`
- `계획진행 <PLN-…>`
- `계획발행목록 <PLN-…>`
- `업무상세 <WRK-…>`
- `업무검토 <WRK-…>`

#### Top-Level Router Lockdown (2026-03-21)

- **패치**: `Top-Level Router Lockdown + Query-Only Route Fix`
- **불변식 1**: `계획등록` / planner intent(`analyzePlannerResponderLock` hit·miss) → 최종 응답은 **planner만** (성공=contract, 실패=planner 오류). Council·`inferWorkCandidate` **금지**.
- **불변식 2**: 위 query 명령 → **query formatter만**. Council **금지**.
- **구현 (2026-03-27 갱신)**: `app.js` `handleUserText` 는 **`runInboundCommandRouter`** (`src/features/runInboundCommandRouter.js`) 호출 후 미스 시 **`runInboundAiRouter`** 만 이어 붙인다. pre-AI 순서: 도움말 → **`tryFinalizeProjectIntakeCancel`** / **활성 인테이크 + `isCouncilCommand` 연기 표면** (`projectIntakeSession.js`) → **결정 짧은 회신**(`tryFinalizeDecisionShortReply`, 스레드 tail) → **`start_project` 잠금·정제·Front Door·강제 정제** → **M4 lineage** → **`tryFinalizeSlackQueryRoute`**(**query**) → 동기 `routing_sync_*` 로그 → 컨텍스트 로드 → 플래너 하드 락(**planner** `hit`/`miss` → `runPlannerHardLockedBranch`) → **`runInboundStructuredCommands`** (예: **`워크큐*`** `AWQ-*`·**`워크큐증거`/`러너증거`**; **`커서발행`·GitHub `이슈발행`·`수파베이스발행`** 성공 시 **`linkAgentWorkQueueRunForWork`**; 선택 **`COS_CI_HOOK_*`** `GET /cos/health`·`POST /cos/ci-proof`) → **대표 surface**(`tryExecutiveSurfaceResponse`: `결정비교:`·상태·`전략 검토:`·`리스크 검토:` 등). AI 꼬리(`runInboundAiRouter.js`): **`tryFinalizeSlackQueryRoute`** → **인테이크 취소** → (Council 접두 아님·인테이크면 **`tryProjectIntakeExecutiveContinue`**) → 내비게이터(`COS`/`비서`) → planner 방화벽 재확인 → **명시 Council은 활성 인테이크면 연기 표면** → 아니면 **`runCouncilMode`** → 그 외 평문은 **`dialog`**(`runCosNaturalPartner`). `finalizeSlackResponse`·Council 누수 차단은 `src/features/topLevelRouter.js`.
- **대화 버퍼**: 프로세스 메모리 `src/features/slackConversationBuffer.js` — DM·스레드 키(`thread_ts` 포함 메타)로 최근 턴을 누적, dialog·내비·Council 페르소나 입력에 합성. **프로젝트 인테이크 세션** 옵트인 영속: `PROJECT_INTAKE_SESSION_PERSIST=1`·`PROJECT_INTAKE_SESSIONS_FILE`(선택)·부팅/종료 시 로드·플러시(`app.js`·`projectIntakeSession.js`).
- **정본**: `docs/cursor-handoffs/COS_Inbound_Routing_Current_260323.md` (구버전 순서는 `Router_Lockdown_260318_handoff.md` 상단 주의 참고)
- **테스트**: `npm test` (`test-operations-loop` + `test-router-lockdown` + `replay-slack-fixtures`)

#### Council 차단

- 위 명령은 **`runInboundCommandRouter` → `tryFinalizeSlackQueryRoute`** 에서 처리되어 `runCouncilMode` / `inferWorkCandidate` 푸터 경로에 **진입하지 않음**.
- 응답은 `formatPlanDetail`, `formatPlanProgressSlack`, `buildPlanDispatchSlackBody({ queryDispatchList })`, `formatWorkItemDetailQuery`, `formatWorkReviewQuery` 등 **구조화 텍스트만**.

#### 구조화 계약 (요약)

- 계획: `plan_status`, `approval_summary`, `counts`, `child works`, `next_allowed_actions`, `Next`.
- 계획발행목록(조회): `work rows`에 GitHub linked/state, cursor phase, review, `dispatch_hint`.
- 업무: `lifecycle`, `approval`, GitHub/Cursor/Review 요약, `latest result/run`, `next_allowed_actions`, `Next`.

#### 로그 (JSON `console.info`)

- `query_route_entered`, `query_route_usage_error`, `query_route_not_found`, `query_route_response_rendered`, `query_route_council_blocked`
- 필드: `command_name`, `query_route_kind`, `target_id`, `source_used`, `council_blocked`, `response_type` (`structured_query` | `usage_error` | `not_found` | `empty_state`)

#### 상세 handoff

- `docs/cursor-handoffs/Query_Commands_Council_Free_handoff.md`

#### 스모크

- `node scripts/test-query-only-route.mjs`
- `node scripts/test-inbound-query-routing.mjs` — rich_text·멘션만 text 일 때 blocks 우선

#### 운영 이슈 (2026-03): `계획상세` / `계획발행목록` 만 Council 로 새는 현상

- **원인**: `getInboundCommandText`가 `계획등록`만 blocks 본문을 우선했고, 굵게 입력 시 `*계획상세*` 등으로 접두사 매칭 실패.
- **조치**: `INBOUND_PREFER_BLOCKS_MARKERS`로 계획·업무 명령 공통 blocks 우선; `normalizeSlackCommandDecorations`로 첫 줄 `*·\`` 제거 후 `handleUserText`에서 적용.

### 23.19 Big Pivot — AI 인바운드 모듈화·대화 맥락 (2026-03-23)

- **목표**: 평문 기본 경로를 Council이 아닌 **dialog**로 고정하고, 내비·Council·dialog를 **한 모듈**에서 순서 보장; DM/스레드 **최근 대화**를 다음 턴에 넘김.
- **코드**:
  - `src/features/runInboundCommandRouter.js` — pre-AI 파이프라인(도움말·**인테이크 취소·인테이크 중 명시 Council 연기**·결정 짧은 회신·`start_project` 루프·M4 lineage·조회·`routing_sync_*`·컨텍스트·플래너 하드 락·`runInboundStructuredCommands`·**문자열 구조화 응답은 `finalizeSlackResponse`( `structured` / `structured_command`)**·surface — surface **finalize `command_name` = intent `response_type`** → JSONL `surface_intent`)
  - `src/features/runInboundStructuredCommands.js` — 구조화 명령 대량 분기(미스 시 `undefined`)
  - `src/features/runInboundAiRouter.js` — `runInboundAiRouter`, `classifyInboundResponderPreview`(회귀 축약: 도움말·**인테이크 취소**·**`start_project_confirmed`/`start_project_refine`**·Front Door(`start_project`)·조회·플래너 락·surface·**활성 인테이크+Council → 연기 표면**·내비·Council·dialog; 구조화 미시뮬)
  - `src/features/scopeSufficiency.js` · `src/features/startProjectLockConfirmed.js` — **`start_project` 범위는 턴 수가 아니라 충분성(`assessScopeSufficiency`)**으로만 실행 승인; 미달 시 정제 루프(`start_project_refine`)
  - `src/features/slackConversationBuffer.js` — `buildSlackThreadKey`, `recordConversationTurn`, `getConversationTranscript`; 비활성 `CONVERSATION_BUFFER_DISABLE=1`
  - `src/slack/registerHandlers.js` — `metadata.thread_ts` 전달
  - `src/agents/council.js` — `conversationContext`(스레드 요약) + 페르소나 LLM 입력 합성
  - `src/features/cosNaturalPartner.js` — `priorTranscript` 시스템 프롬프트 블록
  - `src/features/approvalMatrixStub.js` — **M2b** `evaluateApprovalPolicy` v1(환경·옵션→티어); 결정 `pick` → `agentWorkQueue` `pending_executive` / `approval_policy_tier`
  - `src/features/cosNavigator.js` — (2026-03-24) 내비 **intro·본문** 하단에 **`계획등록:` 복붙 초안** fenced 블록 (`buildPlanRegisterDraftLine`)
  - `src/slack/registerSlashCommands.js` — (2026-03-24~26) **`/g1cos`** 슬래시, lineage·조회 + 응답 후 **`recordSlashCommandExchange`** (`CONVERSATION_BUFFER_RECORD_SLASH=0` 로 끔)
  - `src/slack/queryResponseBlocks.js` — (2026-03-24) 조회 응답 **Block Kit 단락**; `SLACK_QUERY_BLOCKS=0` 로 평문만
- **Fixture**: `src/testing/inboundResponderClassify.js`는 위 모듈을 re-export하여 회귀와 프로덕션 분기 **단일 소스** 유지.
- **North Star·Slack UX 정렬**: `COS_Project_Directive_NorthStar_FastTrack_v1.md` + `COS_NorthStar_Alignment_Memo_2026-03-24.md` + `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` + `COS_NorthStar_Workflow_2026-03.md` — 디렉티브·**M2a/M2b 잠금**·하네스 번역·북스타트·Slack UX 기둥.
- **다음**: `/g1cos` 서브커맨드 확장 → 툴 레지스트리 **v2**(function calling·실차단 게이트) → 버퍼 영속 운영 디테일. **완료**: 슬래시 조회 MVP + lineage + **슬래시↔대화 버퍼 기록** (`recordSlashCommandExchange`) + 조회 Block Kit + 조회 네비 버튼; **`runPlannerHardLockedBranch`** 모듈; **툴 레지스트리 v1** (`cosToolRegistry`·`cosToolTelemetry`·`cosToolRuntime`, `tool_registry_bind` 로그, `WRK-260325-03`).
- **레이어 분리(해석)**: `docs/cursor-handoffs/COS_Executive_vs_Orchestration_Layers_2026-03-27.md` — 대표 레이어 vs 오케스트레이션·새는 지점·에스컬레이션 v0(느슨) 원칙.
- **프로젝트 킥오프 sticky 세션**: `docs/cursor-handoffs/COS_Project_Intake_Sticky_Session_2026-03.md` — `projectIntakeSession.js`·후속 턴 `start_project_*` 고정·Henry 회귀.

---

## 24. Slack Bolt / Socket Mode 런타임 (Node ESM + 연결 안정화)

### 24.1 의존성

- `@slack/bolt` **^4.6.0** (내부 `@slack/socket-mode` **2.x**)
- Bolt 3 + socket-mode 1.x에서는 `connecting` 상태에서 `server explicit disconnect` 시 finity state machine 예외로 프로세스가 죽는 이슈가 보고된 바 있음. **Bolt 4 / socket-mode 2**로 올려 완화하는 것이 1차 대응이다.

### 24.2 ESM + CJS

- `package.json`의 `"type": "module"` 환경에서는 `import { App } from '@slack/bolt'` 대신 `import bolt from '@slack/bolt'; const { App } = bolt` 패턴을 사용한다.

### 24.3 앱 기동

- `slackApp.start()`는 최대 5회, 3초 간격으로 재시도(`startSlackAppWithRetry`).
- `unhandledRejection` / `uncaughtException` 로깅 후 종료(`src/runtime/startup.js`).

### 24.4 여전히 끊길 때

- `SLACK_APP_TOKEN` / Socket Mode 활성화 / 동일 토큰 중복 실행(`too_many_websockets`) 여부 확인.

### 24.5 스택으로 구버전 node_modules 구분

- 크래시 스택에 `node_modules/finity` 또는 `@slack/socket-mode/dist/SocketModeClient.js`( **`dist/` 바로 아래**, `src` 없음)가 보이면 **socket-mode 1.x** 트리가 남아 있는 경우가 많다.
- Bolt 4 + socket-mode **2.x**는 보통 `@slack/socket-mode/dist/src/SocketModeClient.js` 경로를 쓰며 **finity 의존성이 없다**.
- 부팅 시 로그: `[startup] slack sdk: @slack/bolt@… @slack/socket-mode@…` — 여기서 socket-mode가 **2.x**인지 반드시 확인.
- 조치: 프로젝트 루트에서 `rm -rf node_modules && npm install` 후 `npm ls @slack/socket-mode` 로 2.x 재확인.
