# vNext.11 — Founder zero-command surface + capability-routed orchestration

**날짜**: 2026-04-01  
**브랜치(의도)**: `patch/founder-surface-lock-v2-orchestration-brain`

## 요약

1. **창업자 표면**: DM/멘션에서 structured command 라우터로 폴백하지 않음. 결정론 유틸(`src/founder/founderDeterministicUtilityResolver.js`) + launch gate + 자연어 파트너.
2. **오케스트레이션**: `extractRunCapabilities` + `planExecutionRoutesForRun` 결과로 outbound 레인 조건부 실행; `orchestration_plan.route_decisions` 저장.
3. **Provider truth**: 라우트 적격성 입력으로 `planExecutionRoutes.js`에서 사용.

## 테스트

- `npm test` 체인에 `scripts/test-vnext11-founder-and-planner.mjs`
- `scripts/test-founder-operational-probe.mjs` — 새 COS 음성 문구에 맞춤

## 문서

- `docs/HANDOFF.md`, `docs/founder-surface-contract.md`, `docs/orchestration-route-policy.md`, `docs/runtime-routing.md`

## 남은 일

- deploy_preview → Railway/Vercel 실제 디스패치와 executor 정렬
- `founderRequestPipeline` 레거시 분기(비직접채팅) 추가 단순화 여지
