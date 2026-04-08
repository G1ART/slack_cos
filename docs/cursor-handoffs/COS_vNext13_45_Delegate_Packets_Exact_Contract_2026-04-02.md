# vNext.13.45 — Delegate packets + exact emit_patch contract lock

## What this patch is

- **`delegate_harness_team` OpenAI strict schema** now includes **`packets`** (nullable array or `null`). Boot truth `delegate_schema_includes_packets` becomes **`true`** (`app.js` reads parameter keys from `getDelegateHarnessTeamParametersSnapshot()`).
- **Narrow live patch** requires `live_patch.live_only === true` and `live_patch.no_fallback === true` in addition to single path, `create|replace`, and non-empty content. This applies to **structured delegate packets** and **`invoke_external_tool` payload** compilation (`detectNarrowLivePatchFromPayload` / `prepareEmitPatchForCloudAutomation`).
- **Compiler entry** for delegate-only path: `prepareEmitPatchFromStructuredDelegatePacket(pkt)` in `livePatchPayload.js` (input is a packet object, not founder raw text).
- **Starter ladder** passes through `live_only` / `no_fallback` when building `emit_patch` payloads from packets (`starterLadder.js`).
- **Ops smoke**: each **`emit_patch`** invocation with `cosRunId` uses **`smoke_inv_<invocation_id>`** as `smoke_session_id` so repeat smokes appear as **separate sessions** in summaries. New phases: `delegate_packets_ready`, `emit_patch_payload_validated` (when contract passes pre-trigger).
- **Machine hints**: `formatEmitPatchMachineBlockedHints` + extended `formatEmitPatchCloudGateSummary`; delegate `invalid_payload` may include `machine_hint` on tool results (path/content/constraint wording only).

## Contract (unchanged shape)

- `cursor_automation_emit_patch_v1`: `title` + `ops[]` with `{ op: create|replace, path, content }` (`validateEmitPatchContractPayload`).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## Regression scripts (new)

- `scripts/test-delegate-schema-includes-packets.mjs`
- `scripts/test-minimal-live-create-compiles-from-structured-delegate-not-raw-text.mjs`
- `scripts/test-minimal-live-replace-compiles-from-structured-delegate-not-raw-text.mjs`
- `scripts/test-emit-patch-minimal-create-validator-pass.mjs`
- `scripts/test-emit-patch-minimal-replace-validator-pass.mjs`
- `scripts/test-pretrigger-invalid-payload-creates-new-smoke-session.mjs`
- `scripts/test-open-world-request-does-not-force-live-packet-compilation.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.45: delegate packets schema, narrow live_patch flags, smoke session per invoke"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
