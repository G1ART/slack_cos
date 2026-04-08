# vNext.13.50 — Delegate-first hard gate recovery + 93e0 disposition

## What this patch is

- **Hard gate**: Cloud-lane `cursor` + `emit_patch` with no cloud contract after stash merge blocks when **either** `!run_packet_id` (unchanged) **or** thread is **live-only/no-fallback** (`isThreadLiveOnlyNoFallbackSmoke`). The latter closes the `runPacketId` bypass regression.
- **Machine reasons**: Live-only path → `blocked_reason: delegate_required_before_emit_patch`, `machine_hint: live_only_emit_patch_requires_delegate_packets`. Non-live-only empty path → `delegate_packets_missing_for_emit_patch`, `machine_hint: emit_patch_requires_delegate_merge_or_packet_scope`.
- **Pretrigger summary**: For `invoke_external_tool`, `delegate_packets_present` is true when `emitPatchHasCloudContractSource(merged payload)` (reflects merged delegate contract, not delegate tool call shape).
- **Founder safe message**: `formatFounderSafeToolBlockMessage` surfaces delegate gate `blocked_reason` / `machine_hint` instead of falling through to generic invalid_payload text.
- **93e0**: See `COS_vNext13_50_93e0_Branch_Disposition.md` — **superseded** for this workstream; optional `create_spec` body UX only.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

## New / touched regression scripts

- `scripts/test-live-only-direct-emit-patch-never-bypasses-delegate-after-hard-gate.mjs`
- `scripts/test-same-turn-delegate-packet-is-merged-into-actual-emit-patch-payload.mjs`
- `scripts/test-latest-summary-does-not-show-empty-direct-emit-patch-row-after-fix.mjs`
- `scripts/test-generic-invalid-payload-not-used-when-delegate-gate-can-explain.mjs`
- `scripts/test-93e0-superseded-or-absorbed-decision-documented.mjs`

## Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.50: delegate-first emit_patch hard gate, 93e0 superseded doc"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
