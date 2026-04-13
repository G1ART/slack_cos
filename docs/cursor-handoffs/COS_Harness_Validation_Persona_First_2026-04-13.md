# 하네스 검증 — 페르소나·지시 우선, 런타임은 기능만 (2026-04-13)

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
- `CONSTITUTION.md` v2.6: 위 원칙 명문화.
- `formatOpsSmokeFounderFacingLines`: 요약용으로 남아 있으나 **새로운 COS 대면 문구를 코드로 추가하지 않음** (필드는 `read_execution_context` 등으로 COS가 읽음).

## Owner actions

- `npm test`
- 하네스 시스템 프롬프트에 “패킷 봉투는 OpenAI 스키마를 채울 것·페르소나는 등록된 키만” 등 지시를 두면 COS·모델 층에서 완결된다.
