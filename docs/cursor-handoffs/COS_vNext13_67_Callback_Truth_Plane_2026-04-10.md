# vNext.13.67 — Callback truth plane & narrow emit hint (2026-04-10)

## Summary

- **Ingress**: `externalEventGateway.handleCursorWebhookIngress` records `callback_source_kind`, `callback_verification_kind`, `callback_match_basis` on every `cos_cursor_webhook_ingress_safe` path; `processCanonicalExternalEvent` meta carries the same for `recordOpsSmokeAfterExternalMatch`.
- **Truth util**: `src/founder/cursorCallbackTruth.js` — `deriveCursorCallbackSourceKindFromHeaders`, `mapMatchedByToCallbackMatchBasis`.
- **Ops smoke**: `smokeOps.js` maps ingress `matched` → `cursor_provider_callback_correlated` vs `cursor_manual_probe_callback_correlated`; `result_recovery_github_secondary` → `github_secondary_recovery_matched`; manual correlation → phase `manual_probe_external_callback_matched` (not `external_callback_matched`).
- **Aggregate**: Strict break pointer for `external_run_id_extracted` (phase row only); relaxed recompute after provider/GitHub closure; `trigger_accepted_external_id_present` without `external_run_id_extracted` + provider callback → `final_status=cursor_callback_correlated` (stale pending fix); GitHub secondary uses parallel rules; full pipeline still `full_pipeline_observed`.
- **Summary**: `primary_run_id` + `related_run_ids[]` (no `run_id` soup); `inbound_callback_observed` = provider-plane matched ingress only; founder lines split provider vs manual probe.
- **Emit patch**: `prepareEmitPatchForCloudAutomation` adds `cos_execution_scope_hint` for narrow single-file `live_only`+`no_fallback` compilation.

## Tests

- `scripts/test-v13-67-callback-truth-plane-and-emit-hint.mjs` (in `npm test` chain).
- `scripts/test-callback-evidence-capture-safe-subset-only.mjs` allowlist extended for callback truth keys on `buildSafeCursorCallbackSmokeDetail`.

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
git commit -m "v13.67: callback truth plane, smoke aggregate, narrow emit hint"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
