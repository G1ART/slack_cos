# COS vNext.13.2 revised — Founder–COS freedom + harness governance finalization

**Date:** 2026-04-03

## Principles

- **Founder–COS:** natural dialogue first; no keyword/classifier/router on the founder surface. Packets are optional tools, not mandatory schemas.
- **COS:** broad autonomy to choose combinations; code must not fix COS reasoning order.
- **Harness + tools:** strict charters, review pairs, overlap/tension, default-deny external mutation, truth-first audit, **release_governor** as final kill point.
- **Governance advisory:** `cosGovernanceAdvisory.js` / `toolExpansionAdvisory.js` — optional appendix for re-org, tooling, connectors (not founder routing).

## Code map

| Area | Files |
|------|--------|
| Launch | `founderLaunchGate.js`, `founderLaunchFormatter.js`, `founderLaunchApprovalPacket.js`, `founderLaunchAdvisory.js` (optional hook) |
| Proposal | `founderProposalKernel.js`, `founderContextSynthesizer.js` (`north_star_hint`, `success_condition_hint`) |
| Founder kernel | `founderDirectKernel.js` — appends governance advisory when heuristic matches |
| Approval | `approvalGate.js` — `EXTERNAL_MUTATION_DENY_STATES`, explicit `authorized` only |
| Harness | `harnessAgentCharters.js` (18 agents), `harnessReviewMatrix.js` (`HARNESS_REVIEW_PAIRS`), `harnessOverlapMap.js`, `harnessOrgModel.js`, `harnessEscalationPolicy.js` |
| Skills | `harnessSkillsRegistry.js`, `harnessSkillBindings.js` |
| Advisory | `cosGovernanceAdvisory.js`, `toolExpansionAdvisory.js` |

## Tests (`npm test`)

`test-vnext13-2-launch-gate-purification`, `default-deny-approval`, `proposal-softening`, `cos-governance-advisory`, `harness-charters`, `harness-review-matrix`, `skills-registry`, `slack-e2e-dress-rehearsal`.

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
git commit -m "vNext.13.2 revised: protect COS autonomy and finalize harness governance"
git pull --rebase origin "$(git branch --show-current)"
git push -u origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
