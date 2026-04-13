# 하네스 검증 — 페르소나·지시 우선, 런타임은 기능만 (2026-04-13)

정본 보강: `CONSTITUTION.md` v2.7 — founder 신뢰·최소 코드 강제, COS vs 하네스 팀 R&R.

## 의도

- **COS**는 창업자와만 자연어로 말하고, 콜백·ledger·하네스 보고를 스스로 해석한다.
- **앱**은 슬랙 문구를 조합·강화하지 않으며, 스모크 요약도 **필드·집계** 위주로 두고 서술은 COS에게 맡긴다.
- **하네스 에이전트**는 `harnessBridge.js`의 `PERSONA_REGISTRY`와 시스템 지시로 인격·스코프·R&R이 묶인다.

## 툴 연결 (delegate_harness_team)

```text
OpenAI Responses tool schema (strict)
  src/founder/runFounderDirectConversation.js — COS_TOOLS, DELEGATE_PACKET_ITEM_SCHEMA
        ↓ tool output JSON
런타임 기능 검증
  validateToolCallArgs → validateDelegateHarnessTeamToolArgs
  src/founder/delegateHarnessPacketValidate.js
        · objective 비어 있음 → 차단
        · packets 가 배열이 아님 → 차단
        · packets[i] 가 객체가 아님 → 차단 (delegate_schema_invalid_packets_transport)
        · live_patch ≠ null 이면 path/operation/content/live_only/no_fallback 만 검증
        ↓ 통과 시
harnessBridge.runHarnessOrchestration / normalizeCosPackets
        · 알 수 없는 페르소나 패킷은 조용히 스킵 (코드가 판단하지 않음)
toolsBridge.invokeExternal_tool (필요 시)
executionLedger (가시성)
```

## 코드 변경 요약

- `delegateHarnessPacketValidate.js`: 봉투 전체·enum 재검증 제거; `live_patch`·슬롯 형만 유지.
- `CONSTITUTION.md` v2.7: 위 원칙 명문화.
- `formatOpsSmokeFounderFacingLines`: 요약용으로 남아 있으나 **새로운 COS 대면 문구를 코드로 추가하지 않음** (필드는 `read_execution_context` 등으로 COS가 읽음).

## Founder 결정 (2026-04 보강)

### 1) 멀티 Slack 앱(B) vs 단일 창구·패킷 페르소나(A)

- **창구를 COS만으로 좁힌다고 해서 B가 자동으로 불필요해지지는 않는다.** B는 “founder가 여러 봇과 수다”가 아니라, **내부 워크스페이스·비공개 채널**에서 페르소나별 앱/토큰으로 일하게 두고 **COS만 founder와 말하는** 구성도 가능하다.
- **추천(단계적):**
  - **1단계 — A+프로세스:** 지금 스택으로 COS가 **연속 턴·다중 패킷**(engineering 산출 → qa/qc 리뷰 패킷 → design 관점 패킷 → 비용·스코프는 COS가 ledger와 함께 조율)을 **같은 Slack 앱·같은 모델 루프** 안에서 돌리도록 시스템 지시·운영 규약을 굳힌다. 비용·복잡도가 낮고, “self-patting 방지”는 **역할 분리된 리뷰 페이즈**로 먼저 검증한다.
  - **2단계 — B:** 감사 단위 분리, 페르소나별 **다른 모델/다른 rate limit**, 또는 **컨텍스트·비밀 완전 분리**가 필요해지면 Slack 앱을 늘려 **백그라운드/내부 채널 전용 봇**으로 확장한다. founder 창구는 여전히 COS 단일.
- **한 줄:** 지향은 **B**로 두되, **먼저 A+로 R&R·견제가 실제로 도는지** 확인한 뒤 B에 투자하는 편이 리스크 대비 효율이 좋다.

### 2) 견제의 성격

- **프로세스·R&R 견제**면 충분 (별도 “항상 둘째 모델 대결” 불필요).
- 엔지니어링 산출과 **QC/딥리뷰**, **UI/UX 푸시**, **cost effectiveness**는 **서로 다른 페르소나·패킷·리뷰 게이트**로 두고 COS가 조율하는 그림이 목표. 단일 에이전트에 전부 맡기지 않는다는 전제와 정합.

## Owner actions

- `npm test`
- 하네스 시스템 프롬프트에 “패킷 봉투는 OpenAI 스키마를 채울 것·페르소나는 등록된 키만” 등 지시를 두면 COS·모델 층에서 완결된다.
