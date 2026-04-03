# Runtime routing (Slack COS)

## 인바운드

- **창업자 (`founderRoute`)**: `resolveFounderRouteDecision` SSOT (`src/founder/founderRouteInvariant.js`). `app.js` 첫 블록에서 `runFounderDirectKernel`만 — **command/AI router 미진입** (회귀: `test-vnext12-1-founder-no-command-router.mjs`, `test-vnext13-founder-no-routing-surface.mjs`, `test-vnext13-3-founder-single-entry-invariant.mjs`). Launch gate 통과 시 표면은 `founderLaunchFormatter.js` 전용 (vNext.13.2). vNext.13.3: `cosGovernanceAdvisory`는 제안·승인 표면에서 **부록 비활성**(환경·서피스 예산).
- **채널/오퍼레이터**: `founderRequestPipeline` 헌법 spine 또는 `runInboundCommandRouter` → `runInboundAiRouter` (AI 라우터 내부 창업자 가드는 다시 `runFounderDirectKernel`).

자세한 계약: `docs/founder-surface-contract.md`.

## 아웃바운드

- `ensureExecutionRunDispatched` → **명시 `authorized`만** 통과 → `dispatchPlannedExecutionForRun` → `dispatchPlannedRoutes.js`.
- 계획: `planExecutionRoutesForRun` / 상태: `orchestration_plan`, `truth_reconciliation`, `external_execution_authorization`.

`docs/orchestration-route-policy.md` 참고.

## 핸드오프 트리

`docs/cursor-handoffs/00_Document_Authority_Read_Path.md`
