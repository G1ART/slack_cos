# vNext.13.71 — emit_patch completion contract & aggregate authority

## Outbound

- `triggerCursorAutomation` adds `cos_emit_patch_completion_contract_v1` to the POST body when `action === 'emit_patch'` and the existing callback contract is present (`CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED=1` + URL + secret).
- Builder: `src/founder/cursorCompletionContract.js` (no secret values in the block; path hint + signing rules + `paths_touched_expected` + Korean provider instructions).

## toolsBridge

- After cloud dispatch for `emit_patch`, if the callback completion orchestrator ran and ended in `timeout` or contract-unavailable skip states, the tool result is **degraded** (`emit_patch_callback_timeout` / `emit_patch_callback_contract_unsatisfied`), not a silent “dispatch only” success.

## smokeOps aggregate

- `authoritative_closure_source`: single tier — `manual_probe` → `provider_runtime` → `synthetic_orchestrator` → `github_secondary_recovery` → `callback_unavailable` → `callback_timeout_or_failed`.
- `emit_patch_structural_closure_complete`: provider/synthetic/github closure path **and** `run_packet_progression_patched` **and** `supervisor_wake_enqueued`.
- Provider/synthetic correlated **without** `run_packet_progression_patched`: `final_status` becomes `callback_correlated_without_progression_patch` / `synthetic_callback_correlated_without_progression_patch` (replaces bare `cursor_callback_correlated` / `synthetic_callback_correlated` in that situation).

## Tests

- `scripts/test-v13-71-completion-contract-and-aggregate.mjs` (wired in `npm test`).

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
git commit -m "v13.71: emit_patch completion contract, aggregate authority, callback timeout degraded"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
