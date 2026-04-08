# vNext.13.41 — Preallocated run shell + run-scoped founder milestone views

## Preallocated shell (delegate accepted)

- `persistAcceptedRunShell({ threadKey, dispatch, founder_request_summary })` inserts a durable `cos_runs` row **before** starter kickoff: `starter_kickoff: null`, packet graph from dispatch with no kick outcome, **no** supervisor wake.
- `finalizeRunAfterStarterKickoff({ runId, threadKey, dispatch, starter_kickoff, founder_request_summary })` patches that row with kick + recomputed graph, appends `run_persisted` (Supabase), then `signalSupervisorWakeForRun`.
- `persistRunAfterDelegate` is implemented as shell + finalize with the caller-supplied kick (tests and non–direct-conversation callers unchanged in API).
- **Founder direct conversation** (`runFounderDirectConversation.js`): accepted → shell → `executeStarterKickoffIfEligible({ …, cosRunId })` → finalize. If shell insert fails, falls back to kick without `cosRunId` + `persistRunAfterDelegate` (legacy ledger for first packet).

## Starter kickoff

- `executeStarterKickoffIfEligible` accepts optional `cosRunId`; passed through to `executePacketInvocation` so the first `tool_invocation` / `tool_result` rows include `cos_run_id` when the shell path succeeded.

## Founder milestone sources (run-scoped)

- `processRunMilestones` uses `readExecutionSummaryForRun(run, n)` and `readReviewQueueForRun(run, n)` instead of thread-only readers.
- `executionArtifactMatchesRun(row, run)`:
  1. `payload.cos_run_id` or `payload.run_id` equals `run.id` → include.
  2. Legacy: `tool_result` / `tool_invocation` with `run_packet_id` in `run.required_packet_ids`.
  3. Legacy: `harness_dispatch` / `harness_packet` where `payload.dispatch_id` matches `run.dispatch_id` (and packet id in `required_packet_ids` when present on harness rows).
- **Not** attributed to a run: `execution_note` and any tool row without explicit run id and without a matching required packet id (avoids cross-run leakage when packet ids collide but COS run id is absent).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

No new migration or env for 13.41.

## Regression scripts

- `formatExecutionSummaryLine` does not embed `result_summary` for `tool_result` rows (it uses tool/action/status/outcome/next/path). Run-scoped summary tests that assert on formatted output should use a field that appears in that line (e.g. `next_required_input`) or assert on raw artifacts separately.
- `scripts/test-starter-kickoff-ledger-includes-cos-run-id.mjs`
- `scripts/test-run-scoped-summary-does-not-leak-across-runs.mjs`
- `scripts/test-run-scoped-review-queue-does-not-leak-across-runs.mjs`
- `scripts/test-preallocated-run-shell-finalize-preserves-existing-semantics.mjs`
