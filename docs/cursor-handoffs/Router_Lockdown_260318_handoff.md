# Handoff: Top-Level Router Lockdown + Query-Only Route Fix

> **2026-03-23 갱신**: 아래 §3 의 **7–8번(Council 기본·single 폴백)** 은 구버전이다.  
> **현행 인바운드 순서·dialog 경로**는 `COS_Inbound_Routing_Current_260323.md` 를 **정본**으로 본다.  
> 본 문서의 **finalizeSlackResponse·Council 누수 휴리스틱·planner/query 락** 설명은 여전히 유효하다.  
> **구현 위치 (후속 모듈화)**: help·query·`routing_sync_*`·컨텍스트·planner 하드 락·`runInboundStructuredCommands` 진입은 **`src/features/runInboundCommandRouter.js`** (`app.js` `handleUserText` 가 호출). AI 꼬리는 **`runInboundAiRouter.js`**.

**Patch name**: Top-Level Router Lockdown + Query-Only Route Fix  
**Date**: 2026-03-21

## 1. Changed files

- `app.js` — 진입 `handleUserText` → `runInboundCommandRouter` + `runInboundAiRouter`
- `src/features/runPlannerHardLockedBranch.js` — 플래너 하드 락 분기; `finalizeSlackResponse` / `logRouterEvent` (플래너 경로)
- `src/features/runInboundCommandRouter.js` — (추가) pre-AI 상단 파이프라인
- `src/features/topLevelRouter.js` — NEW: `logRouterEvent`, `finalizeSlackResponse`, `looksLikeCouncilSynthesisBody`
- `src/features/plannerRoute.js` — `analyzePlannerResponderLock()`
- `src/features/queryOnlyRoute.js` — `matchQueryCommandPrefix()` export
- `scripts/test-router-lockdown.mjs` — NEW acceptance-style tests
- `package.json` — `npm test` runs both test scripts

## 2. Slack entrypoint

- `src/slack/registerHandlers.js` -> `handleUserText` in `app.js`

## 3. Responder order (invariants)

1. Normalize input (Slack + plan-mgmt line)
2. `router_entered` / `router_normalized`
3. **help** — `도움말`
4. **query** — `matchQueryCommandPrefix` + `handleQueryOnlyCommands` (Council blocked, finalize)
5. **planner** — `analyzePlannerResponderLock` is `hit` or `miss` -> `runPlannerHardLockedBranch` (no Council, no inferWorkCandidate)
6. Existing mutation / plan-mgmt / dispatch chain (unchanged)
7. **council** — only if nothing matched; firewall re-runs `analyzePlannerResponderLock` for hit/miss recovery
8. **single** — `runLegacySingleFlow` + finalize when Council not used or Council error

## 4. Lock locations

- Planner: `runPlannerHardLockedBranch()` — all returns via `finalizeSlackResponse({ responder: 'planner', council_blocked: true })`
- Query: `runInboundCommandRouter` → `tryFinalizeSlackQueryRoute` — `finalizeSlackResponse({ responder: 'query', council_blocked: true })`
- Council: `councilFin()` — only place for `inferWorkCandidate` footer
- Safety: `finalizeSlackResponse` replaces body if non-council text looks like Council synthesis (`final_response_council_leak_detected`)

## 5. inferWorkCandidate

- Only inside `useCouncil` block. `footer_blocked` log when suppressed.

## 6. TEST A–H

Run `npm test`. Script `scripts/test-router-lockdown.mjs` covers A (extract+mock contract), B, C–H (query not_found/usage), NL lock, poison sanitization. Full TEST A with real PLN needs storage + LLM (manual/staging).

## 7. Risks

- Mid-chain mutations do not yet call `finalizeSlackResponse` (no Council leak, less observability).
- Council signature heuristic tied to current Korean `synthesizeCouncil` headers.

## 8. Next patch

- Wire `finalizeSlackResponse` through mutation/dispatch/approval branches with consistent `responder` metadata.

---

### Next patch recommendation

- Unify all command returns with `finalizeSlackResponse` and a small responder enum for ops visibility.

### Owner actions (copy-paste ready)

**1. SQL to run**

없음

**2. Local run commands**

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
npm start
```

**3. Git commands**

```bash
cd /Users/hyunminkim/g1-cos-slack
git add app.js src/features/topLevelRouter.js src/features/plannerRoute.js src/features/queryOnlyRoute.js scripts/test-router-lockdown.mjs package.json docs/cursor-handoffs/Router_Lockdown_260318_handoff.md docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md
git status
git commit -m "feat(router): top-level lockdown for planner/query vs Council"
```

**4. Hosted deploy actions**

확인 필요
