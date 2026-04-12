# vNext.13.81 — Callback context correlation fallback + ops summary run_id

## Runtime

- **`commitReceivedCursorCallbackToRunPacket`** (`src/founder/cursorReceiveCommit.js`): If the signed webhook omits `thread_key` / `packet_id` but `accepted_external_id` resolves a correlation row, effective callback context falls back to that row’s `thread_key` and `packet_id`. Explicit non-empty values that disagree with the row still fail (`callback_*_mismatch_*`). Ledger `target_packet_id` and run `thread_key` checks unchanged.

## Ops summary

- **`summarizeOpsSmokeSessionsFromFlatRows`** (`src/founder/smokeOps.js`): When both `_orphan` (from `cos_ops_smoke_events` with null `run_id`) and a durable UUID appear for the same `smoke_session_id`, **primary_run_id** prefers the non-orphan id.

## Tests

- `scripts/test-v13-77-receive-intake-commit.mjs`: minimal body ingress (1b), flat-row primary_run_id preference (6).

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.81: correlation fallback for empty callback packet/thread; ops summary run_id"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```
