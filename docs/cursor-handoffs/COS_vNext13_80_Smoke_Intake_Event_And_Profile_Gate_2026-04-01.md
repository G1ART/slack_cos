# vNext.13.80 — Smoke intake event in summaries + live-only create_spec adapter gate

## Summary

- **Supabase / flat-row smoke summaries**: `cursor_receive_intake_committed` is included in summary event type allowlists and mapped in `smokeSummaryPhaseFromRow` to `run_packet_progression_patched`, so ops tooling sees progression when receive-office commit succeeded even if `ops_smoke_phase` rows were dropped or merged differently.
- **Session bucketing**: Intake events written to `cos_run_events` do not carry `smoke_session_id` in the JSON payload. `summarizeOpsSmokeSessionsFromFlatRows` therefore **re-attributes** those rows to any smoke session that already lists the same COS `run_id` (`target_run_id` or row `run_id`), so `summarize-ops-smoke-sessions.mjs` is not stuck on `callback_correlated_without_progression_patch` when the DB shows `cursor_receive_intake_committed`.
- **Attempt lineage + aggregate**: When `attempt_seq` is present on ops rows, `filterRowsForSessionAggregateTopline` previously dropped intake rows (no `attempt_seq`). `aggregateSmokeSessionProgress` never saw `run_packet_progression_patched`. Intake is now included in that filter alongside ingress/GitHub cross-attempt rows (vNext.13.80b).
- **Cross-cutting audit**: See `COS_Ops_Smoke_Callback_Pipeline_Audit_2026-04-01.md` for a consolidated failure-mode checklist and SSOT notes (event-type lists, merge limits, policy vs summary).
- **Completion contract (KO)**: `cos_emit_patch_completion_contract_v1.provider_instructions_ko` now states explicitly that `recommended_callback_context.packet_id` must match dispatch ledger exactly (manual fixed IDs fail intake).
- **Adapter**: `invokeExternalTool` blocks `cursor:create_spec` on `live_only_emit_patch` threads via `evaluateCursorActionAgainstProfile` (no legacy `create_spec_disallowed_in_live_only_mode` string).

## Owner actions

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)

사용자 로컬에서 커밋·푸시.

## SQL

이번 패치에 SQL 없음.
