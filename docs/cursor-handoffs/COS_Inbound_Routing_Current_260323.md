# Handoff: 인바운드 라우팅 현행 (Big Pivot — 평문 dialog · 명시 Council · 플래너 방화벽)

**Authority role:** Runtime truth

**Can define:**

- current routing behavior
- actual branch behavior
- current live logic

**Cannot override:**

- Directive product truth
- Alignment build order

**Use when:**

- asking what the code actually does right now

---

**코드 기준일**: 2026-04-01 — **`founderRequestPipeline.js` 3b**는 `runInboundCommandRouter`의 **1b·1c-exec·1c·4·9** 축을 DM/멘션 파이프라인에서도 선행(인테이크 취소·execution spine·spec 빌드 스레드·clean start door·`tryExecutiveSurfaceResponse`). **골드 킥오프·scope lock** 문장은 `tryClassifyStartProject`와 겹칠 때 executive `start_project`에 **선점되지 않도록** 생략. **`topLevelRouter`(Phase 2a)**는 founder 경로에서 generic clarification/council shape leak를 sanitize로 보정하지 않고 하드 차단하며, trace에 `passed_outbound_validation`·`validation_error_code`를 남긴다. · 2026-03-28 **`ProjectSpecSession`** — 활성 인테이크 스레드는 `projectSpecSession.js`의 `tryFinalizeProjectSpecBuildThread`가 조회/M4/플래너 락에 **양보**하지 않으면 **spec mutation·충분성(`computeSufficiency`)**으로 대표 표면을 고정; 성공 시 `project_spec_execution_ready`·실패 시 `project_spec_refine`. transcript 기반 `start_project_confirmed`/`start_project_refine`은 **인테이크가 비활성**이거나 spec 핸들러가 **null**일 때 기존 경로. · 원본 2026-03-23
**앱**: `g1-cos-slack` (**Big Pivot** = 본 Slack COS 런타임/봇의 별칭. 저장소 폴더명과 동일하지 않을 수 있음.)

**권위 맵:** `00_Document_Authority_Read_Path.md`

이 문서는 **지금 프로덕션 분기**를 한 곳에 고정한다. 예전 `Router_Lockdown_260318_handoff.md` 의 “나머지 전부 Council” 서술은 **폐기**되었다.

**Fast-Track v1**: 대표 표면 vs 내부 API·**라우팅 순서 계약**은 `COS_FastTrack_v1_Surface_And_Routing.md` 가 정본이다.

**주진척·빌드 서사:** `COS_Project_Directive_NorthStar_FastTrack_v1.md` §1c 부속 · `COS_NorthStar_Alignment_Memo_2026-03-24.md`. 본 문서는 **현재 코드 분기**만 정본이며, 그 서사와 충돌하는 확장은 하지 않는다.

**레이어 맵:** 대표 표면 vs 워커·큐·Council 등 오케스트레이션을 한 장으로 겹친 해석은 `COS_Executive_vs_Orchestration_Layers_2026-03-27.md` (에스컬레이션은 v0 느슨 → 점진 조정).  
**프로젝트 인테이크 sticky 세션** (킥오프 후 Council/dialog 재침투 방지): `COS_Project_Intake_Sticky_Session_2026-03.md`.

---

## 0. 라우팅 순서 (계약)

0. **`버전` / `version` / `runtime status`** → SHA·부팅 시각·런타임 모드·인테이크 퍼시스트 상태. `/g1cos version` 도 동일. **Constitution v1.1:** `app.js`는 레거시 라우터보다 먼저 **`founderRequestPipeline`**을 태우며, 유틸은 gold가 `UNKNOWN`을 `PROJECT_CLARIFICATION`으로 덮은 뒤에도 **`classifyFounderRoutingLock`**(`inboundFounderRoutingLock.js`)이 **`RUNTIME_META` / `META_DEBUG`**로 다시 고정한다(공백·문장부호·인테이크 중 포함). **2026-04-01:** 파이프라인은 **`QUERY_LOOKUP`·`STRUCTURED_COMMAND` 인텐트를 처리하지 않고 `null` 반환** → `runInboundCommandRouter`가 조회·구조화 명령 전담. **같은 날 1b:** 파이프라인 본문 **3b**에서 인테이크 취소·execution spine·spec 스레드·clean start·대표 표면을 **커맨드 라우터와 같은 순서**로 처리할 수 있으며, 응답은 trace에 `pipeline_response_type` 등을 남긴다. **같은 날 1c:** founder 경로에서 pipeline miss 시 command router는 **`QUERY_LOOKUP`/`STRUCTURED_COMMAND` 의도일 때만** 진입(비-쿼리 miss는 deterministic fallback). 대표 경로(DM/멘션)에서 **`runInboundAiRouter`는 함수 입구에서 즉시 차단**. 실행기 미스 시 대표 경로는 **dialogue 계약 폴백**. `app.js`는 **`G1COS_FOUNDER_DOOR` JSON 로그** 및 **`inbound_audit`**(inbound-turn-trace JSONL) 기록.
1. `도움말` / `운영도움말`  
1b. **`tryFinalizeProjectIntakeCancel`** (`projectIntakeSession.js`) — 첫 줄만 `인테이크 취소`/`cancel intake` 등; 세션 있으면 제거·안내, 없으면 noop 표면.  
1c-exec. **★ Execution Spine** (`executionSpineRouter.js`) — `hasOpenExecutionOwnership(metadata)` → post-lock 스레드. `tryFinalizeExecutionSpineTurn` 가 progress·escalation·completion·기본(running status)를 처리. **Council/matrix가 final speaker 되지 못함.** AI 라우터에도 동일 guard 존재. (2026-03-29 신규)  
1c. **활성 프로젝트 인테이크(pre-lock)** → **`tryFinalizeProjectSpecBuildThread`** (`projectSpecSession.js`) — `isPreLockIntake`일 때만. `tryFinalizeSlackQueryRoute`/`tryFinalizeG1CosLineageTransport`/플래너 **하드 락**에 걸리면 **null**로 다음 분기에 양보. **`isCouncilCommand`** 면 **`buildProjectIntakeCouncilDeferSurface`**. 그 외 **spec 병합**(`extractStructuredAnswers`·`extractFutureBacklog`·`extractProceedIntent`·`extractApprovalRules`)·`computeSufficiency` → 충분·`nearSufficient&&proceed`면 **`project_spec_execution_ready`**(`createExecutionPacket`·`createExecutionRun`·`transitionProjectIntakeStage → execution_running`)·아니면 **`project_spec_refine`**. **세션을 삭제하지 않고 execution_running으로 전이**. Council 메모·업무등록 푸터 패밀리 금지 정본은 코드 내 `PROJECT_SPEC_BUILD_ZONE_BANNED_SUBSTRINGS`·`scripts/test-calendar-build-thread-no-council-turn2.mjs` 참고.  
2. **결정 패킷 짧은 회신** (`tryFinalizeDecisionShortReply`) — 스레드 키로 tail에서 패킷 로드; **`evaluateApprovalPolicy` v1**은 채널 `getEnvironmentContext`·`metadata.env_key`·기본 `dev`의 **환경 프로필**과 선택 **옵션**으로 티어 산출. `pick` 시 큐 **`queued`** vs **`pending_executive`**·`approval_policy_tier`. 나머지 동일(조회보다 앞).
3a. **`start_project` 실행 승인(충분성 통과)** (`tryStartProjectLockConfirmedResponse` / `startProjectLockConfirmed.js` + `assessScopeSufficiency`) — **인테이크가 비활성**이거나 1c가 양보한 경우 등, 직전 COS 턴이 **킥오프**/**정제**이고 transcript **충분성**+확정 시그널이 맞으면 `start_project_confirmed`·`spec_intake` 큐. Council·APR·`업무등록:` 유도 없음.  
3b. **`start_project` 정제 루프** (`tryStartProjectRefineResponse`) — 3a 미스이지만 직전 COS가 킥오프/정제이고 Council/새 킥오프가 아니면 `start_project_refine` 표면. **활성 인테이크+1c가 처리하는 턴**에서는 보통 3a/3b에 도달하지 않음. APR 없음.  
4. **Clean `start_project` Front Door** (`resolveCleanStartProjectKickoff` in `startProjectKickoffDoor.js`) — `툴제작:`·빌드 시그널 등 **새 킥오프**는 **lineage·조회보다 앞**에서 `tryExecutiveSurfaceResponse`(선택 `startProjectToneAck`)로 종료(`clean_start_project_front_door`). 스레드 **푸시백**(예: 기준안 먼저)이면 버퍼 transcript에서 **가장 최근 킥오프 사용자 줄**을 회수해 동일 계약 응답.
5. **M4 lineage drill-down** (`tryFinalizeG1CosLineageTransport`) — 한 줄: `턴 <uuid>` / `추적` / `trace` · `패킷 PKT-…` · **`상태 STP-…`** / `status STP-…`(M2b `status-packets.jsonl` 감사) · `워크큐 AWQ-…` · **`워크큐 목록` / `워크큐 대기`**(최근·`pending_executive`+`queued`) · **`실행 큐 목록` / `고객 피드백 목록`**(`cos-workspace-queue.json`) · **`실행 큐 CWS-…` / `고객 피드백 CFB-…`** 드릴다운 → `inbound-turn-trace.jsonl`·감사 JSONL(결정·상태)·`agent-work-queue.json`·워크스페이스 큐 JSON **읽기 전용** (`responder: query`, `response_type: lineage_*`). 워크큐 응답에 **`queued`/`pending_executive` → `커서발행`/`이슈발행`/`수파베이스발행` 실행 브리지**·`in_progress` 시 **`워크큐증거`/`러너증거`**·목록 푸터 **CI 훅(`COS_CI_HOOK_*`)** 안내·**`proof_refs` 길이 요약**(과도한 줄 truncate). **조회(PLN/WRK 한 줄)보다 앞**.
6. 조회 전용 (`tryFinalizeSlackQueryRoute`)  
7. 플래너 하드 락  
8. `runInboundStructuredCommands` (내부 실행 어휘). 포함: **`워크큐*`**(`AWQ-*`, `data/agent-work-queue.json`) · **`실행큐계획화`/`실행큐계획`** `CWS-…` 또는 **인자 없음 / `최근`/`latest`** → 가장 늦게 쌓인 미승격 spec 큐를 PLN·WRK로 승격(`workspaceQueuePromote.js`). **`커서발행`·`이슈발행`/`깃허브발행`·`수파베이스발행` 성공 시** 동일 WRK 활성 `AWQ-*`에 **`linkAgentWorkQueueRunForWork`** → `linked_run_id` 또는 증거-only **`dispatch_run:<RUN>`** · **`COS_AGENT_BRIDGE_URL`** 설정 시 성공 직후 **`agentBridgeOutbound.js`** 가 외부 URL로 **`tool_dispatch`** JSON POST(fire-and-forget). **증거만**: `워크큐증거`·`러너증거`(`proof_refs` append, 상태 유지). **옵션 HTTP**: `COS_CI_HOOK_PORT` + `COS_CI_HOOK_SECRET` 설정 시 `app.js`가 **`GET /cos/health`**(무인증)·**`POST /cos/ci-proof`**(`src/runtime/ciWebhookServer.js`)로 증거 append.  
9. **Surface intent** (`tryExecutiveSurfaceResponse`) — 예: `결정비교:` → 얇은 결정 패킷 Slack 텍스트 + (메타 있을 때) 감사 `decision-packets.jsonl` append·스레드 tail 저장; **`전략 검토:`·`리스크 검토:`** 등 v0 가이드 응답; **`ask_status`** 는 **`executiveStatusRollup.js`** 로 AWQ·PLN·WRK·**실행 큐(`spec_intake`)** 로컬 스토어 집계를 상태 패킷 본문에 합성(v1); **`start_project`** (`프로젝트시작`/`툴시작`/`툴제작` 등, `classifySurfaceIntent` / **`tryClassifyStartProject`**: 접두 + **빌드 시그널** `tryClassifyStartProjectByBuildSignals`) — **첫 응답 계약**은 **`buildStartProjectAlignmentSummary`**: (1) 내가 이해한 요청 (2) 기본 MVP 가정안 (3) 포함/제외 (4) 핵심 질문 2~3 (5) 무응답 기본값 (6) 다음 산출물 · APR 없음 명시; 대표 표면 **조용 푸터**: 실행 정렬 큐 한 줄 + (`COS_FAST_SPEC_PROMOTE=1` 시) PLN·WRK 승격 블록; **`COS_START_PROJECT_VERBOSE_QUEUE=1`** 시 예전 CWS·`실행큐계획화` 코칭 패턴 노출. **`product_feedback`** (`피드백:`/…)는 (메타 있을 때) **`customerFeedbackAwqBridge`** — CFB + **`feedback_follow_up` AWQ 초안** · `approvalMatrixStub` `customer_feedback_intake` 티어 · `linked_awq_id`; 구조화 **`고객피드백:`**·자연어 피드백 인테이크도 동일 브리지; **`hold_pause`·`request_deploy_readiness`** 등은 각각 `response_type`·finalize `command_name`·trace `surface_intent` 에 동일 라벨(패킷만 `decision_packet`). 다각은 `협의모드:`.  
10. `runInboundAiRouter` — `classifyInboundResponderPreview`: 도움말 다음 **`start_project_confirmed`** → **`start_project_refine`** → **Front Door** → …; AI 꼬리·내비 본문도 동일 순서.  
10a. **Dynamic Playbook Interpretation** (`dynamicPlaybook.js`) — `interpretTask(trimmed)` → task hypothesis; research 패턴 매칭 시 **`research_surface`**(`representativeResearchSurface.js`), 그 외 **`partner_surface`**(`cosNaturalPartner.js`). **ordinary input → council 경로 제거됨** (2026-03-29). Playbook은 thread 기준 `PBK-...` 생성, 3회 반복 시 promoted.  
10b. **명시 Council** — `isCouncilCommand(trimmed)` true일 때만 `responder: council`. `upsertApprovalRecord` 생략 / dialog  

---

## 1. 한 줄 요약

- **평문**(조회·플래너 락·내비 트리거·Council 접두가 아님) → **`runCosNaturalPartner`** (`responder: dialog`, `cos_natural_dialog`; 스레드에 직전 PLN 이 있으면 `cos_natural_dialog_thread_plan_hint`).
- **Slack 이벤트 dedup (replay)**: `registerHandlers` → `shouldSkipEvent` (`src/slack/eventDedup.js`). 기본은 프로세스 메모리·10분 TTL. **여러 인스턴스**면 `SLACK_EVENT_DEDUP_FILE`(공유 JSON; tmp+rename으로 쓰기) 옵트인; `SLACK_EVENT_DEDUP_DISABLE=1` 로 끄기. 부팅 `formatEnvCheck` 에 **`slack_event_dedup:`** 한 줄(`getSlackEventDedupSummary`). 상세: `src/runtime/env.js` 주석.
- **Slack 버퍼**: `registerHandlers` 가 매 턴 user/assistant 를 `slackConversationBuffer` 에 기록 → `app.js` 플래너·조회 직반환도 동일 스레드 후속 `dialog` 가 맥락을 본다. **`/g1cos`**: `registerSlashCommands` 가 `recordSlashCommandExchange` 로 user 표시 문자열·응답 텍스트를 남김(DM은 `im:` 키로 일반 DM 과 공유). **옵트인 영속(1단계)**: `CONVERSATION_BUFFER_PERSIST=1` 이면 `data/slack-conversation-buffer.json`(또는 `CONVERSATION_BUFFER_FILE`)에 디바운스 저장, 기동 시 로드·graceful shutdown 시 flush (`app.js`·`startup.js`). 슬래시 기록 끄기: `CONVERSATION_BUFFER_RECORD_SLASH=0`. **프로젝트 인테이크 세션**도 동일 패턴 옵트인: `PROJECT_INTAKE_SESSION_PERSIST=1`·`PROJECT_INTAKE_SESSIONS_FILE`(선택)·`loadProjectIntakeSessionsFromDisk` / `flushProjectIntakeSessionsToDisk` (`app.js`).
- **Council** → **`협의모드:` / `매트릭스셀:` / `관점추가 `** 등 **`isCouncilCommand`** 가 참일 때만 (`runCouncilMode`).
- **플래너 하드 락**(`hit`/`miss`) → AI 꼬리 진입 후에도 **재확인** → `runPlannerHardLockedBranch`.
- **DM/스레드 맥락**: `slackConversationBuffer` + `metadata.thread_ts` 로 최근 턴을 dialog·내비·Council에 합성.

---

## 2. 주요 파일

| 경로 | 역할 |
|------|------|
| `app.js` | `handleUserText` — **M2a** `runInboundTurnTraceScope` 안에서 **`founderRequestPipeline`** 선행(3b pre-AI 스파인 포함) → 미스 시 **`runInboundCommandRouter`** → founder 경로면 deterministic fallback / 아니면 **`runInboundAiRouter`**. |
| `src/core/founderRequestPipeline.js` | Constitution 파이프라인: 유틸 → **3b** pre-AI spine → 조회/구조화 `null` → phase·실행기·골드 분기. |
| `src/features/runPlannerHardLockedBranch.js` | 플래너 `hit`/`miss` 고정 분기 — `finalizeSlackResponse`·dedup·승인 생성 (`app.js` 에서 import) |
| `src/features/runInboundCommandRouter.js` | `도움말`/`운영도움말`·**`tryFinalizeProjectIntakeCancel`**·**`tryFinalizeProjectSpecBuildThread`**(활성 인테이크)·**`tryFinalizeDecisionShortReply`**·…·**`tryFinalizeG1CosLineageTransport`(M4)**·조회·…·**`tryExecutiveSurfaceResponse`** |
| `src/features/projectSpecSession.js` | 인테이크 빌드 스레드: spec mutation·`computeSufficiency`·`project_spec_execution_ready` / `project_spec_refine` |
| `src/features/projectSpecModel.js` | `ProjectSpecSession` 팩토리·MVP 시드·금지 시그니처 목록 |
| `src/features/g1cosLineageTransport.js` | **M4**: `턴`/`패킷`/`상태 STP-…`/`워크큐 AWQ-…`·**`워크큐 목록`/`대기`**·**`실행 큐 목록`/`고객 피드백 목록`**·**`CWS-`/`CFB-`** 드릴다운·감사/큐/turn JSON — 워크큐 항목별 **실행 브리지**(`커서발행`·`워크큐*` 등) |
| `src/features/agentWorkQueue.js` | M3 큐·`linkAgentWorkQueueRunForWork`·`patchAgentWorkQueueItem` |
| `src/features/executiveSurfaceHelp.js` | 대표용 짧은 도움말 |
| `src/features/surfaceIntentClassifier.js` | Surface intent 규칙 분류 (`결정비교:` 등) |
| `src/features/tryExecutiveSurfaceResponse.js` | Surface → 즉시 응답 (async; `decision_compare` 시 `packet_id`·렌더) |
| `src/features/decisionPackets.js` | M2b: 패킷 빌드·Slack 렌더·`parseDecisionShortReply`·tail 저장/로드·`tryFinalizeDecisionShortReply` |
| `src/features/approvalMatrixStub.js` | 얇은 승인 티어 스텁 (`decision_pick` / `decision_defer`) |
| `src/storage/paths.js` | `resolveDecisionPacketsJsonlPath`, `resolveThreadDecisionTailPath` (env 오버라이드) |
| `src/features/statusPackets.js` | M2b 상태 패킷 스키마·슬랙 렌더·`status-packets.jsonl` 감사 |
| `src/features/executiveStatusRollup.js` | **`ask_status`** 운영 스냅샷 — AWQ·`plans`·`work_items`·`cos-workspace-queue`(spec) 집계 → 패킷 필드 |
| `src/features/workspaceQueuePromote.js` | **`실행큐계획화`** — spec 큐 → `createPlanFromIntake` · WRK 연결 |
| `src/features/statusPacketStub.js` | 레거시 — `statusPackets.js` 위임 |
| `src/features/runInboundStructuredCommands.js` | 저장소/환경/자동화/승인/브리프/채널·프로젝트/업무·GitHub·Cursor·결정·교훈 등 **고정 문자열 분기** (~2k lines). 미스 시 `undefined`. |
| `src/features/runInboundAiRouter.js` | 조회 직후 **인테이크 취소** → sticky **인테이크** 중 Council 아님 시 `tryProjectIntakeExecutiveContinue` → 내비 → planner 방화벽 → **명시 Council 시 활성 인테이크면 연기 표면** → Council → dialog; **`classifyInboundResponderPreview`** — 도움말·**취소**·`start_project_*`·Front Door·조회·…·**인테이크+Council → 대표 표면**·내비·Council·dialog (구조화 미시뮬) |
| `src/features/slackConversationBuffer.js` | 스레드/DM 키, `recordConversationTurn`, `getConversationTranscript`; `CONVERSATION_BUFFER_DISABLE=1` 로 끄기. **영속**: `CONVERSATION_BUFFER_PERSIST=1`·`CONVERSATION_BUFFER_FILE`(선택)·`loadConversationBufferFromDisk` / `flushConversationBufferToDisk` |
| `src/features/cosWorkspaceQueue.js` | **최단거리 인테이크**: `실행큐:`·`고객피드백:` 및 **자연어**(`실행큐에 올려줘`+다음 줄 등, `tryParseNaturalWorkspaceQueueIntake`) → `data/cos-workspace-queue.json` |
| `src/slack/registerHandlers.js` | `handleUserText` 메타에 `thread_ts` 전달; **`g1cos_query_nav_*`** 버튼 → `tryFinalizeSlackQueryRoute` + 스레드 `postMessage`; **`g1cos_dialog_queue_*`** → 워크스페이스 큐 적재 |
| `src/slack/dialogQueueConfirmBlocks.js` | dialog 응답 하단 큐 확인 버튼 빌드·페이로드 인코딩 (`SLACK_DIALOG_QUEUE_BUTTONS=0` 로 끔) |
| `src/slack/registerSlashCommands.js` | **`/g1cos`** — **lineage(M4)** → 조회 `tryFinalizeSlackQueryRoute`; 성공 시 `in_channel`. 인자 없음/`help`/`도움말`/`사용법`/`?` → ephemeral |
| `src/features/cosNaturalPartner.js` | 평문 COS 대화 (`callText`), `priorTranscript` |
| `src/agents/council.js` | `conversationContext` → 페르소나 LLM 입력 |
| `src/features/topLevelRouter.js` | `finalizeSlackResponse` — 끝에서 **`markInboundTurnFinalize`** (M2a `AsyncLocalStorage` 턴 메타). **`responder: query` 는 Council 누수 휴리스틱 전면 스킵**. |
| `src/features/inboundTurnTrace.js` | M2a append-only **`data/inbound-turn-trace.jsonl`** (`INBOUND_TURN_TRACE_FILE`·`INBOUND_TURN_TRACE_DISABLE`). 필드: `turn_id`, `thread_key`, `channel_id`, `user_id`, 정규화 입력, `final_responder`, nullable 링크·`packet_id`·**`work_queue_id`(M3)**, `duration_ms`, `status`. |
| `src/features/agentWorkQueue.js` | M3: 결정 `pick` enqueue·**`patchAgentWorkQueueItem`**(상태·블로커·WRK/RUN·`proof_refs_append`)·패킷 `linked_*` 배열·`data/agent-work-queue.json` |
| `src/features/queryOnlyRoute.js` | `tryFinalizeSlackQueryRoute` — `stripSlackMarkupArtifacts` + 조회 줄 추출·`prepped` 폴백; 성공 시 **`queryResponseBlocks`** 로 `{ text, blocks }` (기본 on) |
| `src/slack/queryResponseBlocks.js` | 조회 단락 → `section`+`mrkdwn`; `effectiveQueryLine` 시 하단 **네비 `actions`**; `SLACK_QUERY_BLOCKS=0` 이면 본문은 평문·네비만 블록 가능 |
| `src/slack/queryNavButtons.js` | PLN/WRK 상호 네비 버튼; `SLACK_QUERY_NAV_BUTTONS=0` 으로 끔 |
| `src/features/cosToolRegistry.js` | `COS_TOOL_REGISTRY_V0` — `pipeline`·`gate_policy` (North Star 툴 정렬) |
| `src/features/cosToolTelemetry.js` | `logCosToolRegistryBind` → `tool_registry_bind`; `inferCosToolRegistryIdFromResponder` |
| `src/features/cosToolRuntime.js` | `invokePlanQueryTool`; `logStructuredCommandToolRegistry` (`runInboundStructuredCommands` 맨 앞) |
| `src/slack/councilCommandPrefixes.js` | `isCouncilCommand` |
| `src/testing/inboundResponderClassify.js` | `classifyInboundResponderPreview` **re-export** (fixture = 프로덕션 분기 단일 소스) |
| `src/testing/routerSyncSnapshot.js` | 플래너·조회 스냅샷 (앱과 동일 파이프) |
| `scripts/replay-slack-fixtures.mjs` | Slack payload 회귀 |

---

## 3. AI 꼬리 순서 (`runInboundAiRouter` 내부)

1. **조회** (`tryFinalizeSlackQueryRoute`) — 성공 시 즉시 반환.
2. **`tryFinalizeProjectIntakeCancel`** — 취소 문구면 대표 표면.
3. **Council 접두 아님** + 활성 인테이크 → **`tryProjectIntakeExecutiveContinue`**.
4. **내비게이터** — `COS` / `비서` 트리거 (본문 비면 인트로).
5. `routeTask` — 라우터 JSON (dialog/Council 공통 참고).
6. **플래너 방화벽**: `normalizePlannerInputForRoute` + `analyzePlannerResponderLock` → `hit`/`miss`면 즉시 `runPlannerHardLockedBranch` (**버퍼에 유저 턴 기록 없음**).
7. **명시 Council** — 활성 인테이크면 **`buildProjectIntakeCouncilDeferSurface`**; 아니면 `runCouncilMode` (+ `conversationContext`).
8. 그 외 → **dialog** (`runCosNaturalPartner`, + `priorTranscript`).

각 AI 응답 직전에 `getConversationTranscript` → 유저 턴 기록 → LLM → 어시스턴트 턴 기록.

---

## 4. 로그·관측

- `dialog_route_entered`, `router_responder_selected` / `locked` with `responder: dialog`.
- 플래너에 막힌 경우: `council_or_dialog_blocked`, `via: pre_ai_firewall`.
- 상호작용 기록: `orchestration_mode: cos_natural_dialog` / `council` 등.

---

## 5. 관련 핸드오프 (역할 분담)

| 문서 | 비고 |
|------|------|
| `Regression_Harness_slack_fixtures.md` | fixture·수동 5건 |
| `COS_NorthStar_Workflow_2026-03.md` | North Star·고감성 |
| `COS_Operator_QA_Guide_And_Test_Matrix.md` | 운영·QA — 수동 테스트 매트릭스 (제품 헌법 아님) |
| `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` | 구현 ledger / handoff — **§23.18–23.19** |
| `COS_Navigator_260323.md` | `COS`/`비서` 내비게이터 |
| `Router_Lockdown_260318_handoff.md` | **역사적** — finalize·누수 규칙; 순서는 본 문서 우선 |
| `Query_Commands_Council_Free_handoff.md` | 조회 전용 경로 |
| `WRK-260327_shortest_path_post_command_media.md` | 로컬 **Executive MVP 시드** 완료 선언·`커서결과기록`→AWQ 증거(run·WRK 폴백) |

**소통 규칙**: Cursor / ChatGPT / 사람 공통으로, 작업 후 `docs/cursor-handoffs/` 및 v2 문서 해당 절을 갱신 (`.cursor/rules/handoff-docs-update.mdc`).

---

## 6. 다음 패치 (로드맵)

- **완료**: `runInboundCommandRouter.js` — 도움말·조회·동기 로그·플래너 락·구조화 명령 pre-AI 파이프라인.
- **완료(1단계)**: 대화 버퍼 **로컬 JSON 스냅샷** (`CONVERSATION_BUFFER_PERSIST`) — 단일 프로세스·재시작 복구용; 멀티 인스턴스 공유는 아님.
- 대화 버퍼 **공유 영속화**(Supabase 등) — 멀티 인스턴스·외부 스토어.
- **구조화 문자열 응답**: `runInboundCommandRouter` 가 `finalizeSlackResponse` 로 `responder: structured` · `response_type: structured_command` · `command_name`(첫 토큰) 마감 → 턴 trace 정합. (`{ text, blocks }` 등 비문자열은 기존처럼 raw 반환.)

## 6b. 2026-03-23 보강 (계획상세/발행목록/진행 “Council처럼 보임” 완화)

1. **`finalizeSlackResponse`**: `responder === 'query'` 이면 `looksLikeCouncilSynthesisBody` 를 **실행하지 않음** — 저장 데이터에 “한 줄 요약·페르소나” 등이 있어도 `[조회] … 차단` 으로 바꾸지 않음.
2. **`tryFinalizeSlackQueryRoute`**: 입력에 `stripSlackMarkupArtifacts` 적용, 추출 실패 시 `prepped` 로 `handleQueryOnlyCommands` 재시도; 실제 매칭된 줄로 `command_name` 로그 정합.
3. **`runInboundCommandRouter`** (구 `handleUserText` 상단): **도움말 다음·채널/프로젝트 컨텍스트 로딩 전**에 조회 finalize — 컨텍스트 API 지연/예외로 조회가 막히지 않게.
4. **`scripts/test-router-lockdown.mjs`**: 조회는 poison 문자열도 통과(신뢰), `dialog` 는 기존처럼 `[COS]` 치환 유지.
5. **`extractInlineQueryCommand` (추가)**: `@G1 COS` 등 **라틴/숫자 바로 뒤에 한글 조회 접두가 붙는** rich_text 병합(`COS계획진행PLN-…`)을 잡기 위해 `(?<=[A-Za-z0-9])` 경계 허용. 조회 실패 시 dialog가 에러 나면 `runLegacySingleFlow` → `composeFinalReport`(한 줄 요약·추천안·내부 처리 정보)로 떨어져 “Council 비슷한” 장문으로 보일 수 있음.
6. **`runInboundAiRouter`**: `COS …` / `비서 …` **내비 트리거**인데 본문이 `계획진행 PLN-…` 등 **조회 한 줄이면** `tryFinalizeSlackQueryRoute(본문)` 으로 **내비 LLM보다 조회 우선**. `협의모드:` 로 시작하되 질문 부분이 **조회 한 줄만**이면(`isStructuredQueryOnlyLine`) Council 진입 전에 동일하게 조회 우선.
7. **`isCouncilCommand`**: ZWSP 제거 후 **`parseCouncilCommand` 가 성공**하고 **`isStartProjectKickoffInput` 이 아닐 때만** 참 — `협의모드 ` 접두만 맞고 파싱 불가인 장문은 Council·잠금 게이트에 걸리지 않음.
8. Fixture `16_cos_prefix_plan_progress_query.json` — `COS 계획진행 PLN-…` → `final_responder: query`.
9. **`COS 계획등록: …` / `비서 계획등록 …`**: 첫 줄이 `COS`/`비서` 내비라 **전체 문자열**은 `planner_lock: none` 인데, **본문**만 보면 플래너 인테이크 → `runPlannerHardLockedBranch(본문 normalize + lock)` 으로 처리 (내비 LLM·Council 로 새지 않음). Fixture `17_cos_body_planner_register.json`.

---

### Owner actions

```bash
cd /path/to/g1-cos-slack
npm test
```

배포 후: `COS_Operator_QA_Guide_And_Test_Matrix.md` §3.3 체크리스트(5건) 실행.
