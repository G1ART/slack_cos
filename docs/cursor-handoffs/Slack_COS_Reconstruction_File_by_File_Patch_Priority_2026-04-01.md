# Slack COS Reconstruction — File-by-File Patch Priority
## Founder Front Door Rebuild Directive
### Date: 2026-04-01

이 문서는 **founder-facing front door를 재건축**하기 위한 파일별 패치 우선순위 문서다.  
목표는 기존 동작을 조금씩 보수하는 것이 아니라, **대표가 실제로 원하는 COS 대화 경험 + scope lock 이후 orchestration handoff**를 결정론적으로 재구축하는 것이다.

**Authority:** 제품 헌법·빌드 순서는 여전히 `COS_Project_Directive_NorthStar_FastTrack_v1.md` · `COS_NorthStar_Alignment_Memo_2026-03-24.md`가 이긴다. 본 문서는 **founder 앞단 재건축을 실행할 때의 구현·파일 우선순위·머지 게이트**를 고정한다. 충돌 시 Directive/Alignment/Memo가 우선.

**진행 로그:** `COS_Founder_Front_Door_Reconstruction_Roadmap_2026-04-01.md` — Phase 1a 완료 항목·다음 배치.

---

## 0. 최종 판단

현재 레포의 상태는 다음과 같이 판단한다.

- **뒤쪽 execution/orchestration spine은 보존 가치가 높다**
  - project space / execution run / dispatch / GitHub / deploy packet / approval packet 흐름은 실제 코드로 존재한다.
- **앞단 founder-facing front door는 재건축이 필요하다**
  - pipeline / command router / executive surface / AI router / top-level guard가 역할을 나눠 먹고 있어 split-brain이 발생한다.
  - 같은 입력이 council, generic clarification, runtime packet 사이를 흔드는 현상은 이 구조적 문제의 직접 결과다.

따라서 이번 reconstruction의 원칙은:

> **앞단은 big-bang rebuild, 뒤쪽 orchestration spine은 최대한 보존**

이다.

---

## 1. 큰 방향 — 무엇을 지우고 무엇을 살릴 것인가

## 1.1 보존할 것
아래는 보존하고 재사용하는 것이 맞다.

- `src/features/projectIntakeSession.js`
- `src/features/startProjectLockConfirmed.js`
- `src/features/projectSpaceRegistry.js`
- `src/features/projectSpaceBootstrap.js`
- `src/features/executionRun.js`
- `src/features/executionDispatchLifecycle.js`
- `src/features/executionOutboundOrchestrator.js`
- `src/features/executionSpineRouter.js`
- `src/adapters/githubAdapter.js`
- `src/adapters/vercelAdapter.js`
- `src/adapters/railwayAdapter.js`
- deploy/approval/reporting 관련 canonical packet 계열

이 축은 **scope lock 이후 orchestration backbone**으로 계속 쓴다.

## 1.2 재작성할 것
아래는 founder-facing front door 재건축 대상으로 본다.

- `app.js`
- `src/core/founderRequestPipeline.js`
- `src/features/runInboundCommandRouter.js`
- `src/features/tryExecutiveSurfaceResponse.js`
- `src/features/runInboundAiRouter.js`
- `src/features/topLevelRouter.js`
- `src/core/founderOutbound.js`
- `src/core/founderRenderer.js`

## 1.3 삭제 또는 사실상 폐기할 것
아래는 founder-facing route에서 시민권을 박탈해야 한다.

- founder route에서의 `council` responder
- founder route에서의 generic clarification fallback
- founder route에서의 legacy command-router kickoff ownership
- founder route에서의 persona/council synthesis body
- founder route에서의 “나중에 sanitize로 고치기” 식 post-hoc 구조

필요하다면 코드 파일을 남겨도 되지만, **founder-facing path에서는 dead code**여야 한다.

---

## 2. 목표 아키텍처

이번 reconstruction 이후 founder-facing path는 아래 구조만 허용한다.

`Founder input -> COS dialogue writer -> hidden contract extractor -> state/phase resolver -> renderer -> outbound`

중요:

- **council은 founder-facing 출력 생성기가 아니다**
- **kickoff / meta / help / follow-up / scope lock / status / approval / deploy는 deterministic contract path**여야 한다
- **command router는 structured command + query only**
- **AI router는 founder route에서 제거하거나, 내부 실험 전용으로 격리**

---

## 3. 파일별 패치 우선순위

# P0 — app.js
## 상태 판단
현재 `app.js`는 너무 많은 founder-routing 책임을 쥐고 있다.  
pipeline 호출 이후에도 legacy router와 추가 fallback 로직이 살아 있어 front door가 하나로 잠기지 않는다.

## 조치
- `handleUserText`의 founder-facing 주 경로를 **단일 kernel 호출**로 재구성
- founder input은 아래 둘 중 하나로만 끝나야 함:
  1. `founderRequestPipeline(...)` 성공
  2. deterministic hard fallback
- founder route에서 `runInboundCommandRouter` / `runInboundAiRouter`를 후순위 일반 fallback로 쓰지 말 것
- founder route용 분기를 `command/query/internal` 분기와 분리

## accept criteria
- founder input에서 pipeline 이후 legacy router로 재진입하지 않음
- `버전`, kickoff, follow-up, meta, status, approval, deploy가 모두 pipeline 한 축으로 종료
- founder_output_trace에 `passed_pipeline=true`, `legacy_router_used=false`가 기본값이 됨

---

# P0 — src/core/founderRequestPipeline.js
## 상태 판단
현재는 “진짜 커널”이 아니라 thin delegator에 가깝다.  
utility 일부만 직접 처리하고, 핵심 founder actions를 legacy 코드로 많이 위임한다.

## 조치
이 파일을 **이번 reconstruction의 실질적 kernel**로 전면 재작성한다.

## 필수 책임
1. intent classification
2. thread ownership / intake continuation 확인
3. conversation mode 판단
   - dialogue mode
   - orchestration mode
4. contract-bound response generation
5. scope lock readiness 판단
6. orchestration handoff threshold 판단

## pipeline이 직접 처리해야 할 founder actions
- new project kickoff
- kickoff clarification / framing
- follow-up narrowing
- pushback / realism
- scope lock request
- meta debug
- runtime meta
- help
- status
- approval
- deploy

## 금지
- 처리 못 하면 무조건 `null` 반환
- kickoff를 legacy command router로 넘기기
- meta debug를 AI router로 넘기기

## accept criteria
- founder-facing gold tests 1~7 전부 pipeline 내부 계약으로 처리
- `null` 반환은 truly unknown founder input에만 허용
- pipeline 내부에 conversation contract 구현

---

# P0 — src/features/runInboundAiRouter.js
## 상태 판단
현재 founder route에서 council branch가 아직 구조적으로 살아 있다.  
환경변수 기반 비활성화는 임시 타협일 뿐이다.

## 조치
- founder route에서는 **council branch 완전 제거**
- founder route에서 `responder === 'council'` 가능성 자체를 삭제
- 이 파일은 아래 둘 중 하나로 재정의:
  1. founder path에서 완전 비사용
  2. non-founder/internal experimentation only

## 허용되는 경우
- internal simulation
- non-founder tool/testing route
- offline analysis/debug

## 금지
- founder DM / mention route에서 `runCouncilMode`
- founder-facing response composition
- founder-facing generic explanation fallback

## accept criteria
- founder route에서 `council` 문자열이 trace에 등장하면 테스트 실패
- founder-facing gold tests에서 `responder==='council'` 0회

---

# P0 — src/features/runInboundCommandRouter.js
## 상태 판단
현재 이 파일이 structured command router가 아니라 kickoff/intake/lock까지 일부 소유하고 있다.

## 조치
이 파일을 **structured command + query 전용 router**로 축소한다.

## 남겨도 되는 책임
- 명령형 내부 운영 command
- query lookup
- explicit system/operator flows

## 제거해야 하는 책임
- new project kickoff
- kickoff clarification
- follow-up narrowing
- scope align
- founder kickoff ownership

## accept criteria
- founder 자연어 kickoff는 이 파일을 통과하지 않음
- founder route에서 이 파일은 사실상 호출되지 않거나, utility/structured query 외 역할 없음

---

# P0 — src/features/tryExecutiveSurfaceResponse.js
## 상태 판단
이 파일은 kickoff surface와 legacy 운영 메커니즘(실행 큐/커서발행/계획화)의 흔적이 섞여 있어 founder dialogue 품질을 망친다.

## 조치
둘 중 하나를 선택한다.

### 권장안
- 파일 역할을 완전히 분리
  - `cosDialogueWriter.js` 신규 생성
  - `tryExecutiveSurfaceResponse.js`는 폐기 또는 orchestration-side helper로 축소

### 최소안
- 이 파일 안에서 founder-facing dialogue contract만 남기고,
- queue promotion / legacy operational phrasing 전부 삭제

## start_project 응답의 필수 구조
- 문제 재정의
- benchmark axis
- MVP 범위
- 제외 범위
- 리스크/검증 포인트
- 핵심 질문 3~5개
- next step

## 절대 금지
- generic clarification
- 실행 큐/커서 발행류 문구
- raw planning command 노출
- persona/council 표현

## accept criteria
- exact kickoff prompt에 대해 고품질 COS framing response 생성
- founder-facing gold spec 위반 문구 0개

---

# P0 — src/features/topLevelRouter.js
## 상태 판단
현재는 “좋지 않은 응답이 먼저 만들어지고, 나중에 guard/finalize가 잡는” 구조다.

## 조치
이 파일은 **후단 sanitizer**가 아니라 **hard contract enforcer**로 축소한다.

## 남겨야 할 것
- trace logging
- invariant assertion
- emergency hard fail

## 줄여야 할 것
- regex-based salvage
- council marker strip로 문제를 덮는 구조
- generic clarification을 사후 제거하는 구조

## 정책
- founder route에서 forbidden surface 감지 시 **hard fail**
- “수정해서 살리기”보다 “즉시 실패 + 로그”를 우선

## accept criteria
- founder route에서 old council markers 감지 시 즉시 실패
- generic clarification 감지 시 즉시 실패
- trace가 exact 원인을 남김

---

# P1 — src/core/founderRenderer.js
## 상태 판단
renderer는 유지 가치가 있지만, 현재는 contract generator보다 formatting layer 성격이 강하다.

## 조치
renderer를 **contract-bound surface renderer**로 승격한다.

## surface taxonomy
- `kickoff_framing_surface`
- `dialogue_narrowing_surface`
- `scope_lock_packet`
- `runtime_meta_surface`
- `meta_debug_surface`
- `status_packet_surface`
- `approval_packet_surface`
- `deploy_packet_surface`
- `hard_fallback_surface`

## 추가 규칙
- surface type별 필수 필드 validation
- missing required fields면 렌더하지 않고 fail

## accept criteria
- renderer가 gold spec의 output contract를 강제
- “예쁘게 포맷만 하는 함수”가 아님

---

# P1 — src/core/founderOutbound.js
## 상태 판단
현재 validateFounderText는 내부 마커만 막는 최소 validator 수준이다.

## 조치
- outbound validator를 “internal marker detector”가 아니라 **founder contract validator**로 강화
- 최소한 아래 검증 추가:
  - kickoff surface에 required sections 존재
  - meta debug는 1~2문장 deterministic response
  - status packet은 stage/completed/in-progress/blocker/next-action 필수
  - forbidden markers 0개

## 금지
- output을 고쳐서 살리기
- validator가 generator 역할을 대신하는 것

## accept criteria
- validation failure 시 outbound block
- trace에 validation_error 기록

---

# P1 — src/features/projectIntakeSession.js
## 상태 판단
보존 가치 높음. 다만 ownership을 pipeline 중앙 규칙으로 끌어올려야 한다.

## 조치
- kickoff 첫 턴에서 반드시 active intake 생성
- 같은 thread 후속 턴 continuation 유지 강제
- pipeline에서 이 파일을 primary source of truth로 사용

## accept criteria
- kickoff 후 follow-up이 same project continuation으로 유지
- intake active 상태에서 council defer가 아니라 **council 불가**가 됨

---

# P1 — src/features/startProjectLockConfirmed.js
## 상태 판단
보존 가치 높음. scope lock 이후 run/project space/orchestration handoff 진입점으로 적절하다.

## 조치
- conversation contract에서 lock threshold 충족 시 이 파일로 handoff
- founder-facing scope lock packet과 연결 정리
- 중복된 lock logic이 다른 경로에 있으면 제거

## accept criteria
- lock request 시 deterministic scope lock packet
- 승인 후 project space + run + dispatch로 이어짐

---

# P1 — src/features/executionOutboundOrchestrator.js
## 상태 판단
보존 가치 높음. hybrid-manual backbone으로 충분히 쓸 수 있다.

## 조치
- 당장은 대수술 금지
- founder-facing handoff contract만 맞춘다
- workstream dispatch 결과가 founder report packet에 잘 반영되도록 연결만 정리

## accept criteria
- scope lock 이후 dispatched workstreams truth가 founder-facing으로 보임
- live vs manual bridge 구분이 유지됨

---

# P2 — src/features/projectSpaceRegistry.js / executionDispatchLifecycle.js / executionSpineRouter.js / adapters/*
## 상태 판단
이 축은 현재 비교적 건강하다.

## 조치
- 이번 reconstruction에서는 큰 수술보다 interface 정리 위주
- founder-facing front door가 안정화된 뒤 두 번째 단계에서 고도화
- 특히 Vercel/Railway/Cursor live orchestration은 이후 단계 과제

## accept criteria
- provider truth / deploy / approval / reporting 회귀 없음

---

## 4. 신규 파일 제안

이번 reconstruction에서는 아래 신규 파일 생성이 유리하다.

### `src/core/cosDialogueWriter.js`
역할:

- founder-facing 고품질 대화 초안 생성
- kickoff / narrowing / pushback / framing / next-step 제안

### `src/core/hiddenContractExtractor.js`
역할:

- 사용자에게 보여주지 않는 구조화 상태 생성
- problem frame
- unresolved questions
- provisional scope
- lock readiness
- next best action

### `src/core/founderConversationContracts.js`
역할:

- surface별 required fields
- forbidden markers
- validation rules
- gold test mapping

### `src/core/founderHardFailRules.js`
역할:

- council 금지
- generic clarification 금지
- internal metadata 금지
- founder route invariant assertion

---

## 5. 삭제/비활성화 우선순위

아래는 실제 삭제 또는 hard-disable를 권장한다.

1. founder route의 council responder path
2. founder route의 generic clarification fallback
3. founder route의 legacy kickoff handling
4. founder route의 post-hoc regex salvage logic
5. founder route에서의 persona dump/operational queue text

---

## 6. 구현 순서

### Phase 1 — Founder front door hard reset
- app.js 재배선
- founderRequestPipeline 전면 재작성
- runInboundAiRouter founder path 제거
- runInboundCommandRouter structured/query 전용 축소

### Phase 2 — Dialogue contract implementation
- cosDialogueWriter 신규
- founderRenderer contract-bound 강화
- founderOutbound validation 강화
- tryExecutiveSurfaceResponse 폐기 또는 대폭 축소

### Phase 3 — Ownership and lock
- kickoff 즉시 intake ownership 생성
- follow-up continuation 보장
- scope lock packet → startProjectLockConfirmed 연결

### Phase 4 — Orchestration handoff stabilization
- project space / run / dispatch / reporting 연결 정리
- provider truth 보고 회귀 테스트

---

## 7. Gold acceptance tests (non-negotiable)

### Test A — kickoff
입력:

`더그린 갤러리 & 아뜰리에 멤버들의 스케줄 관리 캘린더를 하나 만들자.`

기대:

- generic clarification 금지
- 고품질 framing
- benchmark axis
- MVP 범위/제외 범위
- 질문 3개 이상
- council 0
- persona 0

### Test B — follow-up narrowing
입력:

`갤러리와 미술학원을 겸하는 공간의 내부 멤버, 나아가 링크를 받은 외부 손님들까지 공동으로 관리할 수 있는 캘린더야. 벤치마킹을 통해 필수 기능, 부가 기능, 구현 아키텍처를 마련해줘.`

기대:

- same project continuation
- intake ownership 유지
- 기능 계층화
- architecture 방향 제시
- council 0

### Test C — meta debug
입력:

`COS responder는 어떻게 동작해?`
`responder surface sanitize 한 줄로만 말해.`
`버전`

기대:

- deterministic meta/runtime response
- council 0
- internal metadata 0
- exact same prompt repeated 10회 모두 동일 class

### Test D — scope lock
입력:

`좋아. 그럼 이 방향으로 MVP 범위를 잠그자.`

기대:

- scope lock packet
- run handoff 준비
- 모호한 내러티브 금지

### Test E — execution handoff
입력:

`이 방향으로 실행 넘겨.`

기대:

- project space / run / dispatched workstreams 명시
- founder next action 표시

---

## 8. 로그/트레이스 요구사항

모든 founder turn에 아래 필드 기록 필수.

- git_sha
- hostname
- pid
- instance_id
- input_text
- intent
- work_phase
- intake_session_id
- responder
- surface_type
- passed_pipeline
- passed_renderer
- passed_outbound_validation
- legacy_router_used
- hard_fail_reason (if any)

이 로그 없이는 “됐다” 판정 금지.

---

## 9. merge gate

이번 reconstruction의 merge 조건은 아래뿐이다.

1. founder-facing gold tests 전부 통과
2. exact Slack prompts evidence 첨부
3. 동일 프롬프트 반복 테스트 deterministic pass
4. founder route에서 council 0회
5. generic clarification 0회
6. provider truth/reporting 회귀 없음

---

## 10. 최종 권고

이번 패치는 **부분보수**가 아니라 **front door 재건축**으로 가는 것이 맞다.

정리하면:

- **앞단은 싹 갈아엎어도 된다**
- **뒤쪽 orchestration spine은 살려서 재활용한다**
- **founder-facing route에서 council 시민권 박탈**
- **generic clarification 완전 금지**
- **gold spec 기반 deterministic dialogue-first COS를 먼저 복구**
- **그 다음에만 orchestration 고도화**

한 문장으로 끝내면:

> **대표가 들어가는 문부터 다시 세워라. 뒤는 이미 꽤 만들어져 있다.**
