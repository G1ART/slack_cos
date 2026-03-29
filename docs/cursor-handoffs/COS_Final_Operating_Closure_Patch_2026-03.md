# COS Final Operating Closure Patch — 2026-03-29

## Patch Summary

execution_run을 진정한 operating system으로 만드는 마지막 수렴 패치.

- **Canonical dispatch lifecycle**: 모든 execution creation path가 하나의 `ensureExecutionRunDispatched()`를 호출
- **Lane dependency scheduler**: research → swe / uiux → qa 결정적 순서 모델
- **Completion detection**: 전체 run 완료 / partial / manual_blocked / failed 자동 감지
- **PM cockpit**: 대표가 progress / retry / manual action 질의하면 실시간 상태 응답
- **Provider operational seams**: GitHub / Cursor / Supabase live/draft/manual 경로 operationalize

## Architecture

```
execution_run creation
  ↓
ensureExecutionRunDispatched() — canonical single entrypoint
  ↓
dispatchOutboundActionsForRun() — idempotent, run-level state guard
  ↓
per-lane dispatch: research → uiux → github → cursor → supabase
  ↓
result ingestion: ingestGithubResult / ingestCursorResult / ingestSupabaseResult
  ↓
completion detection: evaluateExecutionRunCompletion()
  ↓
PM cockpit: renderExecutionReportingPacket / renderPMCockpitPacket
```

## Changed Files

| File | Change |
|------|--------|
| `src/features/executionDispatchLifecycle.js` | **NEW** — canonical dispatch, lane scheduler, completion detection, PM intent, provider diagnostics |
| `src/features/executionRun.js` | `getRunDispatchState()`, `updateLaneStatus()`, `outbound_last_error` field |
| `src/features/executionOutboundOrchestrator.js` | Structured artifact content (research/uiux/qa) |
| `src/features/executionSpineRouter.js` | retry/manual intent handling, completion detection integration, PM cockpit renderer |
| `src/features/runInboundAiRouter.js` | `dispatchOutbound...` → `ensureExecutionRunDispatched()` |
| `src/features/startProjectLockConfirmed.js` | `dispatchOutbound...` → `ensureExecutionRunDispatched()` |
| `src/features/projectSpecSession.js` | `dispatchOutbound...` → `ensureExecutionRunDispatched()` |
| `scripts/test-final-operating-closure.mjs` | **NEW** — 11 regression tests |
| `package.json` | test script에 final-operating-closure 추가 |

## Key Concepts

### Canonical Dispatch Lifecycle (`executionDispatchLifecycle.js`)

- `ensureExecutionRunDispatched(run, metadata)` — idempotent, fire-and-forget safe
- `shouldDispatchRun(run)` — only `not_started` returns true
- `markRunDispatchStarted/Completed/Failed` — via `updateOutboundDispatchState`

### Lane Dependency Scheduler

Default model:
- `research_benchmark`: no deps → dispatches first
- `uiux_design`: depends on `research_benchmark`
- `fullstack_swe`: depends on `research_benchmark`
- `qa_qc`: depends on `fullstack_swe`

Helpers: `computeLaneDispatchPlan(run)`, `getDispatchableLanes(run)`, `isLaneCompleted(run, lane)`

### Completion Detection

`evaluateExecutionRunCompletion(runId)` returns:
- `overall_status`: running / partial / manual_blocked / completed / failed
- `blocking_lanes`, `manual_required_lanes`, `completed_lanes`, `failed_lanes`
- `next_actions` — human-readable next steps

`detectAndApplyCompletion(runId)` — auto-transitions run stage when all lanes complete.

### PM Cockpit Commands

Representative-facing intent mapping in execution spine:
- "progress" / "진행 상황" / "지금 어디까지 됐어" → reporting packet
- "retry" / "재시도" / "다시 해" → retry + status
- "manual action" / "수동 조치 뭐 남았어" → manual actions detail
- "에스컬레이션" → escalation packet

### Provider Operational Status

- `diagnoseGithubConfig()` — env validation, missing config reporting
- `getCursorOperationalStatus(runId)` — no_handoff / awaiting_result / result_ingested / failed
- `buildSupabaseManualApplyInstructions(runId)` — step-by-step manual apply guide

## Council Policy

Council은 이 패치의 어떤 경로에서도 user-facing으로 노출되지 않음.
explicit council command 또는 bounded escalation에서만 허용 (기존 정책 유지).

## Test Results

- `npm test`: **PASS** (32 passed, 0 failed, 1 skipped)
- Final operating closure tests: **11/11 PASS**
  1. ensureExecutionRunDispatched auto-dispatches
  2. ensureExecutionRunDispatched idempotent
  3. dispatch state transitions
  4. lane dependency scheduling
  5. completion detection
  6. github config diagnostics
  7. cursor awaiting_result → result_ingested
  8. supabase manual_apply → applied
  9. PM cockpit status asks
  10. retry without duplication
  11. no council leak

## Next Patch Priorities

1. **Live provider integration** — Cursor cloud callback (webhook), Supabase CLI auto-apply
2. **Lane dependency enforcement at dispatch time** — currently modeled but dispatch still parallel-seeds
3. **Completion → notification** — auto-notify representative when all lanes complete
4. **Execution history** — list past completed runs, re-open for iteration
5. **Multi-run management** — concurrent execution runs across threads
