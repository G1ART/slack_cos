# Run-scoped supervisor wake + progression (vNext.13.39)

## Wake

- `registerRunStateChangeListener((threadKey, runId?) => …)` — second arg set when the write targeted a specific durable run uuid.
- `signalSupervisorWakeForRun(threadKey, runId)` — sets durable `pending_supervisor_wake` then calls `notifyRunStateChangedForRun` (direct listener). Used from `persistRunAfterDelegate`, canonical external event handling, and run-scoped progressor paths. See `COS_vNext13_40_Durable_Run_Queue_Ledger_2026-04-02.md` for periodic backstop + ledger filtering.
- `notifyRunStateChanged(threadKey)` — backward compatible; invokes listener with `runId === null` (active-thread tick).
- Production (`app.js`): if `runId` is present, `tickRunSupervisorForRun(runId, …)`; else `tickRunSupervisorForThread(threadKey, …)`.
- Cursor 웹훅 매칭 경로: `handleCursorWebhookIngress` → `processCanonicalExternalEvent` → `signalSupervisorWakeForRun` → `notifyRunStateChangedForRun` → (listener) `tickRunSupervisorForRun`. 회귀: `scripts/test-cursor-callback-wakes-correlated-run-supervisor.mjs` (리스너 `runId` + `pending_supervisor_wake`).

## Supervisor tick

- `tickRunSupervisorForRun(runId, ctx)` — `getRunById` → `reconcileRunFromLedgerForRun` → `maybeAdvanceNextPacketForRun` (loop) → `processRunMilestones` for that row.
- `tickRunSupervisorForThread` — still uses active run only; inflight key `supervisorTickInflightKeyForThread(threadKey)` (`t:` prefix).
- `tickRunSupervisorForRun` inflight key from `supervisorTickInflightKeyForRun` (`r:${runId}`) so a late callback on run A is not blocked by a concurrent tick on thread T’s active run B. (`src/founder/supervisorTickSharding.js`)

## Progressor

- `reconcileRunFromLedgerForRun(runId)` / `maybeAdvanceNextPacketForRun(runId)` — read/write via `patchRunById`; ledger still keyed by `run.thread_key`.
- Thread helpers `reconcileRunFromLedger` / `maybeAdvanceNextPacket` delegate to the active run’s id.

## Milestones

- `processRunMilestones` applies founder notification patches with `patchRunById(run.id, …)` so non-active runs still update their own milestone timestamps.

## cos_run_events views

- Thread helpers (`listRecentCosRunEventsForThread`, `getLatestExternalRunEventsForThread`) are documented as **active-run only**.
- Run helpers: `listRecentCosRunEventsForRun` (alias of `listCosRunEventsForRun`), `getLatestExternalRunEventsForRun(runId)`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

No new migration or env for 13.39.
