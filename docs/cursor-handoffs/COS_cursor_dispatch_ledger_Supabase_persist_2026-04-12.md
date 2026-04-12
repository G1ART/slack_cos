# COS — `cursor_dispatch_ledger` Supabase 영속 (2026-04-12)

## 문제

`bindCursorEmitPatchDispatchLedgerBeforeTrigger`는 `patchRunById`로 `cursor_dispatch_ledger`를 쓰지만, **Supabase** 경로에서 `runStoreSupabase.appRunToDbRow` / `supabasePatchRunById`가 해당 필드를 **드롭**해 DB에 반영되지 않았다. 그 결과 서명 콜백 상관은 되어도 `commitReceivedCursorCallbackToRunPacket`이 `dispatch_ledger_target_missing`으로 멈출 수 있음.

## 조치

- 마이그레이션 `20260412120000_cos_runs_cursor_dispatch_ledger.sql`: `cos_runs.cursor_dispatch_ledger jsonb`.
- `src/founder/runStoreSupabase.js`: `appRunToDbRow`, `dbRowToAppRun`, `supabasePatchLatestRun`, `supabasePatchRunById`에 컬럼 반영.

## Owner actions

- Supabase에 마이그레이션 적용 후 프로덕 재배포.
- 검증: `cos_run_events`에 `cursor_dispatch_ledger_bound`가 있는 런에 대해 `select cursor_dispatch_ledger from cos_runs where id = …`가 비어 있지 않은지 확인.
