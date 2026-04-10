# vNext.13.69 — Callback completion orchestrator (2026-04-10)

## Summary

- **`cursorCallbackCompletionOrchestrator.js`**: `awaitOrForceCallbackCompletion` — allowlisted POST to `resolveCursorAutomationCallbackUrl`, natural wait, then HMAC-signed synthetic body with `x-cos-callback-source: synthetic_orchestrator`, bounded retries/backoff, dedupe key on successful synthetic close. Closure detection uses `latestCursorClosureKind` over `cos_cursor_webhook_ingress_safe` (matched) and `external_completed` / `external_failed` rows with `cos_callback_closure_source` (works without `COS_OPS_SMOKE_ENABLED`).
- **`cursorSyntheticCallback.js`**: `buildSyntheticCursorCompletionCallback`, `signCursorWebhookRawBody` — paths from `listNormalizedEmitPatchPathsForAnchor` (same as fingerprint).
- **`canonicalExternalEvent.js`**: append `cos_callback_closure_source` from ingress `callback_source_kind` onto external event payload.
- **`cursorCallbackTruth.js`**: `synthetic_orchestrator` source kind.
- **`toolsBridge.js`**: after Cursor cloud accept + recovery envelope, runs orchestrator when `shouldRunCallbackCompletionOrchestrator` (default: narrow `emit_patch` only; `CURSOR_AUTOMATION_FORCE_CALLBACK_ON_PENDING=0|1` overrides).
- **`smokeOps.js`**: ingress phases split (`cursor_provider_*`, `cursor_synthetic_*`, `cursor_unknown_source_*`, manual); `synthetic_external_callback_matched` ops phase; aggregate `synOnly` branch; `callback_completion_state`; founder lines + extractors for synthetic/unknown.
- **`livePatchPayload.js`**: `handoff_scan_policy: target_path_and_parent_only` on narrow `cos_execution_scope_hint`.
- **Env**: `.env.example` — `CURSOR_AUTOMATION_FORCE_CALLBACK_*` (timeout, max attempts, on/off).

## Tests

- `scripts/test-v13-69-callback-completion-orchestrator.mjs` (in `npm test`).

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
git commit -m "v13.69: callback completion orchestrator and closure provenance"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

브랜치 이름은 로컬 워크플로에 맞게 사용하면 됩니다. 커밋 SHA는 `git rev-parse HEAD`로 확인.

이번 패치에 SQL 없음.
