# Harness review matrix (vNext.13.2)

## Constructive tension

하네스는 협업이 기본이지만, 중요한 지점에서는 **의도적 견제**가 있어야 한다. 소스: `src/orchestration/harnessReviewMatrix.js`.

- `HARNESS_REVIEW_PAIRS` — 최소 검토 쌍 (예: `research_agent` ↔ `strategy_writer`, `deploy_ops` ↔ `release_governor`).
- `HARNESS_REVIEW_MATRIX` — 에이전트별 `reviews` / `challenged_by` 요약.

## 회귀

`npm test` → `test-vnext13-2-harness-review-matrix.mjs`
