# COS Slack — 운영 핸드오프 (요약)

**정본 읽기 순서**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`

## vNext.12 (2026-04) — Harness constitution + executor truth alignment

1. **창업자 4단계 (단일 표면)**: transcript 로드 → `tryResolveFounderDeterministicUtility`(launch 의도는 유틸에서 제외해 launch gate로 넘김) → `maybeHandleFounderLaunchGate` → 자연어 파트너 또는 `callText` 없을 때 짧은 폴백. `founderRoute`는 `resolveWorkObject` 없이 `founderMinimalWorkContext`만 사용. `업무등록:` 등 접두는 의미 없음(스트립). `COS_FOUNDER_DIRECT_CHAT`는 창업자 면에서 무시.
2. **오퍼레이터**: `source_type: channel` 등 비창업자만 헌법 골드/워크오브젝트 파이프라인 (`scripts/tests-constitutional/test-founder-gold-spec-v1.mjs` 메타와 동일).
3. **Executor**: `dispatchPlannedRoutes.js`가 `route_decisions`만 실행. `planOutboundActionsForRun`은 route_decisions 어댑터(deprecated 주석).
4. **Deploy**: `deploy_preview`는 Vercel/Railway 패킷 JSON 또는 `observe_only` 요약을 `data/deploy-results/` 및 `artifacts.deploy_preview`에 기록.
5. **Truth**: `reconcileRunTruthAfterDispatch` → `run.truth_reconciliation` + `dispatch_log`. 스펙 아웃라인은 `docs/spec-refine/`.
6. **계약 모듈**: `agentContracts.js`, `toolActuatorContracts.js`, `cosCapabilityCatalog.js` (`CAPABILITY_EXECUTION_CONTRACTS`).

vNext.11에서 이어진 내용: provider truth 입력, capability 추출 — `docs/orchestration-route-policy.md` 참고.

## 남은 리스크

- `evaluateExecutionRunCompletion`은 여전히 레인 아웃바운드 위주; `truth_reconciliation.overall`과 완전 통합은 미완.
- 창업자 상태 패킷(`executeSpine`)이 항상 `truth_reconciliation`만 쓰도록 바꾸는 작업은 다음 패치.
- `retryRunOutbound` 등 레거시 스케줄러가 플래너와 100% 동기화되지 않을 수 있음.

## 테스트

`npm test`에 `test-vnext12-founder-zero-command`, `test-vnext12-planner-controls-executor`, `test-vnext12-agent-tool-truth-reconciliation` 포함.
