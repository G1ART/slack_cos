# Runtime routing (Slack COS)

## 인바운드

- **창업자 (`founderRoute`)**: `app.js` → `founderRequestPipeline` 4단계만. **command router 미진입** (`shouldRunCommandRouter = !founderRoute` 아래 분기는 비창업자만).
- **채널/오퍼레이터**: `founderRequestPipeline` 헌법 경로 또는 `runInboundCommandRouter` → `runInboundAiRouter`.

자세한 계약: `docs/founder-surface-contract.md`.

## 아웃바운드

- `ensureExecutionRunDispatched` → `dispatchOutboundActionsForRun` → 동적 로드 `dispatchPlannedRoutes.js`.
- 계획: `planExecutionRoutesForRun` / 상태: `orchestration_plan`, `truth_reconciliation`.

`docs/orchestration-route-policy.md` 참고.

## 핸드오프 트리

`docs/cursor-handoffs/00_Document_Authority_Read_Path.md`
