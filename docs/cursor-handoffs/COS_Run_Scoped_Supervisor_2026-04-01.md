# Run-scoped supervisor wake + progression (vNext.13.39)

## Wake

- `registerRunStateChangeListener((threadKey, runId?) => …)` — second arg set when the write targeted a specific durable run uuid.
- `notifyRunStateChangedForRun(threadKey, runId)` — used from `processCanonicalExternalEvent`, `persistRunAfterDelegate`, and run-scoped progressor paths.
- `notifyRunStateChanged(threadKey)` — backward compatible; invokes listener with `runId === null` (active-thread tick).
- Production (`app.js`): if `runId` is present, `tickRunSupervisorForRun(runId, …)`; else `tickRunSupervisorForThread(threadKey, …)`.

## Supervisor tick

- `tickRunSupervisorForRun(runId, ctx)` — `getRunById` → `reconcileRunFromLedgerForRun` → `maybeAdvanceNextPacketForRun` (loop) → `processRunMilestones` for that row.
- `tickRunSupervisorForThread` — still uses active run only; inflight key `t:${threadKey}`.
- `tickRunSupervisorForRun` inflight key `r:${runId}` so a late callback on run A is not blocked by a concurrent tick on thread T’s active run B.

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
