# COS governance advisory

Optional natural-language appendix for org/tooling suggestions. Source: `cosGovernanceAdvisory.js`, `toolExpansionAdvisory.js`.

vNext.13.3: **기본 꺼짐** — `COS_GOVERNANCE_ADVISORY=1`일 때만 후보 생성. 제안·승인 등 표준 창업자 서피스에서는 부록 금지; 프로덕션 제안 경로에서는 호출돼도 항상 null. 회귀는 `GOVERNANCE_ADVISORY_UNIT_TEST_SURFACE`로만 양성 케이스 검증.

Wired from `founderDirectKernel.js` when (이론상) 허용 서피스 + env + 휴리스틱 일치.

Test: `test-vnext13-2-cos-governance-advisory.mjs`, `test-vnext13-3-founder-advisory-budget.mjs`, E2E scenario 6 in `test-vnext13-2-slack-e2e-dress-rehearsal.mjs`.
