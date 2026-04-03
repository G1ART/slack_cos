# COS vNext.13.2 — Launch gate purification, harness constitution, E2E dress rehearsal

**Date:** 2026-04-03

## Summary

- Launch gate: no `evaluatePolicy` or `renderFounderSurface`; founder-facing text from `founderLaunchFormatter.js` and `founderLaunchApprovalPacket.js`.
- Harness: 13 agent charters, overlap map, review matrix, escalation constants, skills registry under `src/orchestration/`.
- Proposal kernel: context-first, regex secondary, stronger open questions, business-ops COS_ONLY default.
- Approval packet: structured “checkout” surface via `approvalPacketFormatter.js`; `holdExternalExecutionForRun` for hold.
- Tests: six `test-vnext13-2-*.mjs` scripts plus existing vNext.13.1 regressions.

## Key files

- `src/core/founderLaunchGate.js`
- `src/founder/founderLaunchFormatter.js`
- `src/founder/founderLaunchApprovalPacket.js`
- `src/core/founderLaunchIntent.js` (phrase `실행으로 넘어가`)
- `src/orchestration/harnessAgentCharters.js`, `harnessOverlapMap.js`, `harnessReviewMatrix.js`, `harnessEscalationPolicy.js`, `harnessSkillsRegistry.js`
- `scripts/test-vnext13-2-*.mjs`

## E2E dress rehearsal

See `scripts/test-vnext13-2-slack-e2e-dress-rehearsal.mjs` for six founder-facing scenarios (IR deck, competitor memo, budget, external approval, hold, launch).

## Owner actions

### Local verify

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git sync

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.2: launch gate purification, harness constitution, E2E dress rehearsal"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

No SQL in this patch.
