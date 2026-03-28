# COS North Star Fast-Track v1 — 표면·라우팅 정본

**소스**: 대표·ChatGPT 합의 프로젝트 지시서 (2026) 녹여 씀.  
**권위 맵 (필독):** **`00_Document_Authority_Read_Path.md`**.  
**상위 정본(제품):** **`COS_Project_Directive_NorthStar_FastTrack_v1.md`**.  
**구현 순서·no-go**: **`COS_NorthStar_Alignment_Memo_2026-03-24.md`** (M2a trace + M2b packet 동시 목표, 슬래시 확장은 M4).  
**목표**: 대표 인터페이스 = **의사결정·목표** 중심. 문자열 명령 미로는 **운영/에이전트 층**으로 강등.

## 한 줄

**역할** — 사용자는 **대표**, Slack COS는 **비서실장(단일 창구)**; 다각·실행은 R&R이 나뉜 **다른 에이전트/어댑터** 경로로 넘길 수 있다.

**GOAL-IN / DECISION-OUT** — 대표는 문법이 아니라 **결정**으로 시스템을 움직인다.

## 대표 표면 (Executive) — 최대 5류

1. **프로젝트시작 / 툴시작** — `프로젝트시작: …` · `툴시작: …`
2. **상태** — `지금 상태 보여줘` 등 → Status 패킷 골격 (`statusPacketStub.js` 연동 전 스텁)
3. **의사결정 응답** — (Phase 2) Decision packet에 `2안으로` 등 매핑
4. **배포 승인·준비** — `배포 준비`, `staging …` 등 → 승인 매트릭스 (Phase 2)
5. **중단·보류** — `이건 보류` 등

**도움말**: `formatExecutiveHelpText()` — 위만 노출.  
**운영도움말**: `operatorHelpText()` — 기존 전체 실행 어휘.

## 내부 API (Internal)

`계획등록`, `계획상세`, `업무발행`, `커서발행`, `실행상세`, … — **제거하지 않음**. 대표 도움말·기본 UX에서 **숨김**. Cursor/에이전트/운영자가 사용.

워크스페이스 큐(`실행큐:` 등)는 **브리지** — 최종형은 패킷·버튼·승인 흐름으로 흡수.

## 라우팅 순서 (계약 — 테스트로 고정 예정)

**지시서 권장(논리 순서)**: help → query-only → planner-only → structured internal → surface → lightweight dialog → explicit council → error.

**코드 구현**: **pre-AI** `runInboundCommandRouter` 에서 1–5(도움말·조회·플래너 락·구조화·surface) 처리 후 미스 시 **AI 꼬리** `runInboundAiRouter` 로 진입 — 내비·추가 조회/플래너 처리·Council·dialog 등. **단계 번호 1:1 대응은 아님**; 실제 분기·파일 목록은 **`COS_Inbound_Routing_Current_260323.md`** 가 정본.

1. `도움말` / `운영도움말`
2. 조회 전용 계약 (`tryFinalizeSlackQueryRoute`)
3. 플래너 전용 계약 (hard lock)
4. 구조화 내부 명령 (`runInboundStructuredCommands`)
5. **Surface intent** (`tryExecutiveSurfaceResponse` — 규칙 우선)
6. Lightweight dialog (`runCosNaturalPartner`)
7. **명시 Council만** (`isCouncilCommand`)
8. 오류 / 미지원

**금지**: surface가 조회·플래너·구조화 결정 경로를 가로챔. dialog/Council이 조회·플래너 계약을 삼킴. 기본 도움말에 내부 어휘 전체 노출.

## Council

**옵트인**. 기본 폴백 아님. `협의모드:` 등 명시 또는 COS 내부 다각 검토 필요 시만.

## Surface intent 레지스트리 (확장 목표)

지시서 최소 타입: `start_project`, `ask_status`, `respond_decision`, `request_deploy_readiness`, `hold_pause`, `request_strategy_review`, `request_risk_review`.  
**현재 코드**(`surfaceIntentClassifier.js`): 위에 더해 **`product_feedback`** (`피드백:`/`제품 피드백:`/`feedback:`) → 워크스페이스 큐 `customer_feedback`; `respond_decision` 명칭은 코드상 `decision_compare` 등과 대응 — 전략/리스크·패킷 게이트 심화는 Phase 2+.

## 가벼운 dialog 정책 (지시서)

**해야 할 일**: 의도 보강, 짧은 요약, 정렬 질문 1–3, 결정 패킷 준비, 다음 실행 단위로 접기.  
**하지 말 것**: 장편 추상 분석, 준-Council, 내부 명령 조작을 대표에게 떠넘기기.

## 상태 렌더링 (대표 기본 형태)

`진행 변화` / `현재 막힘` / `대표 결정 필요` / `COS 다음 자동 액션` / `근거·증거` — DB 덤프형 장문을 기본값으로 하지 않음 (`statusPacketStub.js` 방향).

## 완료·신뢰

**증거 없는 “완료” 금지** — `proof_refs`(PR, run_id, 테스트, handoff 등) Phase 2+ 스키마.

## 안티 목표 (지시서)

명령 남발, prefix 엣지만 무한 패치, Council 폴백 확대, 내부 API를 일반 UX로 노출, **패킷·승인·회귀 없이 슬래시 확장을 북극성으로 삼기**, 증거 없는 완료, 미세 관리 유발 인터페이스.

## 패치 페이즈 (디렉티브 §4 · Alignment Memo §11 과 동기)

1. **M1** — 표면·intent·라우팅 ← **MVP 완료**
2. **M2a** — minimal trace spine (JSONL 등)
3. **M2b** — decision packet + approval matrix 기초 (trace에 `packet_id`)
4. **M3** — agent work queue seed
5. **M4** — slash/button transport (`/g1cos` 확장은 여기)
6. **M5** — 런타임·영속 하드닝

## 코드 링크

| 모듈 | 역할 |
|------|------|
| `executiveSurfaceHelp.js` | 대표 `도움말` |
| `surfaceIntentClassifier.js` | 규칙 기반 surface 분류 |
| `tryExecutiveSurfaceResponse.js` | 즉시 응답 |
| `statusPacketStub.js` | 상태 패킷 v0 골격 |
| `runInboundCommandRouter.js` | 순서 구현 |

## 핸드오프 갱신 (패치 후 필수)

- executive vs internal 정의
- 위 라우팅 순서(및 인바운드 현행 문서와의 관계)
- Council = 옵트인
- 승인 매트릭스: **미구현 (Phase 2)**
- trace: fixture·Council 누수·surface 회귀 가동 중; final responder trace 등 확장 예정
- 패치 보고 12항목 형식: **`COS_Project_Directive_NorthStar_FastTrack_v1.md` §10**
