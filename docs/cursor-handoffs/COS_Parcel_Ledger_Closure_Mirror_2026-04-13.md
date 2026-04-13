# 택배 — ledger 클로저 미러 (2026-04-13)

## 문제

클라우드 `emit_patch` 디스패치 수락 직후 스레드 ledger의 `tool_result`는 `running`으로 **append-only** 로 남고, 웹훅 authoritative closure는 `cos_run_events` / ops_smoke 에만 쌓여 COS가 `[최근 실행 아티팩트]`만 보면 “아직 running” 으로 오해할 수 있음.

## 조치

`recordOpsSmokeAfterExternalMatch` 에서 `emit_patch_authoritative_path` 이고 `authoritative_closure_applied` 이며 idempotent repeat 가 아닐 때, `appendCloudEmitPatchClosureLedgerMirror(threadKey)` 로 **`completed` / `live_completed` `tool_result` 한 줄**을 추가한다.

- `src/founder/executionLedger.js` — `appendCloudEmitPatchClosureLedgerMirror`
- `src/founder/smokeOps.js` — closure phase 직후 호출
- `scripts/test-parcel-closure-ledger-mirror.mjs`

## Owner actions

- `npm run verify:parcel-post-office`
