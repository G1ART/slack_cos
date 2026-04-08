# vNext.13.46 — Pre-trigger tool audit + non-speculative founder blocked copy

## What this patch is

- **Ops-only audit events** (when `COS_OPS_SMOKE_ENABLED=1`): `cos_pretrigger_tool_call` and `cos_pretrigger_tool_call_blocked` on `cos_run_events` (or memory/file orphan file when no run id yet). Payloads include `smoke_session_id`, `call_name`, `selected_tool` / `selected_action` (invoke path), delegate packet flags, `payload_top_level_keys` (names only), `machine_hint`, `blocked_reason`, `missing_required_fields` — **no** raw body, secrets, or full URLs.
- **Founder tool loop**: same-turn `smoke_turn_*` session id; passes `ops_smoke_session_id` into `invokeExternalTool` so delegate + invoke audits share one session when both occur in a turn.
- **`invokeExternalTool`**: `ops_smoke_session_id` optional ctx override; otherwise `smoke_inv_<invocation_id>` when `cosRunId` present; audit on observe, credential block, and emit_patch contract failure.
- **Smoke summary**: `listOpsSmokePhaseEventsForSummary` + Supabase query include the new event types; `summarizeOpsSmokeSessionsFromFlatRows` groups them by `smoke_session_id`; `aggregateSmokeSessionProgress` treats `cos_pretrigger_tool_call_blocked` like pre-trigger invalid payload when no trigger recorded.
- **Founder final text**: if the last tool round had `invalid_payload` or `emit_patch_cloud_contract_not_met`, **replace** model text with `formatFounderSafeToolBlockMessage` (machine hints / missing fields / fixed fallback only). System instructions forbid speculation (e.g. line-break guesses).
- **Boot**: `getDelegateBootSchemaSnapshot()` exported; `app.js` uses it for `cos_boot_delegate_schema`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## New regression scripts

- `scripts/test-pretrigger-tool-call-audit-for-direct-emit-patch.mjs`
- `scripts/test-pretrigger-tool-call-audit-for-delegate-packets-path.mjs`
- `scripts/test-founder-blocked-reason-does-not-speculate.mjs`
- `scripts/test-pretrigger-blocked-creates-visible-smoke-session-row.mjs`
- `scripts/test-delegate-schema-boot-snapshot-shows-packets-true.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.46: pretrigger audit events, safe founder block copy, smoke summary merge"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
