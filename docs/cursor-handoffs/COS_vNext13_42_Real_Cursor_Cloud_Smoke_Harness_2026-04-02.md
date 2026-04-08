# vNext.13.42 — Real Cursor Cloud smoke harness + ops evidence closure

## What this patch is

- **Operational observation only** — no new founder-facing product behavior, no new slash grammar, no COS reasoning freeze.
- Goal: after 13.41 substrate work, capture **provider-shaped truth** for trigger response → callback → correlation → supervisor wake → packet progression → founder milestone, using **safe subsets** only.

## Enable (controlled path)

- `COS_OPS_SMOKE_ENABLED=1` — records `cos_run_events` rows with `event_type: ops_smoke_phase`.
- Optional `COS_OPS_SMOKE_SESSION_ID` — fixed id for one run; otherwise a per-process id `smoke_<timestamp>_<hex>`.

## Smoke session fields (in each event payload)

- `smoke_session_id`, `phase`, `at`, `thread_key` plus phase-specific detail (still no raw body, no full URLs, no secrets).

## Pipeline phases (order)

1. `cursor_trigger_recorded` (or `cursor_trigger_failed`)
2. `external_run_id_extracted` (when trigger returned an id)
3. `external_callback_matched` (correlation + canonical ingress)
4. `run_packet_progression_patched` (when packet was actually patched)
5. `supervisor_wake_enqueued`
6. `founder_milestone_sent` (milestone name in detail only)

## What operators should check on the first real run

- Trigger: `response_top_level_keys`, `http_status`, `external_run_id_tail`, `url_present`, `override_keys_used`.
- Callback: `selected_webhook_field_names`, `external_run_id_tail`, `canonical_status`, `matched_by`, `occurred_at_present`, hints `has_thread_key_hint` / `has_packet_id_hint`, `payload_fingerprint_prefix`.
- Closure: run `node scripts/summarize-ops-smoke-sessions.mjs --state-dir "$COS_RUNTIME_STATE_DIR"` (or set env) and read `final_status` / `breaks_at`.

## Success / partial / failure (summary script)

- **Success:** `final_status === full_pipeline_observed` (all phases present for that session).
- **Partial:** `final_status` starts with `partial_stopped_before_` — `breaks_at` names the first missing phase.
- **Trigger failure:** `final_status === trigger_failed` when `cursor_trigger_failed` was recorded.
- **No data:** `no_ops_smoke_events` if nothing was logged (smoke off or no path exercised).

## Code / scripts

- `src/founder/smokeOps.js` — builders + `aggregateSmokeSessionProgress`.
- Wiring: `toolsBridge` (trigger), `canonicalExternalEvent` + `externalEventGateway` (callback), `runSupervisor` (milestone).
- `scripts/summarize-ops-smoke-sessions.mjs` — `--run-id`, `--limit`, `--state-dir`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.42 ops smoke harness + tests + handoff"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

## Regression scripts

- `scripts/test-smoke-evidence-redacts-secrets-and-full-urls.mjs`
- `scripts/test-smoke-session-phase-ordering.mjs`
- `scripts/test-trigger-response-capture-safe-subset-only.mjs`
- `scripts/test-callback-evidence-capture-safe-subset-only.mjs`

## Migration

- None — uses existing `cos_run_events` JSON payload columns.
