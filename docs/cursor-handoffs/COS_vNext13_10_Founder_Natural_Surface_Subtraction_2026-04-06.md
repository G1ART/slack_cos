# Handoff: vNext.13.10 — Founder natural surface subtraction (2026-04-06)

작업지시서: `COS_vNext13_10_Founder_Natural_Surface_Subtraction.md`.

## 삭제·축소한 레이어

- **Slack 본문 조립**: `sidecar.natural_language_reply`(structured_llm / mock) → **사용 안 함**.
- **표면 단일 경로**: `resolveFounderSlackSurfaceText` → `runCosNaturalPartner` + `sanitizePartnerNaturalLlmOutput`. `partner_fallback_no_sidecar` 는 기존처럼 플래너 내 파트너 1회만(이중 호출 없음).
- **플래너**: `sanitizeStructuredPlannerSidecar` 제거 — NL 필드는 내부 기록용으로만 유지.
- **보조**: `{"detail":...}` 를 `sanitizePartnerNaturalLlmOutput` 입구에서 제거; `cosNaturalPartner` 지시에 JSON 인용 금지 추가.

## import / 책임 (요약)

- `founderDirectKernel.js`: `runCosNaturalPartner`, `resolveFounderSlackSurfaceText`.
- `founderConversationPlanner.js`: 스키마 문구만 “NL은 슬랙 미사용”으로 정리.

## 잔여 리스크

- 턴당 **callJSON + callText** 이중 호출(프로덕션 비용). 이후 sidecar-only 경량 스키마는 별 논의.
- `resolveFounderSlackSurfaceText` 가 첨부 요약·실패 힌트를 user 입력에 덧붙임 — 섹션형 UI는 금지, 평문 맥락만.

## 회귀

- `npm test` + `scripts/test-vnext13-10-founder-natural-surface-harness.mjs`
- `test-vnext13-5-founder-meta-short-circuit-narrow` — callText 1회 기대로 갱신

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

Git 동기화는 패치 규칙 블록 따름.
