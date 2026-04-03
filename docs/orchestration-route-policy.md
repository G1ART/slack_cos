# Orchestration route policy (vNext.12)

## Planner = law

- `planExecutionRoutesForRun` → `route_decisions[]`에 `owning_agent`, `execution_mode`, `truth_source`, `expected_refs`, `success_condition`, `fallback_rule` 등을 둠 (`planExecutionRoutes.js` + `cosCapabilityCatalog.js` 계약).
- **Executor**는 `dispatchPlannedRoutes`만 호출해 결정된 (capability, provider) 쌍을 실행.

## Capability 추출

`runCapabilityExtractor.js`: `fullstack_code`는 코드/DB/배포 표면이 있을 때만 (순수 UI 카피·리서치-only는 GitHub 미발사). `qa_validation`은 코드·DB·UI·배포 중 하나일 때만.

## Deploy

- Provider truth에서 Vercel/Railway `live`면 해당 패킷 JSON 기록.
- 아니면 `observe_only` 결정 + bootstrap 요약 JSON.

## Truth reconciliation

- `truthReconciliation.js`가 각 `route_decision`에 대해 `artifacts`·trace를 검사해 `satisfied` / `unsatisfied`.
- 결과는 `execution_run.truth_reconciliation`에 저장 (dispatch 로그 포함).

## 레거시

- `planOutboundActionsForRun`: route_decisions의 어댑터(호환용).
- `dispatchWorkstream('fullstack_swe')`: 플랜에서 `fullstack_code`·`db_schema` 결정만 필터해 디스패치 (Supabase 무조건 묶기 제거).

## 에이전트·툴 계약

- `src/orchestration/agentContracts.js` — 역할 경계.
- `src/orchestration/toolActuatorContracts.js` — 툴별 기대 truth 필드.
