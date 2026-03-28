# OpenClaw-class 비전 vs 현재 코드 — 갭 분석 · 코드 건강

**Authority role:** Gap map / build guidance

**Can define:**

- where code/assets/gaps exist

**Cannot override:**

- Directive
- Alignment
- Runtime truth

**Use when:**

- mapping current assets to future shape

---

**상위 정본(디렉티브):** `COS_Project_Directive_NorthStar_FastTrack_v1.md` (§1b 비전, §1c 권위 순서, §4 M1–M5).  
**읽기 순서 한 장:** `00_Document_Authority_Read_Path.md`.  
**주진척·M4 범위:** 디렉티브 **§1c 부속** · **`COS_NorthStar_Alignment_Memo_2026-03-24.md`**. (지원) **`COS_NorthStar_ReLock_Directive_2026-03.md`**.  
**워크스페이스 최종 형태·투자/확장 논리 (레이어 중독 방지)**: **`COS_Workspace_Vision_CompanyScale_2026-03.md`**.  
**구현 순서 잠금**: **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** · **하네스·M2 필드·M5a/b·M6**: **`COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`**.  
**인바운드 정본**: `COS_Inbound_Routing_Current_260323.md`.  
**제품 주인 MVP (4항, 목표 루프 전문):** `COS_MVP_Definition_Owner_2026-03-27.md` — 코드 갭을 재는 **목표 상태**; 구현 순서는 Alignment·디렉티브 §1c 정본.

> 본 문서의 **“Phase A–F”** 권장 순서는 **Alignment Memo §11 (M2a/M2b/M3/M4)** 로 대체되었다. 갭 표·코드 맵은 아래 유지.

---

## 1. 제품 목표 (요약)

- **목표 루프(제품 주인 정본 4항):** `COS_MVP_Definition_Owner_2026-03-27.md`.
- 슬랙 허브에서 **COS 단일 창구** + **멀티 에이전트** + **투명한 뒷단**(언제든 깊이 있게 열람).
- 사용자는 **자연어 → COS**; 내부 명령·분기는 **감사·라우팅·에이전트**용.
- **24/7 준자동** 개발·배포·피드백 루프; 장기적으로 그랜트/IR/전략 등 확장.

---

## 2. 코드베이스 맵 (주요 축)

| 영역 | 경로 | 역할 |
|------|------|------|
| 진입 | `app.js` | Bolt 앱, `handleUserText` → `runInboundCommandRouter` → `runInboundAiRouter` |
| Pre-AI 라우터 | `src/features/runInboundCommandRouter.js` | 도움말·결정 짧은 회신·M4 lineage·조회·플래너·구조화·surface |
| 구조화 대량 분기 | `src/features/runInboundStructuredCommands.js` | 환경·플랜·업무·GitHub·Cursor·승인 등 |
| AI 꼬리 | `src/features/runInboundAiRouter.js` | 내비·Council·dialog, `classifyInboundResponderPreview` |
| Council·페르소나 | `src/agents/council.js`, `personas.js`, `router.js` | 다각 합성·라우팅 JSON |
| 자연어 COS | `src/features/cosNaturalPartner.js` | dialog LLM |
| 승인 | `src/features/approvals.js` | 큐·버튼·파싱 |
| 플래너 락 | `src/features/plannerRoute.js`, `runPlannerHardLockedBranch.js` | hit/miss 계약 |
| 조회 | `src/features/queryOnlyRoute.js`, `queryResponseBlocks.js`, `queryNavButtons.js` | 조회 전용 |
| Surface · 결정 패킷 | `surfaceIntentClassifier.js`, `tryExecutiveSurfaceResponse.js`, `decisionPackets.js`, `statusPackets.js`, `executiveSurfaceHelp.js` | 대표 표면·`결정비교:`·**상태 패킷 STP-**·tail·짧은 회신 |
| 버퍼 | `src/features/slackConversationBuffer.js` | 스레드/DM 맥락·옵트인 JSON 영속 |
| 워크스페이스 큐 | `src/features/cosWorkspaceQueue.js` | 실행큐·피드백 인테이크 |
| 슬래시 | `src/slack/registerSlashCommands.js` | `/g1cos` 조회 MVP |
| Slack UX | `src/slack/registerHandlers.js` | 멘션·DM·승인·네비·dialog 큐 버튼 |
| 스토리지 | `src/storage/*` | JSON / Supabase 어댑터 |
| 어댑터 | `src/adapters/*` | GitHub·Cursor·Supabase·manual |
| 회귀 | `scripts/replay-slack-fixtures.mjs`, `src/testing/*` | fixture·누수 규칙 |

---

## 3. 코드 건강 검토 (요약)

### 3.1 치명 버그·충돌 후보

- **`parseApprovalAction`**: 단일 모듈 export — 중복 선언 이슈 없음.
- **응답 형식** `{ text, blocks }`: 핸들러·`replyInThread` 정합.
- **`eventDedup`**: 기본 프로세스 메모리·10분 TTL. **멀티 프로세스**는 `SLACK_EVENT_DEDUP_FILE`(공유 JSON, tmp+rename 쓰기·레이스 허용) 옵트인; `SLACK_EVENT_DEDUP_DISABLE` 로 끄기. 부팅 **환경점검**에 `slack_event_dedup` 요약. (`npm test`: `test-event-dedup.mjs`.)

### 3.2 투명성 갭

- **`/g1cos`**: ~~대화 버퍼 미기록~~ → **`registerSlashCommands.js`** 가 응답 문자열을 **`recordSlashCommandExchange`** 로 남김(DM은 일반 DM과 `im:` 동일). 채널 멘션 스레드와의 **키 합치**는 여전히 별도 과제.
- **Fixture preview**: 구조화 명령 미시뮬 — `Regression_Harness` §5.
- **턴 lineage 스토어**: **M2a** — `data/inbound-turn-trace.jsonl` (`inboundTurnTrace.js`), 행 **`response_type`** = `finalizeSlackResponse` 계약값.

### 3.3 OpenClaw-class 기능 갭

| 능력 | 현재 |
|------|------|
| 쿼리 가능한 **trace spine** | **M2a** 구현 — JSONL (`test-inbound-turn-trace.mjs`) |
| **Decision packet** + 짧은 답 매핑 | **M2b 얇은 슬라이스** — `decisionPackets.js`·`20_decision_compare_surface`·`test-decision-packet.mjs` (풀 큐·PLN 연동은 M3+) |
| **Approval matrix** 형식화 | **v1** — `approvalMatrixStub.js` 의 `evaluateApprovalPolicy`(환경·옵션 신호→티어); 큐 `pending_executive` / 전 차원·실행 차단은 후속 |
| **Agent work queue** (시드) | **M3** — `AWQ-*`·**`워크큐*`**·`워크큐증거`/`러너증거`·`proof_refs`·선택 **HTTP CI 훅**(`COS_CI_HOOK_*`/`ciWebhookServer.js`)·**발행 성공 시 `linkAgentWorkQueueRunForWork`**(커서·GitHub 이슈·Supabase) |
| 슬래시/버튼 **운송층** | **M4 시드:** `/g1cos`(·멘션) — 조회 + **`패킷`/`상태 STP-…`/`워크큐` lineage**·턴 trace·**`워크큐 목록`/`대기`** (`g1cosLineageTransport.js`); 버튼·승인 액션은 후속 |

---

## 4. 다음 구현 (Memo §11 과 동일 — **현재 위치**)

1. **M2a** — minimal trace spine (**구현됨**).  
2. **M2b** — packet + approval policy stub + trace `packet_id` (**코드 반영됨**; 심화는 M3/M4).  
3. **M3** — work queue seed (**시드 반영**); **폐루프 보강**: `커서결과기록`·발행·AWQ `proof_refs`·WRK 상태를 같은 **run_id** 로 엮기 (진행 중).  
4. **M4** — transport shell (읽기 lineage 시드 존재; 버튼/승인 UI는 패킷·정책 하위).

**No-go**: Memo §13 · Pathway §17 (확장 12항).

**최단거리 실행 순서(패치 브리프):** `WRK-260327_shortest_path_post_command_media.md`

**로컬 Executive MVP (시드):** M1–M3 얇은 슬라이스는 **닫힘** — 상세 체크·폐루프 증거는 위 WRK. M4 UI 확장·M5 hosted는 **다음 레일**.

---

## 5. 관련 문서

- `00_Document_Authority_Read_Path.md`  
- `WRK-260327_shortest_path_post_command_media.md`  
- `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`  
- `COS_NorthStar_Alignment_Memo_2026-03-24.md`  
- `COS_Project_Directive_NorthStar_FastTrack_v1.md`  
- `COS_NorthStar_Workflow_2026-03.md`  
- `COS_FastTrack_v1_Surface_And_Routing.md`  
- `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md`

### Owner actions

```bash
cd /path/to/g1-cos-slack && npm test
```

**다음 구현 초점:** M3 폐루프(증거·AWQ·RUN 정합) → M4 얇은 확장. M2a 단독 스토리는 **닫힘**.
