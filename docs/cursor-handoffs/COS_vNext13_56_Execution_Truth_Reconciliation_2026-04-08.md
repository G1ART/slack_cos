# vNext.13.56 — Execution truth reconciliation without COS overconstraint

## What changed

- **Attempt lineage**: `opsSmokeAttemptSeq.js` bumps `attempt_seq` per `smoke_session_id` on each `invoke_external_tool` for `cursor` + `emit_patch` or `create_spec` (ops smoke + `cosRunId`). Recorded on pretrigger audit and `ops_smoke_phase` (cloud gate, callback contract, cursor trigger).
- **Summary**: `summarizeOpsSmokeSessionsFromFlatRows` partitions by `attempt_seq` when any row carries it. Primary = latest attempt with accepted `cursor_trigger_recorded`; else latest blocked. Machine/payload/trigger/contract lineage from **primary rows only**.
- **Truth planes**: `outbound_callback_contract_attached`, `acceptance_response_has_callback_metadata`, `inbound_callback_observed`, `repository_reflection_observed` — not inferred from each other.
- **Operator fields**: `primary_attempt_seq`, `attempt_count`, `primary_attempt_status`, `primary_payload_*`, `secondary_attempts[]`, `founder_facing_report_lines`.
- **Test reset**: `__resetOpsSmokeSessionCacheForTests` also clears attempt-seq map via `__resetOpsSmokeAttemptSeqForTests`.

## Evidence / gaps

- Rows **without** `attempt_seq` keep legacy single-bucket summary.
- Webhook/GitHub rows usually lack `attempt_seq`; inbound/reflection remain **session-scoped**.

## Tests

- `scripts/test-acceptance-response-callback-metadata-keys.mjs`
- `scripts/test-v13-56-execution-truth-reconciliation.mjs`

## Next patch

- Optional `attempt_seq` (or time correlation) on `cos_cursor_webhook_ingress_safe` / GitHub evidence for attempt-scoped inbound truth.

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
git commit -m "vNext.13.56: attempt-aware ops smoke truth + test reset + handoff"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.

## 93e0

**93e0 delete now = yes** — 본 작업에 대한 추가 의존성 없음.
