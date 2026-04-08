# vNext.13.53 — Trigger callback contract proof + live-only create_spec elimination + summary decomposition

## Outbound callback contract (ops-safe)

- **Before POST**: `recordOpsSmokeTriggerCallbackContract` writes `ops_smoke_phase` / `trigger_outbound_callback_contract` with `describeTriggerCallbackContractForOps` (field names, path-only URL, `callback_secret_present` bool, `selected_trigger_endpoint_family`, hints). No raw outbound body, no full URLs, no secret values in events.
- **HTTP body** (when `CURSOR_AUTOMATION_CALLBACK_CONTRACT_ENABLED=1` and URL + `CURSOR_WEBHOOK_SECRET` resolve): `mergeCallbackContractIntoTriggerBody` adds configurable URL/secret/policy/secondary-effects fields plus `cos_completion_policy_note` (override via `CURSOR_AUTOMATION_COMPLETION_POLICY_NOTE_FIELD`) stating COS webhook is primary completion; git/branch/PR are secondary.
- **After response**: `cursor_trigger_recorded` detail includes compact `callback_contract` + trigger safe subset; `accepted_response_top_level_keys` mirrors `response_top_level_keys` on trigger detail.

## Callback absence classification

- Pending row carries `callback_contract_present` (top-level on `trigger_accepted_callback_pending` payload).
- Timeout + no verified ingress: `cursor_callback_absent_despite_callback_contract` vs `cursor_callback_absent_without_callback_contract`; legacy unknown → `cursor_callback_absent_within_timeout`.
- Immediate when accepted id, no canonical run id, no contract: `trigger_sent_without_callback_contract`.

## Live-only / no-fallback create_spec

- `recordCosPretriggerAudit` returns early for `invoke_external_tool` cursor+create_spec on live-only threads (dynamic import to avoid cycles); toolsBridge no longer records blocked pretrigger for that guard.
- `harnessBridge.specializePacket`: narrow `live_patch` (live_only+no_fallback+path+content) coerces mistaken `create_spec` default to `emit_patch`.

## Summary

- `summarizeOpsSmokeSessionsFromFlatRows`: `primary_selected_action` / `primary_trigger_state` / `secondary_blocked_actions[]`, `extractLatestCallbackContractEvidenceFromRows`; emit_patch accepted trigger clears top-level `blocked_reason`/`machine_hint` when secondary blocked create_spec exists.

## Tests

- `test-trigger-outbound-records-callback-contract-safe-subset.mjs`
- `test-accepted-run-distinguishes-no-callback-with-vs-without-callback-contract.mjs`
- `test-live-only-does-not-produce-create-spec-candidate-anywhere.mjs`
- `test-summary-prefers-primary-accepted-emit-patch-over-secondary-create-spec-block.mjs`
- `test-github-remains-secondary-evidence-only.mjs`

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
git commit -m "vNext.13.53: callback contract ops proof, absence split, live-only create_spec audit drop, summary primary/secondary"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.

## 93e0

**93e0 delete now = yes** — 본 작업에 대한 추가 의존성 없음.
