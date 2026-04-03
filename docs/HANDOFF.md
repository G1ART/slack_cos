# COS Slack — 운영 핸드오프 (요약)

**정본 읽기 순서**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`

## vNext.11 (2026-04) — Founder zero-command + capability orchestration

1. **창업자 표면**: DM/멘션 등 `founderRoute`에서는 `COS_FOUNDER_DIRECT_CHAT=1`일 때 launch gate, 결정론 유틸(`src/founder/founderDeterministicUtilityResolver.js`), 자연어 파트너 순으로만 처리. structured command 라우터로 폴백하지 않음 (`app.js`에서 `shouldRunCommandRouter = !founderRoute`).
2. **오퍼레이터/관리자**: 채널 커맨드·구조화 접두는 비창업자 경로에서 기존 라우터·헌법 파이프라인.
3. **오케스트레이션**: `dispatchOutboundActionsForRun`이 `planExecutionRoutesForRun`과 `extractRunCapabilities`로 research/uiux/qa/github/cursor/supabase를 조건부 실행하고 `execution_run.orchestration_plan`에 `route_decisions` 저장.
4. **Provider truth**: `buildProviderTruthSnapshot`을 `planExecutionRoutes.js` 라우트 적격성 입력으로 사용.

상세: `docs/founder-surface-contract.md`, `docs/orchestration-route-policy.md`, `docs/runtime-routing.md`.

## 남은 리스크

- `deploy_preview` capability는 trace에만 반영되고 Railway/Vercel 실행 디스패치는 미연결일 수 있음.
- `founderRequestPipeline` 비직접채팅 경로에 work object / gold contract 분기 잔존.

## 테스트

`npm test`에 `scripts/test-vnext11-founder-and-planner.mjs` 포함.
