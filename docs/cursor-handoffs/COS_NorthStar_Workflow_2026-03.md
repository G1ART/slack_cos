# COS North Star — 작업 흐름·구조 (2026-03) · **Fast-Track v1 정렬**

**Authority role:** Concise operating model explainer

**Can define:**

- short summary of intended workflow

**Cannot override:**

- Directive
- Alignment
- Runtime truth

**Use when:**

- quick orientation
- onboarding summary

---

## 한 줄 (갱신)

**GOAL-IN / DECISION-OUT** — 대표는 **목표·결정**으로 말하고, COS는 **정렬·패킷·실행·증거**로 옮긴다. **고지능·고감성·균형 잡힌 비서실장**과 자연어로 일하되, **엔진 문법을 외우게 하지 않는다**. 평문은 기본 **`dialog`**; **Council·장문 다각 논의는 옵트인** (`협의모드:` 등).

**OpenClaw-class 비전** — 디렉티브 **§1b** · 갭·자산 맵 **`COS_OpenClaw_Vision_Roadmap_2026-03.md`**.

**구현 순서 잠금 (M2a+M2b 복합)** — **`COS_NorthStar_Alignment_Memo_2026-03-24.md`**. **하네스·번역·M5a/b·M6** — **`COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`**.

**프로젝트 디렉티브 (제품 헌법)**: **`COS_Project_Directive_NorthStar_FastTrack_v1.md`** — §1c 문서 권위 순서·§4 M1–M5·CEO 좌절·스키마 최소.

## Fast-Track 정본

상세 계약·라우팅 순서·대표 5류 vs 내부 API: **`COS_FastTrack_v1_Surface_And_Routing.md`** (필독).

## 제품 원칙 (북스타트 — 구현·패치의 상위 기준)

1. **지휘자(대표)** — 의지·우선순위·범위·**게이트(승인)**. 코드/디테일의 주 타자가 아니라 **오케스트레이션 중심**.

2. **COS = 실현의 중심 주체** — Slack 단일 진입에서 **설계 조정 + 실행 허브**. **대표 표면**은 작게, **내부 실행**은 planner/work/run/GitHub/Cursor 등 **API로 유지** (버리지 않음, **표면에서 숨김**).

3. **병목 최소화 + 승인·감사** — 안전한 곳은 자동, 위험한 곳은 **명시 승인**. **완료 주장은 증거(proof) 필수** — 말로만 “됐다” 금지.

4. **의도 정확도 (재정의)**  
   - **대표 측**: 자연어, 내비(`COS`/`비서`), **5류 표면**, (향후) **Decision packet** 응답.  
   - **시스템 측**: 조회 계약, 플래너 계약, **내부 실행 어휘**, 툴 레지스트리 — **대표 도움말에 나열하지 않음** (`운영도움말`).

5. **개선 루프** — 피드백·신호를 구조화해 계획·업무로 흡수 (큐·패킷·스키마와 연동).

**한 문장 요약:** 대표는 **결정**을 내고, COS는 **패킷·정책·실행**으로 옮기며, **증거**로 신뢰를 만든다.

## 업계 논의와의 정렬 (참고 — 문서 권위 아님)

(기존과 동일) 외부 트렌드는 “의도 → 에이전트 실행 → 피드백”과 방향 같음. **제품 정본은 본 문서 + Fast-Track + G1 상위 헌장**.

## Slack UX 기둥 (제품·기술 정렬)

- **대표 도움말** `도움말` — **5류 표면만** (`executiveSurfaceHelp.js`).
- **운영 도움말** `운영도움말` — 기존 실행 어휘 전체 (`operatorHelpText` in `app.js`).
- **자연어·내비·협의(옵트인)** — 기존과 동일. Council은 **기본 폴백 아님**.
- **`/g1cos`** — 조회 운반용 **M4 transport** 전 단계 MVP; **확장은 M2·초기 M3 이후** (`Alignment Memo` §7.1).
- Block Kit·조회 네비·버퍼·큐 브리지 — 유지; 장기적으로 **패킷·승인 UI**로 흡수.

## 4단계 (`cosWorkflowPhases.js`)

| 단계 | id | 대표 | COS |
|------|-----|------|-----|
| 정렬 | `align` | 목표·과제 | 내비·dialog·`프로젝트시작:` 류 **표면** |
| 합의 | `agree` | 범위·리스크 | 막힌 결정·(내부) `결정기록` |
| 계획 | `plan` | 승인 | **내부** `계획등록`·조회 QC |
| 이행 | `execute` | 게이트 | run·GitHub·Cursor·툴 (내부 API) |

## 구현 매핑 (현재)

- **라우팅**: `runInboundCommandRouter` — 도움말(대표/운영) → 조회 → 플래너 락 → 구조화 → **surface intent** → AI. `COS_Inbound_Routing_Current_260323.md`.
- **내부 자산**: planner/work/approval/run/registry — **유지·감춤**.
- **툴 레지스트리 v1** — v2에서 게이트·function calling.

## 다음 패치 (**Alignment Memo** — M2 복합, 슬래시·호스티드 우선 금지)

1. **M2a** — Minimal **trace spine** (JSONL, `turn_id`, `thread_key`, nullable packet/plan/work/run/approval, 소요시간·에러). 콘솔만으로는 부족(Memo §4 layer 1).  
2. **M2b** — **Decision packet** 스키마·Slack 텍스트 렌더·짧은 답 파서·**approval matrix** typedef + `evaluateApprovalPolicy` 스텁; **trace에 `packet_id`**.  
3. **M3** — Agent **work queue seed** (승인 단위 enqueue·lifecycle·어댑터 재사용).  
4. **M4** — **Transport shell**: `/g1cos` 확장·패킷/승인/상태 버튼(모델 하위).  
5. **M5** — 멀티 인스턴스·영속·툴 레지스트리 v2 등 하드닝.

_패치 보고 형식: `COS_NorthStar_Alignment_Memo_2026-03-24.md` §16._

_완료·트래킹: Fast-Track **Phase 1** — `도움말`/`운영도움말` 분리, `surfaceIntentClassifier`·`tryExecutiveSurfaceResponse`, 라우팅 계약 문서, surface **replay fixture** (`19_surface_ask_status`)._

## CEO 좌절 모델 (한 줄씩)

문법 강요(A) · 분석으로 멈춤(B) · 내부 덤프(C) · 과잉 승인(D) · 증거 없는 완료(E) — 패치마다 하나 이상을 **의도적으로** 줄이는지 검토. 상세: **`COS_Project_Directive_NorthStar_FastTrack_v1.md` §6**.

## 관련 문서

- `COS_NorthStar_Implementation_Pathway_Harness_2026-03.md`
- `COS_NorthStar_Alignment_Memo_2026-03-24.md`
- `COS_OpenClaw_Vision_Roadmap_2026-03.md`
- `COS_Project_Directive_NorthStar_FastTrack_v1.md`
- `COS_FastTrack_v1_Surface_And_Routing.md`
- `COS_Inbound_Routing_Current_260323.md`
- `COS_Operator_QA_Guide_And_Test_Matrix.md` (운영·QA; 제품 정본 아님)
- `COS_Slack_Architecture_Reset_2026-03.md`
- `COS_Navigator_260323.md`
- `Regression_Harness_slack_fixtures.md`
- `WRK-260327_fast_track_phase1.md`
