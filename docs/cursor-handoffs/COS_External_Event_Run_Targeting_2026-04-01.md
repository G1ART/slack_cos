# COS external events — run-id targeting (vNext.13.38)

## Runtime truth

- `processCanonicalExternalEvent` requires a correlation row with non-empty `run_id`. It loads the run with `getRunById(run_id)` and refuses to patch when the row is missing or `thread_key` does not match the correlation (log: `cos_external_event_stale_or_missing_run`). There is no fallback to `getActiveRunForThread`.
- Cursor/GitHub packet patches use `applyExternalCursorPacketProgressForRun` / `applyExternalPacketProgressStateForRun` and `patchRunById`.
- `completed_at` is set only when derived `status === 'completed'`; otherwise it is cleared (`null`).

## Durable evidence (`cos_run_events`)

- Nullable columns: `matched_by`, `canonical_status`, `payload_fingerprint_prefix` (migration `20260402140000_cos_run_events_evidence_columns.sql`).
- Ingress passes fingerprint + match metadata via `externalEventGateway` → `processCanonicalExternalEvent(..., ingressMeta)`.

## Store substrate

- Memory: `memRunsById` retains all runs per UUID; `memRuns` remains thread → latest active snapshot.
- File: `execution_runs/by_id/<uuid>.json` plus existing thread-key JSON for latest.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

Apply the new migration on Supabase before relying on production `cos_run_events` inserts with evidence columns.
