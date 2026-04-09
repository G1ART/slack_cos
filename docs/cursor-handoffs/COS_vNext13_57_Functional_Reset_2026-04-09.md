# vNext.13.57 — Functional reset (execution boundary, not COS choke)

## Intent

Stop accreting smoke-specific control on the reasoning path. **Policy and assembly** are explicit at the **adapter / dispatch boundary**; COS remains natural-language orchestration.

## Functional units restored

1. **`executionProfile.js`** — Single SSOT for thread-scoped rules (`live_only_emit_patch` vs `default`). `evaluateCursorActionAgainstProfile` rejects forbidden actions (e.g. `create_spec` on live-only threads) with `policy_rejection` + `rejection_kind: execution_profile`.
2. **`cursorLivePatchDispatch.js`** — Canonical **merge (delegate stash) + compile** for Cursor `emit_patch` (`mergeEmitPatchPayloadForDispatch`, `compileEmitPatchForCloudAutomation`, `describeEmitPatchAssemblyBlock`). Constants: `REJECTION_KIND_*`, `EMIT_PATCH_MISSING_CLOUD_CONTRACT_SOURCE_CODE`.
3. **`cursorResultRecovery.js`** — Read-only summaries: primary Cursor webhook vs GitHub secondary (not primary completion authority). Separate from dispatch.
4. **`toolsBridge.js`** — Uses profile for `create_spec` block; uses dispatch helpers for emit_patch compile; **missing contract source** returns `rejection_kind: missing_contract_source` + explicit `exact_failure_code`; **assembly** failures use `rejection_kind: assembly_contract_not_met` and `blocked / assembly /` summary prefix; early delegate gate uses `blocked / contract_source /`.
5. **`runFounderDirectConversation.js`** — Pretrigger **observe** for `invoke_external_tool` runs **after** schema validation passes (audit no longer precedes a doomed invoke). Founder safe block includes policy, contract_source, and `attempt_seq` on assembly blocks.

## Removed / simplified

- Duplicate `prepareEmitPatchForCloudAutomation` import inside emit_patch branch (now uses `compileEmitPatchForCloudAutomation` from dispatch module).
- Live-only `create_spec` check inlined on stash flag replaced by **execution profile** evaluation (same behavior, one SSOT).

## Still unresolved

- Webhook/GitHub rows still often lack `attempt_seq` (see v13.56 handoff).
- Full “one function” end-to-end dispatch that also wraps `triggerCursorAutomation` was not extracted (would be larger churn); compile + policy boundaries are centralized.

## Chain status

COS → Harness → `invoke_external_tool` → profile/dispatch boundary → Cursor adapter → webhook/Git → recovery summaries remains the intended shape; this patch clarifies **where** policy vs assembly vs recovery live.

## Tests

- `scripts/test-v13-57-dispatch-compile-minimal-create.mjs`
- `scripts/test-v13-57-policy-rejects-create-spec-profile.mjs`
- `scripts/test-v13-57-missing-contract-source-code.mjs`
- `scripts/test-v13-57-recovery-callback-vs-github.mjs`
- Plus existing v13.56 summary / callback tests.

## Owner actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.57: execution profile + canonical emit_patch dispatch + recovery layer"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.

## 93e0

**93e0 delete now = yes**
