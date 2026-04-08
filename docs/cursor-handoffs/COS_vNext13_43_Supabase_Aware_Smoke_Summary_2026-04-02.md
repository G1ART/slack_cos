# vNext.13.43 — Supabase-aware smoke summary + first real smoke checklist

## What changed

- `scripts/summarize-ops-smoke-sessions.mjs` reads `ops_smoke_phase` from the **same store mode** as the app: **file** (JSONL under `COS_RUNTIME_STATE_DIR/cos_run_events`), **memory** (in-process tests), or **Supabase** (`cos_run_events` table).
- Read path is centralized in `listOpsSmokePhaseEventsForSummary` (`runCosEvents.js`) and `supabaseListOpsSmokePhaseEvents` (`runStoreSupabase.js`). **No raw payload dump** in script output — only `final_status`, `breaks_at`, `phases_seen`, `ordered_events` (phase + `at` only).

## CLI

- `--store file|memory|supabase` — force mode (default: follow `COS_RUN_STORE` + keys, same as `getCosRunStoreMode()`).
- `--state-dir` — file mode base dir (same as `COS_RUNTIME_STATE_DIR`).
- `--run-id <uuid>` — scope to one durable run.
- `--limit N` — max **sessions** listed (default 5); `--max-rows` caps rows fetched from DB/disk before grouping.
- `--supabase-url` / `--supabase-key` — optional overrides (else `COS_RUNTIME_SUPABASE_*` then `SUPABASE_*`).
- `--compact` — one JSON object per session + footer (for piping).

## First real smoke checklist (Railway / Supabase)

1. Set **`COS_OPS_SMOKE_ENABLED=1`** on the deployment.
2. Optionally set **`COS_OPS_SMOKE_SESSION_ID`** for a single trace id.
3. One **controlled** founder ask that triggers Cursor cloud automation (same as normal ops, no new slash grammar).
4. Confirm callback path (ingress logs / health) — no change to this doc’s scope.
5. From a machine with DB access, run summary in **supabase** mode, e.g.  
   `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 5`  
   (with `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` or runtime overrides in env).
6. Interpret:
   - **`full_pipeline_observed`** — success for closure tracking.
   - **`partial_stopped_before_<phase>`** — first missing phase is where the chain stopped.
   - **`trigger_failed`** — `cursor_trigger_failed` was recorded.
   - **`no_ops_smoke_events`** — smoke flag off or no events yet.

## Code references

- `summarizeOpsSmokeSessionsFromFlatRows` — `smokeOps.js` (session grouping + aggregate).
- `createCosRuntimeSupabaseForSummary` — does **not** replace `createCosRuntimeSupabase()` used by the run store; summary-only credential resolution.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## Regression scripts

- `scripts/test-smoke-summary-file-mode.mjs`
- `scripts/test-smoke-summary-supabase-mode.mjs`
- `scripts/test-smoke-summary-does-not-expose-raw-secrets.mjs`

## Migration

- None.
