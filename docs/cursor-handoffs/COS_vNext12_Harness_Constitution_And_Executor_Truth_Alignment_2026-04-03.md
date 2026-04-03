# vNext.12 — Harness constitution + executor truth alignment

**날짜**: 2026-04-03  
**브랜치(의도)**: `patch/vnext12-harness-constitution-executor-alignment`

## GPT 레이어 도식 정합

- **Founder ↔ COS**: 자유 자연어; prefix/structured command는 창업자 경로에서 제거·무시. COS만 내부 계획·truth.
- **COS ↔ Agents**: `route_decisions` + `CAPABILITY_EXECUTION_CONTRACTS` + `agentContracts`로 역할·금지 행동 명시.
- **Agents ↔ Tools**: `dispatchPlannedRoutes`가 provider별 actuator만 호출; `fullstack_swe` 레인에서 Supabase 강제 결합 제거.
- **Truth**: `truthReconciliation.js`가 툴 산출 ref 기준으로 판정; `truth_reconciliation` 필드에 적재.

## 주요 파일

- `src/core/founderRequestPipeline.js` — 창업자 4단계, `founderMinimalWorkContext`
- `src/founder/founderDeterministicUtilityResolver.js` — launch vs run_progress 충돌 방지, `버전` 락
- `src/orchestration/dispatchPlannedRoutes.js`, `planExecutionRoutes.js`, `truthReconciliation.js`
- `src/features/executionOutboundOrchestrator.js` — dispatch 본문, deploy actuator, `generateSpecRefineArtifact`
- `src/orchestration/runCapabilityExtractor.js` — fullstack/qa 조건 정교화

## 테스트

`scripts/test-vnext12-*.mjs` (npm test 체인)

## 남은 일

- `evaluateExecutionRunCompletion`과 `truth_reconciliation` 통합
- `retryRunOutbound` 전면 플래너 정렬
