# vNext.13.79 — Delete fake policy/report paths; single receive-office commit

## Runtime

- Cursor signed callback (`provider_runtime`): terminal packet/run updates only via `commitReceivedCursorCallbackToRunPacket` in `src/founder/cursorReceiveCommit.js` (exact `accepted_external_id` row + `thread_key` / `packet_id` / `cursor_dispatch_ledger.target_packet_id` alignment).
- `processCanonicalExternalEvent` does not call legacy `await applyExternalCursorPacketProgressForRun` or `tryApplyAuthoritativeCursorEmitPatchClosureForRun`.
- Founder Slack same-turn body: `out.starter_ack` === 모델 `text` (`registerFounderHandlers.js` → `sendFounderResponse`). (2026-04-12 이전 문구의 “접수 한 줄만”은 폐기.) `toolsBridge.js` live_only emit_patch 경로에 `create_spec_disallowed_in_live_only_mode` 정책 분기 없음.

## Tests

- `scripts/test-v13-79-delete-fake-paths.mjs`: grep/assert forbidden strings; `processCanonicalExternalEvent` slice must not `await applyExternalCursorPacketProgressForRun(`.
- Callback fixtures that previously completed on `external_run_id` alone now call `bindCursorEmitPatchDispatchLedgerBeforeTrigger` and send `request_id` + `thread_key` + `packet_id` (+ optional `runId` for cloud id check).

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
git commit -m "vNext.13.79: intake-only callback tests + v13-79 grep harness"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
