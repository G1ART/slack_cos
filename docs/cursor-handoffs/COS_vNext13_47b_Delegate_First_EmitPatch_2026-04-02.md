# vNext.13.47b — Delegate-first cloud emit_patch enforcement

## What this patch is

- **Gate**: `cursor` + `emit_patch` + Cursor cloud automation lane + **no** `packetId` (non-starter invoke) + payload lacks cloud contract source (no narrow `live_patch` / no `ops`) → **blocked** before `prepareEmitPatchForCloudAutomation`, with `blocked_reason: delegate_packets_missing_for_emit_patch` and `missing_required_fields: ['packets','live_patch']`.
- **Starter / packet path**: `invokeExternalTool` called with `ctx.packetId` (same as `executePacketInvocation`) **bypasses** this gate so incomplete narrow packets still reach the existing contract / smoke phases.
- **Bridge**: After `delegate_harness_team` is **accepted**, `stashDelegateEmitPatchContext(threadKey, dispatch)` stores the first runnable `cursor`/`emit_patch` packet that has **valid narrow** `live_patch`. A subsequent founder `invoke_external_tool` with empty payload **merges** that structured payload (thread-keyed stash).
- **Audit**: `summarizeToolArgsForAudit` for `invoke_external_tool` sets `delegate_live_patch_present` when merged payload includes `live_patch` (field names only).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## New regression scripts

- `scripts/test-cursor-emit-patch-direct-invoke-blocked-without-delegate-packets.mjs`
- `scripts/test-structured-delegate-live-packet-reaches-invoke-payload.mjs`
- `scripts/test-minimal-live-smoke-produces-nonempty-payload-top-level-keys.mjs`
- `scripts/test-blocked-reason-delegate-packets-missing-is-machine-generated.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.47b: delegate-first emit_patch gate and stash merge"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
