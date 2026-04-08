# Branch disposition: `cursor/build-spec-execution-93e0` (vNext.13.50)

## Compared to `main` (local diff at patch time)

- **Only file changed vs main**: `src/founder/starterLadder.js`
- **Change**: `buildInvokePayloadForPacket` for `cursor` + `create_spec` only — appends a `## Founder constraints` block to the spec `body`, built from `packet.inputs` and `packet.constraints` lists.

## Relation to vNext.13.50 (live-only delegate-first `emit_patch` hard gate)

- **Not used** for the emit_patch / delegate stash / `runPacketId` bypass regression.
- **Conclusion**: **superseded** for this workstream — main + 13.50 fixes do not require merging 93e0.

## Absorb into main?

- **Optional product UX** (richer create_spec body). Not absorbed in 13.50.

## Delete remote branch `origin/cursor/build-spec-execution-93e0`?

- **Yes** for this COS runtime track, if no other initiative needs the create_spec constraint formatting. If product later wants that body shape, cherry-pick the `starterLadder.js` hunk only.
