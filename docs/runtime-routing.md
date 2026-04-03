# Runtime routing (Slack COS)

## 인바운드

- **창업자 DM/멘션 (`founderRoute`)**: `runInboundAiRouter` → `founderRequestPipeline` (직접 채팅 ON 시 자연어 단일 경로). **커맨드 라우터 미사용** (`app.js`).
- **그 외**: `runInboundCommandRouter` 및 구조화 커맨드 경로.

자세한 계약: [`founder-surface-contract.md`](founder-surface-contract.md).

## 아웃바운드 실행

- 진입: `ensureExecutionRunDispatched` → `dispatchOutboundActionsForRun`
- 계획: `planExecutionRoutesForRun` (`src/orchestration/planExecutionRoutes.js`)
- 상태: `execution_run.orchestration_plan`

자세한 정책: [`orchestration-route-policy.md`](orchestration-route-policy.md).

## 핸드오프 문서 트리

[`docs/cursor-handoffs/00_Document_Authority_Read_Path.md`](cursor-handoffs/00_Document_Authority_Read_Path.md) — 세션 간 정본 순서.
