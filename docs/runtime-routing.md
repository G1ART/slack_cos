# Runtime routing (Slack COS)

## 인바운드

- **창업자 (`founderRoute`)**: `app.js` 첫 블록에서 `founderRequestPipeline`만 — **command/AI router 미진입** (회귀: `scripts/test-vnext12-1-founder-no-command-router.mjs`). 이후 헌법·레거시 분기는 `founderRoute === false` 일 때만 실행.
- **채널/오퍼레이터**: `founderRequestPipeline` 헌법 경로 또는 `runInboundCommandRouter` → `runInboundAiRouter`.

자세한 계약: `docs/founder-surface-contract.md`.

## 아웃바운드

- `ensureExecutionRunDispatched` → (vNext.13) 외부 승인 게이트 통과 시에만 → `dispatchOutboundActionsForRun` → 동적 로드 `dispatchPlannedRoutes.js`.
- 계획: `planExecutionRoutesForRun` / 상태: `orchestration_plan`, `truth_reconciliation`, `external_execution_authorization`.

`docs/orchestration-route-policy.md` 참고.

## 핸드오프 트리

`docs/cursor-handoffs/00_Document_Authority_Read_Path.md`
