# 프로젝트 지시서 — North Star Fast-Track v1 (레포 정본)

**Authority role:** Product constitution

**Can define:**

- product truth
- non-negotiables
- executive UX principles
- anti-drift rules

**Cannot override:**

- none above it

**Use when:**

- deciding what product we are building
- resolving philosophical or product-shape disputes

---

**역할**: ChatGPT·사람·Cursor 공통 **프로젝트 디렉티브**를 레포에 고정한다.  
**관계**: 제품·패치 우선순위의 **최상위 정본**(헌법). 문서 권위 맵: **`00_Document_Authority_Read_Path.md`**. 실행 세부(파일 단위)는 `COS_FastTrack_v1_Surface_And_Routing.md`, `COS_NorthStar_Workflow_2026-03.md`, `COS_Inbound_Routing_Current_260323.md` 와 함께 본다.  
**주진척·M4 범위·패치 서사:** 본 문서 **§1c 부속**과 **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** 가 정본이다. 동일 주제의 장문·체크리스트 보존: **`COS_NorthStar_ReLock_Directive_2026-03.md`**(지원 문서; 권위 순위 없음).  
**워크스페이스 최종 형태·확장 논리 (레이어 중독 방지):** **`COS_Workspace_Vision_CompanyScale_2026-03.md`**  
**구현 순서·no-go·M2 복합 마일스톤**: **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** (영문 정본 + §19 비판적 검토).  
**Anthropic-style harness 번역·M2 필드 상세·M5a/b·M6·확장 no-go**: **`COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`** (동반 정본; 충돌 시 디렉티브·Alignment 우선).

---

## 1. 한 줄

**Turn COS into a true decision interface, not a command maze** — **GOAL-IN / DECISION-OUT**.  
Layer A(COS Core)는 유지하되, planner / work / approval / run / dispatch / GitHub / Cursor / storage 는 **내부 운영 API**로 두고, 대표 표면은 **최소·의사결정 중심**으로 둔다.

---

## 1b. 북극성 비전 — OpenClaw-class · COS 단일 창구 (사용자 정본, 2026-03)

아래는 **제품 주인이 서술한 목표**를 **본 디렉티브 본문에 고정**한 것이다. §1의 “decision interface / 명령 미로 방지”와 **동시에 성립**한다: 대표는 **COS와 자연어**로만 대화하는 층이고, **복잡한 분기·명령·툴 호출**은 **투명하게 감사 가능한 뒷단**이다.

1. **슬랙 기반 multi-agent 협업** — OpenClaw 류: 여러 AI 에이전트가 **커뮤니케이션 허브(슬랙)** 안에서 협업하고, **COS가 오케스트레이션**한다. 사용자는 **에이전트마다 일일이 스코프를 나누지 않는다** (사람이 AI 속도의 병목이 되지 않게).
2. **COS = 초지능 비서실장 · 단일 창구** — 사용자의 스타일·방향·프로젝트 깊이·**말로 다 안 꺼낸 취지**까지 장기 맥락을 붙든다. **의도가 충분히 확정됐다고 COS가 판단하면** 툴·에이전트를 써서 실행하고, **툴이 부족하면 사용자에게 말한다**.
3. **견제 구조** — COS **독단** 방지를 위해 **페르소나·R&R이 다른 에이전트**들 사이에 **의도된 긴장**을 둔다. 전제는 **상호 협력**; 문화적 원칙·페르소나는 Council/에이전트 레이어와 핸드오프(예: `G1_ART_Slack_COS_Handoff_v2` 멀티페르소나 절)에 녹아 있다.
4. **투명성** — 뒷단에서 COS·에이전트가 무엇을 했는지, 사용자가 원하면 **언제든·원하는 깊이로** 들여다볼 수 있어야 한다. 그래서 **복잡한 라우팅·내부 명령 계약**이 존재한다. 다만 **사용자 UX**에서 그 명령을 외우게 하는 것이 목표가 아니라, **COS에게 자연어로 “그 영역 보여줘”**에 가깝다.
5. **24/7 준자동 개발 루프** — 제품 정의가 사용자–COS 협의로 닫히면 **워크스페이스가 돌아가며** 구현·연동·검증; 결재 후 배포·이후 **피드백 → 개선** 루프. 범위는 코드뿐 아니라 **그랜트/IR/전략/운영** 등으로 확장 가능을 전제(단계적 구현).
6. **한 줄 UX 이미지** — 사용자 입장: **비서실장 COS 1명** + **같은 충성 전제의 에이전트 팀** + **와글와글 도는 커뮤니케이션 툴**.

**제품 주인 MVP 정의 (4항, 2026-03-27):** 전문 **`COS_MVP_Definition_Owner_2026-03-27.md`**. 위 1–6항과 방향을 공유하되, **아이디어 락인 → 승인 후 traceable 구현·연동 → 보고·승인·배포 → 피드백 처리 → 동일 툴의 다목적 활용**을 한 루프로 고정한다. **M1–M5 구현 순서·no-go는 여전히 `COS_NorthStar_Alignment_Memo_2026-03-24.md` 가 정본**이다.

**구현·로드맵 상세**: `COS_OpenClaw_Vision_Roadmap_2026-03.md` (코드 갭; 빌드 순서는 **Alignment Memo §11** 과 동기화).

---

## 1c. 문서 권위 순서 — 임의 해석 금지 (Alignment Memo 고정)

**읽기 순서 한 장:** `00_Document_Authority_Read_Path.md`

문서가 강조를 다르게 줄 때 **아래 순서만** 따른다. 하위가 상위와 충돌하면 **하위가 패배**한다.

1. `COS_Project_Directive_NorthStar_FastTrack_v1.md` — 제품 진리·비가역 원칙  
2. `COS_NorthStar_Alignment_Memo_2026-03-24.md` — **빌드 오더 잠금**·마일스톤·no-go  
3. `COS_Slack_Architecture_Reset_2026-03.md` — 제품 층·아키텍처 해석 (외부 초안명 `Slack_COS_Architecture_Reset_Handoff_2026-03-22` 와 동일 역할)  
4. `COS_Inbound_Routing_Current_260323.md` — **현재 런타임 분기 정본**  
5. `COS_NorthStar_Workflow_2026-03.md` — 운영 모델·북스타트 요약  
6. `COS_OpenClaw_Vision_Roadmap_2026-03.md` — 코드 갭·자산 맵  
7. `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` — 구현 대장(ledger); **제품 헌법 아님**

**§1c 부속 — 실행 서사 요약 (Alignment와 같은 뜻):** 주진척은 **M2a+M2b 합성**을 중심에 둔다. **M4**는 lineage·감사 **transport shell**로 두고 단독 북극성 스토리로 키우지 않는다. 슬래시·명령·인프라 확장을 **주 마일스톤**으로 삼지 않는다. 상세·영문 논증은 **Alignment Memo**. **`COS_NorthStar_ReLock_Directive_2026-03.md`** 는 동일 주제의 **지원·보존 문서**(역사·체크리스트); 디렉티브·Alignment·인바운드 정본과 **불일치하면 적용하지 않는다**.

**해석 규칙**: 하위 문서가 명령 확장·슬래시 우선·스케줄러 우선·호스티드 우선·페르소나 다듬기 우선으로 끌려가며 디렉티브와 맞지 않으면 **따르지 않는다**.

**동반 정본 (순서 잠금 동일·세부 보강)** — `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`: 하네스·아티팩트 규율, Anthropic→COS 번역 맵, M2a 필드 표, M2 성공 조건, M4를 “transport shell”로 정의, **M5를 M5a/M5b**로 쪼갬, **M6+ 도메인 모듈** 프레이밍. **본 디렉티브 §4 M2–M4와 모순되면 §4·Alignment가 이긴다.**

---

## 2. 비판적 현황 정합 (문서·코드 vs 지시서)

| 지시서 요구 | 레포 문서/코드 | 판정 |
|-------------|----------------|------|
| 대표 표면 5류만 | `executiveSurfaceHelp` + Fast-Track 문서 | **대체로 부합** |
| 내부 명령은 제거하지 않고 숨김 | 구조화·조회·플래너 유지, `운영도움말` | **부합** |
| Council 옵트인 | `isCouncilCommand` + 평문 → dialog | **부합** (장문 품질·톤은 별도 과제) |
| Decision packet = 1차 객체 | `decisionPackets`·짧은 회신·스레드 tail·워크 큐 연동 **얇은 슬라이스** | **부분 부합 — M2b 진행 중** |
| Approval matrix 명시 | **`evaluateApprovalPolicy` v1** — 환경(`dev/staging/prod`·프로필 risk)·선택지 `risk_level`/비용/되돌리기 → 티어; 워크큐 `pending_executive`·`approval_policy_tier` | **부분 부합 — M2b** (차원 전부·자동 게이트는 후속) |
| 턴 trace / lineage | `inbound-turn-trace.jsonl`·fixture·**M4 lineage transport** | **부분 부합 — M2a+M4**; 패킷·승인과 **경쟁 아님** |
| 완료 = proof | 원칙 문서화됨, `proof_refs` 연동은 로드맵 | **부분 부합** |
| Slash/버튼은 Phase 4 껍데기 | `/g1cos` 조회 MVP **이미 존재** | **시기상 선행 구현**. 지시서 의미: **“슬래시 확장을 북극성의 중심 마일스톤으로 삼지 말 것”** — 기능을 없애라는 뜻이 아니라 **의사결정·승인·트레이스 이후에 맞춰 확장**할 것 |
| 라우팅 순서 계약 | pre-AI: help → query → planner → structured → surface (**코드 일치**). AI 꼬리: 내비 → … → **Council → dialog** 등 | 문서 권위 목록은 **논리적 우선순위** 표현; 구현은 **모듈 분리**로 단계 번호가 1:1이 아님. **불일치 아님으로 단정하지 말고** `COS_Inbound_Routing_Current_*.md` 를 정본으로 유지 |
| Surface intent: `request_strategy_review` / `request_risk_review` | `surfaceIntentClassifier` + `tryExecutiveSurfaceResponse` **v0** (`전략 검토:`/`리스크 검토:` 등) | **부분 부합** — 다각·심층은 `협의모드:` |
| CEO 좌절 모델 A–E | 기존 North Star·User Guide에 **분산·약함** | **본 문서 §6으로 보강** |
| OpenClaw-class: COS 단일 창구·에이전트 오케스트·투명 drill-down | 라우팅·로그·PLN/WRK/run·어댑터·**턴 trace·결정 패킷·lineage transport** **있음**; job DAG·멀티 인스턴스 하드닝 등은 로드맵 | **부분 부합 — `COS_OpenClaw_Vision_Roadmap_2026-03.md`** |
| `/g1cos` vs 멘션/DM 맥락 일치 | `/g1cos` 는 **`recordSlashCommandExchange`** 로 버퍼 기록(DM= `im:` 동일 키); 채널은 `ch:…:slash:user`. 끄기: `CONVERSATION_BUFFER_RECORD_SLASH=0` | **부분 부합** — 채널 스레드 멘션과 버킷 **합류**는 후속(M5b UX) |

---

## 3. 절대 원칙 (Non-negotiable)

1. **대표 표면은 작다** — 핵심 5류: 프로젝트·툴 시작 / 상태 / **의사결정(패킷·짧은 답)** / 배포·준비 / 중단·보류. **전략·리스크**는 v0에서 **한 줄 인입**만(`전략 검토:`·`리스크 검토:`); 다각은 **Council 옵트인**. 그 외 표면 확장은 정당화 필요.
2. **내부 명령은 제품이 아니다** — `계획등록`, `계획상세`, `업무상세`, … 는 **운영·에이전트·디버그**; 대표 도움말에 노출하지 않는다.
3. **Council 은 옵트인** — 기본 폴백 금지. 전략·리스크 다각 검토가 **명시**되었거나 **결정 패킷 준비용 내부 필요**일 때만.
4. **Decision packet 이 대표 1차 인터페이스** — “2안으로”, “보류”, “staging 되면 준비” 등 **짧은 응답 ↔ 패킷 옵션 매핑**이 핵심.
5. **속도와 통제** — 안전하면 자동, 위험하면 명시 승인, 방해 최소, **감사 가능**.
6. **완료는 증거** — run_id, PR, 테스트, handoff 등 **proof 없이 “완료” 금지**.

---

## 4. 패치 순서 — Alignment Memo 와 동기 (M1·M2·M3·M4)

이 절은 **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** 와 **동일한 뼈대**를 쓴다. (구 “Phase 2=패킷 / Phase 3=trace” **이원화 표현은 폐기** — 둘은 **경쟁하지 않는다**.)

### M1 — 완료 (Phase 1 MVP)

표면 경계·intent·라우팅 계약·도움말 분리·Council 게이트·fixture 회귀 일부.

### M2 — **복합 마일스톤 (한 덩어리)**

- **M2a — Minimal trace spine**: `turn_id`, `thread_key`, append-only 기록, nullable `packet_id`/`plan_id`/…, 로컬 JSONL 우선. **범용 로깅 플랫폼 금지.**
- **M2b — Decision packet + approval matrix 기초**: 스키마·텍스트 렌더·짧은 답 파서·`evaluateApprovalPolicy` 스텁·**trace에 packet_id 기록**.

**실무**: 한 PR에 억지 병합하지 말고 **M2a 먼저** 가능 — 단, 스키마에 패킷 연결 필드를 **미리 열어** M2b가 즉시 얹히게 한다 (Memo §19.2).

### M3 — Agent work queue seed

M2a/M2b **이후**. 기존 work/run/어댑터 재사용; 거대 DAG 엔진 금지.

**로컬 운영 시드(2026-03):** `커서결과기록` → WRK/RUN 반영 후 **AWQ `proof_refs`** 에 `cursor_result:…` 남김(`linked_run_id` 일치 우선 · **WRK만 연결된 행 폴백**). 선언·체크: `WRK-260327_shortest_path_post_command_media.md`.

### M4 — Transport shell

`/g1cos` **확장**·패킷/승인/상태 **버튼** — 패킷·trace·정책 모델 **하위**에서만.

### M5 — 런타임·영속 하드닝 (Pathway: M5a / M5b)

- **M5a** — 멀티 인스턴스 dedup·공유 락·워커 안전·공유 런타임 스토리지  
- **M5b** — 패킷·trace 영속·쿼리 가능, 슬래시/멘션/DM 일관성, 재시작 연속성  

**툴 레지스트리 v2**: M2 이후 **얇게** 시작 가능(게이트 필요 시) — M2·M3 대체 금지.

### M6+ — 도메인 제품

Abstract·일정·그랜트·IR 등은 **기판(M2/M3) 위 모듈** — Pathway §16.

**`/g1cos`**: 제거하지 않음. **모델의 중심도 아님**. 확장은 **M4** — **패킷/trace/정책 위 얇은 운송층** (`Implementation Pathway` §14).

---

## 5. 1차 객체 스키마 (최소 필드 — 구현 전 계약)

### 5.1 Surface intent 레지스트리 (확장)

분류 목표(지시서):  
`start_project`, `ask_status`, `respond_decision`, `request_deploy_readiness`, `hold_pause`, `request_strategy_review`, `request_risk_review`  
+ 인바운드 상위 버킷: structured internal / surface / lightweight dialog / explicit council / query-only / planner-only / ambiguous.

**코드**: `surfaceIntentClassifier.js` — `start_project`, `ask_status`, `decision_compare`, `request_deploy_readiness`, `hold_pause`(해당 시), **`request_strategy_review`**, **`request_risk_review`** 등 v0; `respond_decision`은 **짧은 회신** 경로(`tryFinalizeDecisionShortReply`)로 별도 처리. `tryExecutiveSurfaceResponse` 의 `response_type` 은 위 이름과 맞추고, `runInboundCommandRouter` 가 **finalize `command_name`** 에도 동일 값을 써 JSONL **`surface_intent`** 가 식별 가능하게 한다(패킷만 `decision_packet`).

### 5.2 Decision packet (최소)

`packet_id`, `topic`, `context_summary`, `options[]` (option_id, title, short_description, tradeoffs, estimated_cost, estimated_time, reversibility, risk_level), `recommended_option_id`, `recommendation_reason`, `approval_required`, `consequence_of_delay`, `suggested_reply_examples`, `linked_plan_ids`, `linked_work_ids`, `linked_run_ids`, `generated_at`.

### 5.3 Status packet (최소)

`packet_id`, `project_key`, `current_phase`, `delta_since_last_update`, `active_work_summary`, `blockers`, `awaiting_executive_decision`, `next_automatic_actions`, `confidence_note`, `proof_refs`.

### 5.4 Approval matrix (차원)

action_type, environment, external_visibility, cost_band, data_sensitivity, reversibility, user_impact, brand_impact, infra_risk, secret/permission scope, default_policy, escalation_reason → 출력: `auto_allowed` | `cos_approval_only` | `executive_approval_required`.

### 5.5 Completion proof

proof_type, ref_id, description, timestamp, source, validation_status → 완료 응답에 `proof_refs` 로 부착.

---

## 6. CEO 좌절 모델 (설계 시 반대 검증)

- **A** — 여전히 문법을 외워야 하는가? → 표면·도움말·패킷으로 줄일 것.
- **B** — 실행 타이밍에 분석 장문이 끼는가? → Council·dialog 톤·게이트로 줄일 것.
- **C** — DB 덤프 같은 상태인가? → 상태 패킷 5블록 형태 고정.
- **D** — 사소한 일마다 PM처럼 승인인가? → 매트릭스로 **불필요 승인 감소**.
- **E** — 증거 없이 완료인가? → proof 강제.

**안티 목표**: 명령 남발, prefix 엣지케이스만 무한 패치, Council 폴백 확대, 내부 API를 일반 UX로 노출, 패킷·승인 전 슬래시 중심 확장, 증거 없는 완료.

---

## 7. 라우팅 계약 (지시서 권장 순서 — 논리)

1. help / 운영도움말  
2. query-only  
3. planner-only  
4. structured internal  
5. surface intent  
6. lightweight dialog  
7. explicit council only  
8. error / unsupported  

**구현 매핑**: pre-AI(`runInboundCommandRouter`) + AI(`runInboundAiRouter`)로 **나뉘어** 있음 — 상세 분기·로그는 인바운드 현행 문서가 정본.

---

## 8. 가벼운 dialog 정책 (지시서)

**허용**: 의도 보강, 방향 요약, 정렬 질문 1–3, 결정 패킷 준비, 대화를 다음 실행 단위로 접기.  
**금지**: 추상 과분석, 준-Council, 내부 기계 조작 유도.

---

## 9. 상태 렌더링 (기본 형태)

진행 변화 / 현재 막힘 / 대표 결정 필요 / COS 다음 자동 액션 / 근거·증거 — 장문 내부 덤프 기본 금지. (`statusPacketStub.js` 방향과 정렬.)

---

## 10. 패치 완료 보고 형식 (매 패치 끝)

**정본**: `COS_NorthStar_Alignment_Memo_2026-03-24.md` **§16** (영문 12항 + **M2a/M2b 표기**). 아래는 동일 뼈대 한글 요약.

1. 해결한 제품 문제  
2. 줄인 CEO 좌절 (A–E 중 무엇)  
3. 변경 파일  
4. 스키마·계약 변경  
5. 라우팅·정책 변경  
6. 의도적 비변경  
7. 실행한 테스트  
8. 수동 Slack 스모크  
9. 남은 리스크  
10. 다음 패치 (1차·2차)  
11. 복붙 명령 (SQL / npm / git)  
12. 핸드오프 요약  

추가: **이번 패치가 M2a / M2b / 둘 다인지** 명시. 둘 다면 trace와 packet을 **어떻게 연결**했는지 한 줄.

---

## 11. 관련 문서

- `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md` — **하네스 교훈·번역 맵·M2 필드·M2 성공 조건·M5a/b·M6·no-go 12항·보고 13항**  
- `COS_NorthStar_Alignment_Memo_2026-03-24.md` — **구현 순서 잠금·M2 복합·no-go·보고 형식·UX 계약** (영문 + §19 비판)  
- `COS_OpenClaw_Vision_Roadmap_2026-03.md` — 코드 갭·자산 맵 (빌드 순서는 Memo §11 우선)  
- `COS_NorthStar_Workflow_2026-03.md` — 북스타트·4단계·Slack UX 기둥  
- `COS_FastTrack_v1_Surface_And_Routing.md` — 표면·라우팅 실행 정본  
- `COS_Inbound_Routing_Current_260323.md` — 코드 분기 정본  
- `Regression_Harness_slack_fixtures.md` — 회귀  
- `COS_Operator_QA_Guide_And_Test_Matrix.md` — 운영·QA·수동 테스트 (제품 헌법 아님)  

---

**본 문서 갱신 시**: 상위 목표가 바뀌면 `COS_NorthStar_Workflow_2026-03.md` 한 줄 요약·다음 패치 목록과 **모순 없이** 맞출 것.
