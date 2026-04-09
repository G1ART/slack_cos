# vNext.13.58 — Result recovery bridge (Cursor accept → envelope → GitHub push)

## Scope

- **Recovery envelope** (in-memory, `recoveryEnvelopeStore.js`): registered when Cursor cloud **`emit_patch`** dispatch is accepted (`toolsBridge.js`), keyed by durable `run_id`. Holds repo (`GITHUB_REPOSITORY`), normalized `requested_paths`, short content SHA prefixes, optional `smoke_session_id`, packet id, accepted external id.
- **Primary path unchanged**: Cursor webhook → `processCanonicalExternalEvent` → packet progress. On matched Cursor ingress, **`markRecoveryEnvelopePrimaryCallbackObserved`** sets envelope to `primary_callback_observed` so push recovery no longer applies.
- **Secondary path**: GitHub **`push`** normalized in `providerEventNormalizers.js` with `paths_touched`. If canonical correlation misses (`processCanonicalExternalEvent` returns `matched: false`), **`tryGithubPushSecondaryRecovery`** (`resultRecoveryBridge.js`) matches **pending** envelopes (same repo, path intersection, time window, conservative outcome `repository_reflection_path_match_only`).
- **Run effects**: `appendCosRunEventForRun(..., 'result_recovery_github_secondary', ...)`, `patchRunById` → `result_recovery_bridge_last`, packet → **`review_required`** (not primary completion).
- **Ingress HTTP**: `handleGithubWebhookIngress` may return `matched: true`, `secondary_recovery: true` when secondary attach succeeds.
- **Ops summary**: `github_secondary_recovery_observed` / `github_secondary_recovery_outcome` + founder line **separate** from `repository_reflection_observed` (GitHub fallback evidence). Event type included in smoke summary allowlists (`runCosEvents.js`, `runStoreSupabase.js`).

## Tests

- `scripts/test-v13-58-*.mjs` (push normalize, extract paths, e2e ingress, smoke summary split, `cursorResultRecovery` helper).

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
git commit -m "v13.58: result recovery bridge (envelope + GitHub push secondary match)"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
