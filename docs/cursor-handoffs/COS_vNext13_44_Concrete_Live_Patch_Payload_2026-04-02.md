# vNext.13.44 — Concrete live patch payload compiler + pre-trigger smoke

## What this patch is

- **No new slash/command grammar** and no change to founder-facing natural language strings in COS tools.
- Adds a **deterministic** path that turns an already-closed task (`live_patch` on a packet or `live_patch` in `invoke_external_tool` payload) into the **`cursor_automation_emit_patch_v1`** shape: `title` + `ops[]` with `{ op: create|replace, path, content }`.
- **Open-world** `emit_patch` payloads (only `title`/`body`/`content` markdown) are **not** auto-inferred; cloud automation is **not** called until the contract is satisfied. An **artifact** is still produced, with **degraded** status and a **machine-readable** summary listing missing contract fields.

## Contract

- Name: `cursor_automation_emit_patch_v1` (constant `EMIT_PATCH_CONTRACT_NAME` in `livePatchPayload.js`).
- Required on the JSON sent to Cursor Automation as `payload`: non-empty `title`, non-empty `ops` array, each op with `op` ∈ `create|replace`, non-empty `path`, and defined `content`.

## Narrow task shape

- `live_patch: { path, operation: 'create'|'replace', content }` — all required; `content` must be non-empty after trim.

## Harness / delegate packets

- Optional `live_patch` on a packet is passed through `harnessBridge.normalizeCosPackets` and included in starter `emit_patch` invoke payload via `starterLadder.buildInvokePayloadForPacket`.
- `validateToolCallArgs` rejects malformed `live_patch` on custom `packets` with `invalid_payload`.

## Ops smoke (pre-trigger)

When `COS_OPS_SMOKE_ENABLED=1` and `cosRunId` is present on the invoke context:

- `live_payload_compilation_started` — `compilation_mode`: `narrow` | `already_has_ops` | `none`
- `live_payload_compilation_failed` — only if `live_patch` object present but incomplete (`narrow_live_patch_incomplete`)
- `trigger_blocked_invalid_payload` — contract not met before HTTP trigger; detail includes `missing_required_fields` (names only), `blocked_reason_code`, `selected_live_contract_name`

`aggregateSmokeSessionProgress` returns `final_status: pre_trigger_blocked_invalid_payload` when `trigger_blocked_invalid_payload` appears without `cursor_trigger_recorded`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## Regression scripts

- `scripts/test-minimal-single-file-create-compiles-live-payload.mjs`
- `scripts/test-minimal-single-file-replace-compiles-live-payload.mjs`
- `scripts/test-narrow-task-detector-does-not-coerce-open-world-requests.mjs`
- `scripts/test-founder-blocked-reason-surfaces-machine-useful-cause.mjs`
- `scripts/test-live-only-blocked-pretrigger-records-smoke-phase.mjs`

## Migration / env

- None required. Reuses existing Cursor Automation env.
