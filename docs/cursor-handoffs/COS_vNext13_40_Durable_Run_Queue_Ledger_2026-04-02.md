# vNext.13.40 — Durable run queue + run-aware ledger correlation

## Supervisor wake semantics

- **Direct wake** (`notifyRunStateChangedForRun` from `app.js` / listeners) is **best-effort**: it may skip when the supervisor lease is held, on re-entrant ticks, or under similar guardrails.
- **Periodic `tickRunSupervisor`** is the **durable backstop**: it acquires the lease, then processes **pending wake run ids** (`listPendingSupervisorWakeRunIds`), then **non-terminal run ids** (`listNonTerminalRunIds`), deduped in that order, each via `tickRunSupervisorForRun(..., skipLease: true)`. The legacy **thread-key sweep** (`listRunThreadKeys` → `tickRunSupervisorForThread`) remains as a fallback for active-thread behavior.
- **Durable marker**: `pending_supervisor_wake` + `last_supervisor_wake_request_at` on the run row (Supabase migration `20260402150000_cos_runs_supervisor_wake_marker.sql`). `signalSupervisorWakeForRun(threadKey, runId)` sets the flag and calls the direct notifier. `tickRunSupervisorForRun` clears the flag in `finally` after it actually attempted work.

## Ledger correlation (`reconcileRunFromLedgerForRun`)

- **Priority**: `cos_run_id` or `run_id` on the `tool_result` payload **matching** the reconcile target → use that row for `run_packet_id` updates.
- Rows with an explicit run id **that does not match** are **ignored** (prevents same-thread cross-run contamination when packet ids overlap).
- **Legacy**: payloads **without** `cos_run_id` / `run_id` still use **packet-id–only** matching for required packets (backward compatible).
- New tool ledger rows include `cos_run_id` when `invokeExternalTool` is called with `ctx.cosRunId` (e.g. `maybeAdvanceNextPacketForRun` → `executePacketInvocation`).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

Apply Supabase migration when using durable runs in production: `supabase/migrations/20260402150000_cos_runs_supervisor_wake_marker.sql`.

No new env vars for 13.40.

Follow-up: **vNext.13.41** (`COS_vNext13_41_Preallocated_Run_Shell_Milestone_Views_2026-04-02.md`) — preallocated run shell before starter kickoff (first tool rows carry `cos_run_id`) and run-scoped execution summary / review queue for founder milestones.

## Regression scripts (13.40)

- `scripts/test-non-active-run-eventually-ticked-by-periodic-loop.mjs`
- `scripts/test-process-restart-does-not-lose-run-scoped-wake.mjs`
- `scripts/test-run-aware-ledger-filter-prevents-cross-run-packet-contamination.mjs`
- `scripts/test-legacy-artifact-fallback-still-works.mjs`
