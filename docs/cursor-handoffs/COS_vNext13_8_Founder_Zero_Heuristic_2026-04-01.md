# Handoff: vNext.13.8 — Founder path zero-heuristic reset (2026-04-01)

작업지시서: `COS_vNext13_8_Founder_Path_Zero_Heuristic_Reset.md` (다운로드 원본과 동일 목표).

## 구현 요약

- **`src/founder/founderDirectKernel.js`**: 모델 전 `stripFounderStructuredCommandPrefixes` 제거. `buildFounderApprovalPacket` / `formatFullFounderProposalSurface` / governance 부록 제거. 대화 턴 **표면**은 항상 `partner_natural_surface`; `founder_hard_recover` → `SAFE_FALLBACK_TEXT`.
- **`src/features/founderSlackFileTurn.js`**: `buildFounderTurnTextAfterFileIngest` — 실패만 있어도 동일 커널 입력 문자열 생성. `buildFounderPlannerInputAfterFileIngest` 는 `skipPlanner: false` 래퍼로만 유지(호환).
- **`src/slack/registerHandlers.js`**: `skipPlanner` 조기 전송 제거; 실패 노트 **사후** 응답 덧붙임 제거.
- **`src/core/founderOutbound.js`**: 금지 마커 최소화(`[COS 제안 패킷]` 계열만).
- **`src/features/cosNaturalPartner.js`**: 지시문에서 노출형 “Council” 어휘 완화.

## 회귀

`scripts/test-vnext13-8-*.mjs` 여섯 + 갱신된 `test-vnext13-7-file-failure-*`, `test-vnext13-7-founder-surface-no-council-markers`, `test-vnext13-2-slack-e2e-dress-rehearsal`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

Git 동기화는 `docs/HANDOFF.md` / 패치 규칙 블록 따름.
