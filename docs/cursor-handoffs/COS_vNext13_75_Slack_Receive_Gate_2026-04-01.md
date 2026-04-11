# vNext.13.75 — Slack receive gate (dispatch ledger before send, callback commit, terminal-only founder surface)

## What changed

1. **`toolsBridge.js`**
   - Cursor `emit_patch` cloud lane: **`bindCursorEmitPatchDispatchLedgerBeforeTrigger`** runs **before** `triggerCursorAutomation`. Bind failure returns blocked **without** HTTP trigger; ledger rows use `suppress_from_founder_*` + internal bind code only.
   - After successful trigger, **`recordCursorCloudCorrelation`** receives explicit **`runId: cosRunId`** so correlation rows target the dispatch run (not thread-active latest).
   - Orchestrator **timeout / contract-missing / contract-unavailable** paths no longer flip founder-visible **`degraded`** on the dispatch tool_result; status stays **`running`** with dispatch-accepted summary while internal `degraded_from` / `error_code` remain for ops.
   - Cloud `emit_patch` **degraded** ledger rows: **`suppress_from_founder_review_queue`** in addition to execution-summary suppress.

2. **`providerEventCorrelator.js`**
   - **`recordCursorCloudCorrelation`**: merges new anchor fields into **`cursor_callback_anchor`** so pre-dispatch bind metadata is not wiped.

3. **`executionLedger.js`**
   - **`filterLiveOnlyEmitPatchTechnicalLeakFromExecutionSummaryLines`** — strips internal ops tokens from founder-facing summary lines (English tokens only; no i18n).
   - **`readExecutionSummaryForRun`**: optional **`suppressLiveOnlyEmitPatchFounderTechnicalLeak`** drops rows with **`suppress_from_founder_execution_summary`** then applies the line filter.
   - **`readReviewQueueForRun`**: excludes **`suppress_from_founder_review_queue`** tool_results.

4. **`runSupervisor.js`**
   - Passes **`suppressLiveOnlyEmitPatchFounderTechnicalLeak`** for cloud emit_patch starter runs when reading execution summaries.
   - **Blocked**: if cloud emit_patch starter and review queue yields **no** founder-facing need line → **no** blocked milestone (silent).
   - **Review-required** lines: same technical leak filter when starter was cloud emit_patch.

5. **`cursorCallbackCompletionOrchestrator.js`**
   - Default wait when env timeout unset: **360s (6 minutes)** (already aligned with Cursor Cloud latency).

6. **`smokeOps.js`** (prior / this train)
   - Provider callback closure wins over GitHub secondary recovery in aggregate when both appear.

7. **`canonicalExternalEvent.js`** (prior / this train)
   - Supervisor wake when **`closure.applied || closure.progression_applied`**.

## Tests

- `scripts/test-v13-75-receive-gate-functional.mjs` — bind fail vs OK, **`accepted_external_id`** webhook → packet **completed**, 6m default, leak filters, bind-before-trigger source order, run events not `_orphan`.

## SQL

없음.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "v13.75: Slack receive gate (ledger before dispatch, silent callback window, founder leak suppress)"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

## Smoke (Slack live, one line)

동일 live_23 계열 지시로 Cursor cloud `emit_patch` 한 번 던진 뒤, 완료는 COS/슈퍼바이저 터미널 마일스톤만 확인한다 (내부 timeout·policy 문자열이 슬랙에 보이면 실패).
