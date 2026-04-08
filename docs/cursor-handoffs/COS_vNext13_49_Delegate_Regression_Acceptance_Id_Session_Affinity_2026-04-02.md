# vNext.13.49 — Delegate schema regression fix + acceptance id + smoke session affinity

## What this patch is

- **Delegate strict validation**: `delegateHarnessPacketValidate.js` — `validateDelegateHarnessTeamToolArgs` / `validateDelegateHarnessPacketForLivePatch` align with OpenAI strict packet shape (nullable `review_required`, `review_focus`, `packet_status`, required packet keys including `inputs`). Failures → `blocked_reason: delegate_schema_invalid`, `missing_required_fields` / `invalid_enum_fields` / `invalid_nested_fields` / `delegate_schema_error_fields` on pretrigger audit.
- **Acceptance id (not canonical run id)**: `extractAutomationResponseFields` adds `backgroundComposerId` (and env `CURSOR_AUTOMATION_RESPONSE_ACCEPTED_ID_PATH`) → `accepted_external_id`, `selected_accepted_id_field_name`, `has_accepted_external_id`. Never copied into `external_run_id`. Ops phases: `trigger_accepted_external_id_present` | `trigger_accepted_external_id_missing`; `final_status` distinguishes these from legacy `trigger_accepted_external_run_id_missing`.
- **Session affinity**: `resolveOpsSmokeSessionIdForToolAudit` uses `resolveSmokeSessionId` (env `COS_OPS_SMOKE_SESSION_ID` or cached `smoke_*`) — no `smoke_turn_*`. `invokeExternalTool` falls back to `resolveSmokeSessionId` before `smoke_inv_*`.
- **Test note**: `test-pretrigger-invalid-payload-creates-new-smoke-session.mjs` now expects a **single** cached parent `smoke_*` session id for two direct `invokeExternalTool` calls (not two distinct ids per invocation).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## New regression scripts

- `scripts/test-delegate-harness-minimal-live-packet-passes-strict-schema.mjs`
- `scripts/test-delegate-schema-invalid-fields-surface-machine-reason.mjs`
- `scripts/test-trigger-response-background-composer-id-recorded-as-accepted-external-id.mjs`
- `scripts/test-accepted-id-is-not-labeled-canonical-run-id.mjs`
- `scripts/test-configured-smoke-session-id-persists-across-turn-and-invocation.mjs`
- `scripts/test-live-only-create-spec-guard-still-holds.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.49: delegate schema fix, acceptance id, smoke session affinity"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
