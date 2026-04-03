# Orchestration route policy (vNext.12 + vNext.13)

## Planner = law

- `planExecutionRoutesForRun` → `route_decisions[]`에 `owning_agent`, `execution_mode`, `truth_source`, `expected_refs`, `success_condition`, `fallback_rule` 등을 둠 (`planExecutionRoutes.js` + `cosCapabilityCatalog.js` 계약).
- **Executor**는 `dispatchPlannedRoutes`만 호출해 결정된 (capability, provider) 쌍을 실행.

## Capability 추출

`runCapabilityExtractor.js`: `fullstack_code`는 코드/DB/배포 표면이 있을 때만 (순수 UI 카피·리서치-only는 GitHub 미발사). `qa_validation`은 코드·DB·UI·배포 중 하나일 때만.

## Deploy

- Provider truth에서 Vercel/Railway `live`면 해당 패킷 JSON 기록.
- 아니면 `observe_only` 결정 + bootstrap 요약 JSON.

## Truth reconciliation (vNext.12.1 정본, vNext.13 단일화)

- `truthReconciliation.js`: 경로별 `reconciled_status` — `satisfied` | `unsatisfied` | `draft_only` (예: GitHub는 issue id 없으면 draft_only, Cursor는 handoff+live ref 둘 다 있어야 satisfied).
- `aggregateReconciliationOverall` → `completed` | `partial` | `failed` | `draft_only` | `observe_only`.
- `evaluateExecutionRunCompletion`: 엔트리가 있으면 위 스냅샷을 completion 정본으로 사용. **엔트리가 없으면** `overall_status: pending`, `completion_source: 'truth_reconciliation'`만 반환 (레인 outbound 레거시 폴백 없음).

## External dispatch gate (vNext.13 / 13.1)

- `ensureExecutionRunDispatched` → 스토어에서 최신 런 재조회 → **`external_execution_authorization.state === 'authorized'`만** 통과 (vNext.13.1 default-deny).
- 통과 시 `dispatchPlannedExecutionForRun` → `dispatchPlannedRoutes`.
- `external_execution_authorization.state`: `authorized`(기본) | `pending_approval` | `draft_only`.

## Proposal-derived capabilities (vNext.13)

- `extractCapabilitiesFromProposalPacket(proposal)`: 제안 패킷의 작업 문장에서만 업무 capability 플래그 도출 (창업자 원문 직접 키워드 매핑 아님).

## 레거시

- `planOutboundActionsForRun`: route_decisions의 어댑터(호환용).
- `dispatchWorkstream('fullstack_swe')`: 플랜에서 `fullstack_code`·`db_schema` 결정만 필터해 디스패치 (Supabase 무조건 묶기 제거).

## 에이전트·툴 계약

- `src/orchestration/agentContracts.js` — 역할 경계.
- `src/orchestration/toolActuatorContracts.js` — 툴별 기대 truth 필드.

## Harness constitution (vNext.13.2)

- `harnessAgentCharters.js` — 13 에이전트: mission, forbidden_actions, overlap, review.
- `harnessSkillsRegistry.js` — on-demand skill packets (planner attach); not founder-keyword routes.
- 문서: `docs/harness-constitution.md`, `docs/harness-subagent-skills.md`.
