# vNext.13.59a — Per-attempt callback contract proof + primary aggregate + recovery diagnostics + durable envelope

## A. Accepted-attempt callback proof (`cursor_trigger_recorded`)

- `recordOpsSmokeCursorTrigger` (when `trigger_ok`) adds safe flat fields on the same `ops_smoke_phase` row: `outbound_callback_contract_present`, `outbound_callback_contract_reason` (from `deriveOutboundCallbackContractReason` in `cursorCloudAdapter.js`), `outbound_callback_url_path_only`, `outbound_callback_field_names`, `accepted_attempt_accepted_external_id`, `accepted_attempt_response_top_level_keys`, plus existing nested `callback_contract`.
- `extractLatestAcceptedAttemptCallbackContractFromRows(primaryRows)` reads the latest such row; `summarizeOpsSmokeSessionsFromFlatRows` prefers it over `trigger_outbound_callback_contract` only (`extractLatestCallbackContractEvidenceFromRows`).

## B. Session aggregate (no cross-attempt pollution)

- `filterRowsForSessionAggregateTopline(rows, primarySeq)` keeps primary attempt `ops_smoke_phase` rows plus cross-cutting `cos_cursor_webhook_ingress_safe`, `cos_github_fallback_evidence`, `result_recovery_github_secondary`.
- `aggregateSmokeSessionProgress` runs on filtered rows when `useLineage && primarySeq > 0`, so e.g. `trigger_sent_without_callback_contract` from attempt N−1 does not appear in `phases_seen` for the primary topline.

## C. GitHub push recovery diagnostics

- `tryGithubPushSecondaryRecovery` returns `diagnostics` on failed push recovery: counts, path samples, `recovery_head_sha_prefix`, `recovery_no_match_reason` (`no_pending_envelope` | `repo_mismatch` | `no_path_overlap` | `outside_time_window` | `candidate_not_pending_callback` | `missing_paths_touched` | `missing_requested_paths`), `recovery_anchor_run_id` (first pending envelope run for evidence attachment).
- `externalEventGateway` passes `recovery_diagnostics` into `recordOpsSmokeGithubFallbackEvidence` (sanitized in `smokeOps.sanitizeRecoveryDiagnosticsForOps`).

## D. Durable recovery envelope

- `cos_runs.recovery_envelope_pending` (migration `20260409180000_cos_runs_recovery_envelope_pending.sql`); `appRunToDbRow` / `dbRowToAppRun` / Supabase patch paths updated.
- `registerRecoveryEnvelopeFromEmitPatchAccept` / `markRecoveryEnvelopePrimaryCallbackObserved` / successful recovery call `syncRecoveryEnvelopeToRunRow`.
- `listRunsWithPendingRecoveryEnvelope` + merged memory/durable list in `resultRecoveryBridge` for push matching after restart.

## E. Founder report

- Still driven by primary attempt (`formatOpsSmokeFounderFacingLines`); `outbound_callback_contract_attached` now follows accepted-attempt proof when present.

## Tests

- `scripts/test-v13-59a-*.mjs` (reason enum, aggregate filter, extractor, diagnostics, durable-after-memory-reset).

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
git commit -m "v13.59a: per-attempt callback proof, primary aggregate, recovery diagnostics, durable envelope"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

### SQL (배포 시)

Supabase에 마이그레이션 적용:

```bash
# 예: supabase db push 또는 프로젝트 절차에 맞게
# supabase/migrations/20260409180000_cos_runs_recovery_envelope_pending.sql
```
