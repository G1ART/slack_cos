# vNext.13.47 — Supabase-persisted orphan pre-trigger audit (cos_ops_smoke_events)

## What this patch is

- **Table** `cos_ops_smoke_events` (migration): `id`, `created_at`, `smoke_session_id`, nullable `run_id` (no FK), `thread_key`, `event_type`, `payload` jsonb. Indexes on `created_at` desc, `smoke_session_id`, `event_type`.
- **Write path**: `recordCosPretriggerAudit` when there is **no** durable `run_id` and run store mode is **supabase** → `supabaseAppendOpsSmokeEvent` (no `appendSmokeSummaryOrphanRow`). File/memory still use orphan JSONL / memory buffer.
- **Read path**: `listOpsSmokePhaseEventsForSummary` in Supabase mode → `supabaseListMergedSmokeSummaryEvents` = `cos_run_events` smoke types **plus** `cos_ops_smoke_events` rows (event type allowlist includes future phase names), merged by `created_at` desc.
- **Summary shape**: `summarizeOpsSmokeSessionsFromFlatRows` keeps real `event_type` per row, sorts sessions by `lastAt` (max of `payload.at` and row `created_at`), and adds allowlisted **machine** fields: `call_name`, `selected_tool`, `selected_action`, `delegate_packets_present`, `delegate_live_patch_present`, `payload_top_level_keys`, `blocked_reason`, `machine_hint`, `missing_required_fields`.
- **Scripts**: `scripts/summarize-ops-smoke-sessions.mjs` prints those fields in compact and full modes. Founder-facing strings unchanged.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## SQL (Supabase)

Apply new migration under `supabase/migrations/` (e.g. `20260402170000_cos_ops_smoke_events.sql`) in your Supabase project.

## New regression scripts

- `scripts/test-supabase-orphan-pretrigger-audit-persists-without-run-id.mjs`
- `scripts/test-summarize-smoke-sessions-merges-cos_run_events-and-ops_smoke_events.mjs`
- `scripts/test-latest-pretrigger-blocked-session-is-visible-in-supabase-summary.mjs`
- `scripts/test-ops-smoke-events-do-not-expose-raw-content-or-secrets.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.47: cos_ops_smoke_events, merge smoke summary, machine fields"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
