# COS — 대표 레이어 vs 오케스트레이션 레이어 (맵 + 새는 지점)

**Authority role:** Runtime + product interpretation (코드 분기와 제품 의도를 같이 적음)

**Can define:**

- 한 턴이 “대표에게 말하는 COS”인지 “뒤에서 워커를 돌리는 COS”인지 읽는 틀
- 에스컬레이션 정책을 **느슨하게 시작해 점진적으로 조이는** 운영 원칙

**Cannot override:**

- `COS_Project_Directive_NorthStar_FastTrack_v1.md` 제품 헌법
- 구현 순서·Alignment 빌드 오더

**Use when:**

- “COS 한 명인데 왜 여기저기서 다른 목소리가 나오나?” 할 때
- 에스컬레이션·자율 결정 범위를 잡을 때

**정본 분기:** `COS_Inbound_Routing_Current_260323.md`  
**진입점:** `app.js` → `runInboundTurnTraceScope` 안에서 **`runInboundCommandRouter`** → 미스 시 **`runInboundAiRouter`**.

---

## 1. 두 레이어 정의

| 레이어 | 역할 | 대표에게 보여도 되는 것 |
|--------|------|-------------------------|
| **대표 레이어 (Executive)** | 합의, 짧은 상태, 실행 승인 요청, 에스컬레이션 **수신** | 한 화면에 “결정·승인·다음 한두 액션”만 남기기 |
| **오케스트레이션 레이어 (Orchestration)** | PLN/WRK·큐·브리지·다각 논의(Council)·내부 명령 실행 | 기본적으로 **로그·내부 UI·워커 채널**; 대표에게는 **요약·대기열 ID·막힌 이유**만 |

---

## 2. 코드 기준 맵 (한 장)

**처리 순서(요지):** `runInboundCommandRouter`가 고정 순서로 분기를 **시도**하고, 어느 것도 `done`이 아니면 `runInboundAiRouter`로 넘어간다. 상세 순서는 `COS_Inbound_Routing_Current_260323.md` **§0** 과 동일.

```mermaid
flowchart TB
  U[Slack 사용자 메시지]
  CR[runInboundCommandRouter\n우선순위 분기 시도]
  AI[runInboundAiRouter\n내비 → 플래너 방화벽 → Council | dialog]

  U --> CR
  CR -->|한 분기가 응답 확정| F[finalizeSlackResponse]
  CR -->|전부 미스| AI
  AI --> F

  subgraph ex["대표 레이어에 주로 맞추고 싶은 출력"]
    E1[executive_surface · help ·\n내비 인터랙션]
    E2[dialog 한 턴 요약·합의]
  end

  subgraph or["오케스트레이션에 가까운 출력"]
    O1[structured · planner]
    O2[council 페르소나 합성]
    O3[query lineage · 큐/AWQ 사실]
  end

  F -.-> E1
  F -.-> E2
  F -.-> O1
  F -.-> O2
  F -.-> O3
```

점선은 “`finalize` 이후 responder·텍스트에 따라 **어느 쪽 성격이 강한지**”를 가리킨다. **Council**과 **긴 구조화 결과**는 같은 스레드에 있어도 오케스트레이션 성격이 강하고, **대표 레이어 규칙과 충돌하기 쉬운 지점**이다.

---

## 3. 응답자(responder) / 파이프라인 → 레이어 배치

| 경로 (요약) | 주 레이어 | 비고 |
|-------------|-----------|------|
| `executive_surface` · `start_project` / `refine` / `confirmed` | 대표 | 실행 승인 전까지 APR·Council 유도 안 함 (현행 계약) |
| `executive_surface` · 결정비교·상태 롤업·보류·배포 준비 등 | 대표 | 내부 스토어를 읽어도 **Slack 문장은 얇게** |
| `help` | 대표 | |
| `query` · PLN/WRK/usage | 혼합 | **읽기 전용**이면 대표에게 OK; 본문이 지나치게 “페르소나” 스럽지 않게 finalize 규칙 유지 |
| `query` · `lineage_*` | 혼합 | 감사·큐 드릴다운은 **운영 사실**; 대표는 추적 ID 중심 |
| `planner` | 혼합 | 사용자에게는 **계약 문구**; 뒤에서는 PLN/WRK·승인 큐 |
| `structured` / 구조화 명령 | 오케스트레이션 | `워크큐*`·발행·승격 등 **내부 실행 어휘** |
| `council` | 오케스트레이션 (표면은 대표 스레드) | **새는 지점**: 페르소나·추천안 장문이 대표 레이어 규칙과 부딪힘 |
| `navigator` | 대표 | 단, LLM 본문 톤이 길어지면 “가이드”와 “내부 코칭” 경계 관리 |
| `dialog` | **가장 흔한 혼합** | 한 LLM이 합의·리서치·실행 제안을 한 버블에 섞을 수 있음 → **시스템 프롬프트·라우터**로 점진 정리 |

---

## 4. “새는” 지점 (지금 코드에서 특히 주의)

1. **`dialog`**: 대표와의 대화인 동시에 모델이 **내부 디스패치·역할 분배**를 말로 서술하면, 두 레이어가 한 메시지에 합쳐진다.  
2. **`council`**: 설계상 다중 관점 = 오케스트레이션에 가깝지만, 출력 채널은 **대표 스레드**다.  
3. **구조화 명령 성공 메시지**가 길어지면 대표가 “운영자 CLI”를 외우게 될 위험(이미 Fast-Track에서 억제 중인 긴장).  
4. **`start_project` 이후 뒤섞임**: 규칙 기반 정제/승인 턴 다음에 같은 스레드가 **dialog**로만 이어지면, “실행 승인 패킷” 서사와 **자연어** 서사가 동시에 존재할 수 있음.

---

## 5. 에스컬레이션 vs 자율 결정 (v0는 느슨하게)

의도: **COS가 스스로 결정할 것**과 **대표에게만 올릴 것**을 한 번에 완벽히 박지 않고, **운영하면서 조인다.**

**v0 (느슨, 현행 코드와 맞닿은 부분)**

- **구조화·티어**: `approvalMatrixStub` / `evaluateApprovalPolicy` — `pick`·`defer`·`pending_executive` 등으로 “올릴지 말지” 1차 분리.  
- **Council**: `deriveDecisionState` → `decisionNeeded` 일 때 `upsertApprovalRecord` (단, 킥오프·정제·lock 등은 억제 규칙 존재).  
- **대표 한 줄**: “막힌 이유 + 필요한 결정 한 가지”만 올리는 쪽을 장기 목표로 두고, 초기에는 APR·승인 큐 문구가 길어질 수 있음을 감수.

**점진 조이기 (다음 패치에서 다룰 수 있는 것)**

- 대표 레이어용 **에스컬레이션 템플릿** 1종(제목·옵션 2~3·기본값·마감) 고정.  
- `dialog` 시스템 지침: “실행·워커 배정은 내부 문단으로 쓰지 말고, 필요 시 구조화 결과만 요약”.  
- Orchestration 전용 **비공개 채널 또는 스레드**가 생기면 Council·긴 로그는 그쪽으로 빼는 선택지.

이 정책 표는 **코드 한 파일에 하드코딩하기보다**, `approvalMatrixStub`·Council 억제·surface 계약을 바꿀 때마다 이 문서 **§5 날짜·불릿**만 짧게 갱신하는 방식을 권장한다.

---

## 6. 관련 문서

- `COS_Inbound_Routing_Current_260323.md` — 실제 분기 순서·파일  
- `COS_FastTrack_v1_Surface_And_Routing.md` — 대표 표면 계약  
- `COS_Slack_Architecture_Reset_2026-03.md` — 왜 레이어가 섞이기 쉬운지 root cause  
- `G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` **§23.19** — 인바운드 모듈 개요

---

### Owner actions

```bash
cd /path/to/g1-cos-slack
npm test
```

배포 후: 대표 스레드에서 **킥오프 → 정제 → 승인** 한 번, **협의모드** 한 번을 나란히 보고 “한 메시지에 레이어가 몇 겹인지”만 체감해 보면 §4 튜닝 우선순위가 잡힌다.
