# vNext.13.3 — Release lock / founder contract hardening (2026-04-01)

## 요약

- **Founder entry**: `src/founder/founderRouteInvariant.js` SSOT; `app.js`·`runInboundAiRouter.js` 이중 조건 제거.
- **Proposal**: `proposal_execution_contract` + `proposal_contract_trace`; 모호 진행·짧은 PR/배포·무스코프 mutation 억제; 활성 런 + 승인 캐리 문구는 외부 태스크 유지.
- **Completion**: `founderTruthClosureWording.js`; 결정론 유틸 “끝났나?”; `founderRequestPipeline` status 문구 정렬.
- **Advisory**: `COS_GOVERNANCE_ADVISORY=1` + 금지 서피스; 단위 테스트 표면만 허용.
- **문서**: `docs/RELEASE_LOCK.md`, `docs/HANDOFF.md`, `docs/founder-surface-contract.md`.

## 회귀 스크립트

- `scripts/test-vnext13-3-founder-single-entry-invariant.mjs`
- `scripts/test-vnext13-3-founder-ambiguous-intent.mjs` (fixture 20)
- `scripts/test-vnext13-3-founder-advisory-budget.mjs`
- `scripts/test-vnext13-3-founder-status-closure-contract.mjs`

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
git commit -m "vNext.13.3 release lock: founder invariant, proposal contract, truth closure, advisory budget"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
