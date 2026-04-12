# vNext.13.80 — Smoke intake event in summaries + live-only create_spec adapter gate

## Summary

- **Supabase / flat-row smoke summaries**: `cursor_receive_intake_committed` is included in summary event type allowlists and mapped in `smokeSummaryPhaseFromRow` to `run_packet_progression_patched`, so ops tooling sees progression when receive-office commit succeeded even if `ops_smoke_phase` rows were dropped or merged differently.
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
