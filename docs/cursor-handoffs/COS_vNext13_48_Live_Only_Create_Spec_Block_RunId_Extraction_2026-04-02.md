# vNext.13.48 — Live-only create_spec hard block + trigger run-id extraction

## What this patch is

- **Live-only / no-fallback**: When an accepted `delegate_harness_team` dispatch has a structured `emit_patch` packet with `live_patch.live_only === true` and `live_patch.no_fallback === true`, the thread is marked (`delegateEmitPatchStash`). Any `invoke_external_tool` with `cursor` + `create_spec` on that thread is **blocked** immediately with `create_spec_disallowed_in_live_only_mode` (pretrigger: `live_only_no_fallback_create_spec_forbidden`). No founder text parsing.
- **Trigger response**: `extractAutomationResponseFields` gains nested dot-path candidates (`data.run.id`, `result.agentRunId`, `job.run.id`, etc.), returns `selected_*_field_name` and `has_run_id` / `has_status` / `has_url`. Env overrides unchanged.
- **Ops phases**: After `cursor_trigger_recorded`, if HTTP ok but no `external_run_id`, record `trigger_accepted_external_run_id_absent` with safe trigger detail. `aggregateSmokeSessionProgress` sets `final_status: trigger_accepted_external_run_id_missing` when appropriate.
- **Summary**: `summarize-ops-smoke-sessions` prints `response_top_level_keys`, `selected_run_id_field_name`, `has_run_id`, `has_status`, `has_url` (from latest trigger evidence rows).
- **Bugfix**: `recordOpsSmokePhase` spreads `detail` onto the event payload, so trigger evidence lives at **`payload.trigger`**, not only `payload.detail.trigger`. `extractLatestTriggerEvidenceFromRows` reads both so session summaries get `has_run_id` / field names correctly.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## New regression scripts

- `scripts/test-live-only-no-fallback-blocks-create-spec.mjs`
- `scripts/test-live-only-smoke-does-not-produce-create-spec-session.mjs`
- `scripts/test-trigger-response-run-id-extraction-from-supported-shapes.mjs`
- `scripts/test-trigger-response-safe-subset-audit-no-secrets.mjs`
- `scripts/test-accepted-trigger-without-run-id-surfaces-has-run-id-false.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.48: live-only create_spec block, trigger run-id extraction, smoke summary"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
