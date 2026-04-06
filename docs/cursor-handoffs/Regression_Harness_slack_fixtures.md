# Automated Regression Harness — Slack COS

> **문서 권위:** `00_Document_Authority_Read_Path.md` — 본 파일은 **회귀·하네스** 메모이며 제품 헌법 아님.  
> **North star**: 조회/planner는 Council 없이 고정 응답; **평문은 `dialog`(자연어 COS)**; **`협의모드:` 등 명시만 Council**.  
> 본 하네스는 **로컬에서** 인바운드 병합 → 동기 라우팅 스냅샷 → query 응답(실스토리지) → planner 골든 문자열을 재현한다. **Council·dialog LLM은 호출하지 않는다.**

**격리 (2026-03-28)**: fixture마다 `clearConversationBuffer`와 함께 **`clearProjectIntakeSessionsForTest`**를 호출한다. (`slack_metadata`가 비어 있으면 스레드 키가 `ch:no_channel:t:root`로 겹쳐, 이전 예제의 활성 인테이크가 다음 예제를 오염시키는 것을 방지.)

**헌법 골드 스펙 (2026-04-01)**: `scripts/tests-constitutional/test-founder-gold-spec-v1.mjs`는 **턴마다 `clearProjectIntakeSessionsForTest`만** 호출해 파이프라인 3b의 spec 스레드 선점을 막고, **테스트 4 scope lock → 테스트 7 승인**까지 이어지는 **`clearExecutionRunsForTest`는 파일 최상단 한 번만** 유지한다.

**Outbound / provider truth (2026-04-02)**: `scripts/test-live-provider-truth-alignment.mjs` + `scripts/test-execution-outbound.mjs`가 Cursor Cloud launch URL·Supabase live dispatch URL·`buildProviderTruthSnapshot`(Cursor `live`/`live_ready`/`manual_bridge`/`unavailable`, Supabase `live`/`live_ready`/`draft_only`/`not_configured`)·실행 패킷 렌더에서 `live_ready`≠`draft_only`를 고정한다(`npm test` 포함).

**Founder operational probe (2026-04-04, v13.4)**: `scripts/test-founder-operational-probe.mjs` — SHA·Cursor/Supabase 질문이 **`runFounderDirectKernel` 입구 운영 메타 숏서킷**으로 처리되어 `callText`/`callJSON`이 호출되지 않음(`npm test` 포함).

**Partner natural sanitize (2026-04-04)**: `scripts/test-partner-natural-sanitize.mjs` — 아티팩트 회귀 경로의 `planFounderConversationTurn` 파트너 폴백에서 **`sanitizePartnerNaturalLlmOutput`**·trace `partner_output_sanitized`(`npm test` 포함).

**Founder DM 파일 인테이크 (2026-04-01, vNext.13.6)**: `scripts/test-vnext13-6-*.mjs` — `slackFileIntake`·`latest_file_contexts` 병합·스냅샷·합성기. 실슬랙 파일 fetch 없음(`extractMvpFileFromBuffer`·`pdf-parse` 샘플 PDF 사용).

**Founder subtraction / 파일 실패 순도 (2026-04-05, vNext.13.7)**: `scripts/test-vnext13-7-*.mjs` — 실패→플래너 미주입·HTML 페이로드 감지·PDF 시그니처 우선·아웃바운드 금지 마커.

**Founder zero-heuristic / 단일 표면 (2026-04-01, vNext.13.8)**: `scripts/test-vnext13-8-*.mjs` — 커널 전 접두 제거·승인 패킷 본문 병합 없음·`PARTNER_NATURAL` 고정·프롬프트 Council 노출 완화.

**Attachment truth / founder purity (2026-04-01, vNext.13.9)**: `scripts/test-vnext13-9-*.mjs` — 실패 재주입 금지·short-circuit·`SLACK_FILE_ACQUIRE_TRACE`·창업자 SHA 암시 shortcut 제거·아웃바운드 purity.

**Natural surface subtraction (2026-04-06, vNext.13.10)**: `scripts/test-vnext13-10-founder-natural-surface-harness.mjs` — **운영 커널**은 플래너 없이 단일 `runCosNaturalPartner`; launch·lineage·E2E dress 등은 **`runFounderArtifactConversationPipeline`** (`test-vnext13-2-slack-e2e-dress-rehearsal.mjs` 등). harness 파일 내 `COS_FOUNDER_STRUCTURED_PLANNER=1` 로 structured 분기만 검증.
**Chat-first / planner opt-in (2026-04-01, vNext.13.11)**: `planFounderConversationTurn` 기본 `founder_chat_only`·`COS_FOUNDER_STRUCTURED_PLANNER` 는 **구조화 플래너 호출부**(아티팩트 회귀·옵트인) 정합; 앱 창업자 기본 경로는 vNext.13.10 단일 COS. `data/*.json` gitignore. 상세 `COS_vNext13_11_Founder_Chat_First_Planner_Opt_In_2026-04-01.md`.

---

## 1. 추가된 fixture 목록

`scripts/fixtures/slack/` (파일명 순)

| ID | 설명 |
|----|------|
| `01_help` | 도움말 |
| `02_mention_plan_detail_context` | 멘션 + 맥락 + 계획상세 |
| `03_dm_plan_progress` | DM 계획진행 |
| `04_multiline_second_line_query` | 멀티라인 조회 |
| `05_blockquote_query` | 인용 + 계획발행목록 |
| `06_richtext_blocks_plan_detail` | text 비고 blocks 만 |
| `07_spaced_hangul_plan_detail` | 띄어쓴 한글 + 붙여쓴 PLN |
| `08_query_usage_error` | 계획진행 ID 생략 |
| `09_work_detail_not_found` | 업무상세 not_found |
| `10_work_review_not_found` | 업무검토 not_found |
| `11_planner_empty_body` | 계획등록: 빈 본문 골든 |
| `12_planner_routing_miss` | 계획등록 파싱 miss 골든 |
| `13_council_explicit_prefix` | 협의모드: (분류만) |
| `14_free_text_not_council_prefix` | 일반 문장 → `dialog` |
| `15_navigator_cos_trigger` | `COS …` 접두 → `navigator` |
| `16_cos_prefix_plan_progress_query` | `COS 계획진행 PLN-…` → 조회 `query` |
| `17_cos_body_planner_register` | 본문만 플래너 인테이크 → `planner` |
| `18_g1cos_prefix_planner_register` | `/g1cos` 스타일 플래너 인테이크 → `planner` |
| `19_surface_ask_status` | surface intent(상태 요청) → `executive_surface` |
| `20_decision_compare_surface` | `결정비교: …` → `executive_surface` + finalize `decision_packet` / `packet_id` |
| `21_g1cos_lineage_packet_miss` | `패킷 PKT-…` 감사 미스 → `query` (`lineage_packet_miss`) |
| `22_g1cos_lineage_turn_miss` | `턴 <uuid>` trace 미스 → `query` (`lineage_turn_miss`) |
| `23_surface_strategy_review` | `전략 검토: …` → `executive_surface` (`request_strategy_review`) |
| `24_surface_risk_review` | `리스크 검토: …` → `executive_surface` (`request_risk_review`) |
| `25_surface_hold_pause` | `이건 보류: …` → `executive_surface` (`hold_pause`) |
| `26_surface_deploy_readiness` | `배포 준비` 등 → `executive_surface` (`request_deploy_readiness`) |
| `27_g1cos_lineage_status_packet_miss` | `상태 STP-…` 감사 미스 → `query` (`lineage_status_packet_miss`) |
| `27_start_project_calendar_gallery_kickoff` | 갤러리·캘린더 `툴제작:` → `start_project` 정렬 요약·Council 금지 (`classifyInboundResponderPreview` Front Door) |
| `28_start_project_overrides_council_prefix` | `협의모드 툴제작:` → `start_project` 표면 |
| `29_start_project_pushback_baseline_first` | 스레드 푸시백 + `prior_conversation`/`slack_metadata` → 이전 킥오프 줄 회수 후 정렬만 |
| `30_start_project_lock_confirmed_turn2` | 킥오프 assistant 턴 다음 사용자 답변+`진행해줘`(충분) → `start_project_confirmed`·Council/업무등록 금지 |
| `31_start_project_short_proceed_refine` | 동일 맥락에서 짧은 `진행해줘`만 → `start_project_refine`(충분성 미달)·잠금 표면 비발생 |
| `99_repr_ceo_failure_placeholder` | 대표 재현 실패 슬롯 (SKIP) |

---

## 2. 추가된 테스트/모듈 파일

| 경로 | 역할 |
|------|------|
| `scripts/replay-slack-fixtures.mjs` | fixture 로더 + 리포트 + exit code |
| `src/testing/routerSyncSnapshot.js` | `buildRouterSyncSnapshot` (`runInboundCommandRouter` 동기 단계와 동일 파이프라인) |
| `src/features/runInboundCommandRouter.js` | pre-AI: …·**`start_project` 실행 승인(충분성)**·**`start_project` 정제**·**Front Door**·**M4 lineage**·조회·…·**surface**·… |
| `scripts/test-start-project-kickoff-contract.mjs` | 캘린더 킥오프 계약 + 푸시백 회수 (`npm test` 포함) |
| `scripts/test-start-project-lock-confirmed.mjs` | 충분성 게이트·짧은 진행 → 정제(refine) (`npm test` 포함) |
| `scripts/test-henry-calendar-intake-regression.mjs` | 전사 없이 sticky 인테이크만으로 2턴 잠금·Council 문자열 금지 (`npm test` 포함) |
| `scripts/test-calendar-build-thread-no-council-turn2.mjs` | **`ProjectSpecSession`** 턴2: spec mutation·future backlog 격리·`project_spec_execution_ready`·Council/업무등록 시그니처 금지 (`npm test` 포함) |
| `scripts/test-project-intake-cancel.mjs` | 인테이크 취소·활성 세션 중 협의모드 사전 라우터·`classifyInboundResponderPreview` (`npm test` 포함) |
| `scripts/test-project-intake-persist.mjs` | `PROJECT_INTAKE_SESSION_PERSIST` JSON 로드/플러시 (`npm test` 포함) |
| `src/features/startProjectLockConfirmed.js` | 실행 승인·정제 루프 · transcript 마지막 COS=킥오프/정제 · sticky 세션 병행 · `scopeSufficiency.js` |
| `src/features/projectIntakeSession.js` | 킥오프 후 스레드별 활성 인테이크(목표 한 줄)·잠금 시 종료 |
| `src/features/scopeSufficiency.js` | MVP 범위 충분성 휴리스틱(후속 단계 격리·sticky 시 벤치 완화) |
| `scripts/test-surface-intent.mjs` | Fast-Track surface 분류·**`product_feedback`**(`피드백:`) · **상태 패킷 STP-** (`npm test` 포함) |
| `scripts/test-customer-feedback-awq-bridge.mjs` | CFB → **`feedback_follow_up` AWQ** · `linked_awq_id` · `customer_feedback_intake` 승인 티어 (`npm test` 포함) |
| `scripts/test-start-project-fast-promote.mjs` | **`COS_FAST_SPEC_PROMOTE=1`** 시 `start_project` 표면에서 **실행큐계획화**까지 한 턴 (`npm test` 포함) |
| `scripts/test-agent-bridge-outbound.mjs` | **`COS_AGENT_BRIDGE_URL`** 아웃바운드 `tool_dispatch` POST 스모크 (`npm test` 포함) |
| `src/features/agentBridgeOutbound.js` | 커서·GitHub·Supabase **발행 성공 → 외부 워커** JSON (옵트인) |
| `scripts/test-executive-status-rollup.mjs` | **`ask_status`** AWQ·스토어·**실행 큐(spec)** 롤업 (`executiveStatusRollup.js`, `npm test` 포함) |
| `scripts/test-workspace-queue-promote.mjs` | **`실행큐계획화`** · `findLatestPromotable` · WRK `source_workspace_queue_id` (`npm test` 포함) |
| `scripts/test-status-packet.mjs` | M2b `statusPackets` 스키마·감사 JSONL (`npm test` 포함) |
| `src/features/runInboundStructuredCommands.js` | 구조화 명령 대량 분기 (미스 시 AI로 진행) |
| `src/features/runInboundAiRouter.js` | `runInboundAiRouter` + `classifyInboundResponderPreview` (단일 소스) |
| `src/testing/inboundResponderClassify.js` | 위 모듈 re-export (fixture import 경로 유지) |
| `src/slack/registerSlashCommands.js` | `/g1cos` — lineage(M4)·조회·**`recordSlashCommandExchange`** |
| `scripts/test-slash-g1cos.mjs` | 슬래시 본문 = 조회 라우트 스모크 (`npm test` 포함) |
| `scripts/test-slash-buffer-record.mjs` | 슬래시 버퍼 키·기록·옵트아웃 스모크 (`npm test` 포함) |
| `scripts/test-g1cos-lineage-transport.mjs` | M4 패킷·**상태 `STP-*`**·워크큐·**워크스페이스 큐**(`실행 큐 목록`·`고객 피드백 목록`·`CWS-`/`CFB-`)·**`워크큐 목록`/`대기`**·증거·`proof_refs` (`npm test` 포함) |
| `docs/cursor-handoffs/COS_CI_Proof_Hook_Example_GitHubActions.yml` | CI → `POST /cos/ci-proof` 참고 워크플로 (복사용) |
| `src/features/g1cosLineageTransport.js` | `tryFinalizeG1CosLineageTransport` |
| `scripts/test-query-blocks.mjs` | Block Kit 래퍼 on/off 스모크 |
| `src/slack/queryResponseBlocks.js` | 조회 응답 Block Kit 단락 |
| `src/features/slackConversationBuffer.js` | DM/스레드 대화 버퍼; 슬래시 키 `buildSlashCommandBufferKey`; 옵트인 JSON 영속 (`CONVERSATION_BUFFER_PERSIST`); `CONVERSATION_BUFFER_RECORD_SLASH` |
| `scripts/test-conversation-buffer-persist.mjs` | 버퍼 flush/로드 스모크 (`npm test` 포함) |
| `scripts/test-inbound-turn-trace.mjs` | M2a JSONL lineage (`runInboundTurnTraceScope` + `finalizeSlackResponse` 훅, 행 필드 **`response_type`**, `npm test` 포함) |
| `scripts/test-decision-packet.mjs` | M2b 결정 패킷·짧은 회신·스레드 tail·**M3** 에이전트 워크 큐 append (`npm test` 포함) |
| `scripts/test-agent-work-queue.mjs` | M3 큐·`linkAgentWorkQueueRunForWork`·`dispatch_run:`·`patchAgentWorkQueueItem`·`appendAgentWorkQueueProofByLinkedWork` (`npm test` 포함) |
| `scripts/test-cursor-result-structured-smoke.mjs` | 구조화 **`커서결과기록`** E2E · AWQ 증거(run 매칭·WRK 폴백) (`npm test` 포함) |
| `scripts/test-event-dedup.mjs` | Slack **`shouldSkipEvent`**: 공유 JSON·메모리·disable · **`getSlackEventDedupSummary`** (`npm test` 포함) |
| `scripts/test-ci-hook.mjs` | `handleCosCiProofJson`·**HTTP** `GET /cos/health`·`POST /cos/ci-proof`·secret (`npm test` 포함) |
| `scripts/test-work-queue-structured-cmd.mjs` | 워크큐 구조화 전체(실행허가·보류·재개·착수·**증거**·완료·취소) (`npm test` 포함) |
| `src/testing/councilLeakRules.js` | Council 누수 **단일 문자열** 규칙 (회귀 전용) |
| `src/slack/councilCommandPrefixes.js` | `isCouncilCommand` — `parseCouncilCommand` 정합 + 킥오프 제외 |
| `scripts/test-henry-turn2-scope-lock.mjs` | Henry 2턴 잠금이 Council 합성이 아님 (`npm test` 포함) |
| `scripts/test-founder-launch-gate.mjs` | v13.4: **`mockFounderPlannerRow` + 유효 `execution_artifact`** 로만 `EXECUTION_PACKET`; 레거시 intent 감지·readiness·비-launch 제안 패킷·idempotent (`npm test` 포함) |
| `scripts/test-vnext13-4-founder-no-prelaunch-from-raw-text.mjs` 등 5종 | v13.4 founder: 원문 prelaunch 금지·state carryover·아티팩트 게이트·런타임 메타 경로·sidecar 스키마 (`npm test` 포함) |
| `scripts/test-vnext13-5-*.mjs` 5종 | v13.5 preflight: 프로덕션 legacy import 0·lineage cross-check·메타 숏서킷 명시 경로·문서 정본·staging trace (`npm test` 포함) |
| `scripts/test-vnext13-5b-*.mjs` | v13.5b: spine eligibility = **pre-turn persisted lineage** 만; same-turn self-approval 차단; 2턴 persist 후 launch (`npm test` 포함) |
| `npm run test:legacy-launch-regression` | `test-founder-launch-gate.mjs` — 레거시 raw-text intent + 아티팩트 launch 스모크 (기본 `npm test` 비포함) |
| `src/core/founderLaunchGate.js` | **`runFounderLaunchPipelineCore`** — artifact-gated 또는 legacy 회귀 `trace_tags.legacy_raw_text_launch` 만; 창업자 표면 `founderLaunchFormatter.js`; **project space resolution trace**; raw-text 프로덕션 경로 없음 |
| `scripts/test-project-space-bootstrap-hardening.mjs` | thread-first space·보수적 exact 라벨/alias·cross-thread active run·fingerprint (`npm test`) |
| `src/features/projectSpaceBootstrap.js` | `getOrCreateProjectSpaceForBootstrap` — fuzzy label score 재사용 제거, `resolution` 객체 |
| `src/legacy/founderLaunchIntentRawText.js` | **회귀 전용** raw-text launch 문구 감지 — `src/core`·`src/founder`·`app.js` 에서 import 금지 |
| `src/core/providerTruthSnapshot.js` | 프로바이더/스레드 truth 스냅샷 |
| `src/core/launchReadinessEvaluator.js` | launch 준비도 평가 |
| `src/core/executionLaunchPacketBuilder.js` | launch 실행 패킷·차단 페이로드 |

Planner 골든 문자열 상수: `src/features/plannerRoute.js` 의 `PLANNER_SLACK_EMPTY_BODY_MESSAGE`, `PLANNER_SLACK_ROUTING_MISS_MESSAGE` (app.js 가 참조).

---

## 3. 실행 명령

```bash
npm test                 # operations + router lockdown + fixtures
npm run test:router      # router lockdown + fixtures
npm run test:fixtures    # fixtures 만
node scripts/replay-slack-fixtures.mjs
```

---

## 4. 실패 시 무엇을 보나

- `FAIL` 행 + `errors[]` (예: `query_prefix` 불일치, `response_contains` 누락, **council_leak**)
- `council_leak fixtures:` 요약에 fixture id 나열

### Council leak 규칙 (planner/query 응답에 **하나라도** 있으면 FAIL)

- `한 줄 요약`, `종합 추천안`, `페르소나별 핵심 관점`, `가장 강한 반대 논리`, `핵심 리스크`, `실행 작업 후보로 보입니다`

---

## 5. 한계 (다음 패치)

- `classifyInboundResponderPreview`는 `runInboundAiRouter` 와 **동일 소스**이며, 도움말·조회·플래너 락 다음 **surface(`tryExecutiveSurfaceResponse`)** 까지 반영한 뒤 내비·Council·dialog 순으로 축약한다. **`runInboundStructuredCommands` 는 시뮬하지 않음** — 구조화에 걸리는 문장은 여전히 `navigator`/`dialog` 등으로 잘못 보일 수 있다.  
- **권장 다음 패치**: 대화 버퍼 **공유** 영속(Supabase·멀티 인스턴스); 툴 레지스트리 **v2**(function calling·실차단 게이트). *(버퍼 로컬 JSON 1단계: `CONVERSATION_BUFFER_PERSIST`·`test-conversation-buffer-persist.mjs`. v1 툴: `test-cos-tool-registry.mjs`·`tool_registry_bind`.)*

---

## 6. 대표 수동 Slack 테스트 (최종 5건)

스크립트 종료 시에도 동일하게 출력된다.

1. 채널 @봇 멘션 후 `계획상세 <실존 PLN-ID>` — 구조화 응답·Council 장문 비발생 확인  
2. `계획등록: <짧은 본문>` — planner 계약·저장·(필요 시) 승인 버튼  
3. `협의모드: <짧은 질문>` — Council 전용 장문만 여기서 나오는지 확인  
4. 평문 한 줄 — 자연어 대화(dialog)·Council 비진입  
5. `COS …` / `비서 …` — 내비게이터 응답(구조화)·평문 대화와 구분  

---

### Next patch recommendation

**`COS_NorthStar_Alignment_Memo_2026-03-24.md`**: **M2a** trace spine, **M2b** 얇은 패킷·승인 스텁·trace `packet_id` — 코드 기준 `decisionPackets.js`·fixture `20_decision_compare_surface`·`test-decision-packet.mjs`로 회귀 고정. 본 하네스는 Council 누수 규칙 유지.

### Owner actions (copy-paste ready)

1. **SQL**: (없음)  
2. **Local**: `npm test`  
3. **Git**: `git add scripts/fixtures scripts/replay-slack-fixtures.mjs src/testing src/slack/councilCommandPrefixes.js src/features/plannerRoute.js app.js package.json docs/cursor-handoffs`  
4. **Hosted**: 배포 후 위 **수동 5건**만 실행  
