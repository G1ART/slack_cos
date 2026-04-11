# vNext.13.77 — Receive office: single intake commit path

## What changed

1. **`src/founder/cursorReceiveCommit.js`** (new)
   - **`commitReceivedCursorCallbackToRunPacket`**: authoritative 입고 처리 단일 함수.
   - `findExternalCorrelation('cursor', 'accepted_external_id', …)` 로만 상관 행 확정.
   - 콜백 `thread_key` / `packet_id` 가 상관·런·`cursor_dispatch_ledger.target_packet_id` 와 **전부 동일**할 때만 패킷/런 패치.
   - 터미널 성공: `packet_state_map` completed, 앵커 `provider_structural_closure_*`, `cos_run_events` 에 **`cursor_receive_intake_committed`** 1회(멱등 시 이벤트 추가 없음).
   - 반환: `{ committed, reason, run_id, packet_id, idempotent?, closure_anchor_written? }`.

2. **`src/founder/canonicalExternalEvent.js`**
   - `accepted_external_id_hint` 가 있고 메모리에 **accepted_external_id 상관 행**이 있으면: **intake만** 호출(legacy `tryApply`/emit_patch 분기 스킵).
   - 상관 행이 없으면 기존 v13.76 legacy 경로 유지(테스트·구형 콜백).
   - intake 사용 시 `cursor_callback_correlated_but_closure_not_applied` 는 실패 시에만; 성공 시 중복 `cursor_authoritative_closure_applied` 생략(intake 이벤트가 정본).

3. **`src/founder/smokeOps.js`**
   - `idempotent_closure_repeat` 일 때 `run_packet_progression_patched` ops phase 중복 기록 방지(이미 반영된 경우 유지).

4. **Dispatch 바인딩** — 변경 없음. `bindCursorEmitPatchDispatchLedgerBeforeTrigger` 가 `accepted_external_id` 상관 + `cursor_dispatch_ledger` + 앵커를 한 세트로 유지.

## Tests

- `scripts/test-v13-77-receive-intake-commit.mjs` — 성공/패킷 불일치/중복/ledger 없음 직접 호출/aggregate 회귀.
- `package.json` `npm test` 체인에 포함.

## SQL

없음.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.77: receive office single intake commit path"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
