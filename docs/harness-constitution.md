# Harness constitution (vNext.13.2 revised)

COS(플래너)는 **승인된 작업·명확화된 필요**를 기준으로 에이전트·스킬 조합을 고른다. 하네스는 **헌법 필드**로만 규율된다 (COS 사고 순서는 고정하지 않음).

## 소스 파일

- `harnessAgentCharters.js` — **18** 에이전트: `agent_id`, `mission`, `primary_scope`, `non_goals`, `allowed_providers`, `forbidden_actions`, `expected_outputs`, `success_criteria`, `escalation_triggers`, `required_review_from`, `overlap_peers`, `truth_source`, `can_request_reorg`, `can_request_new_tooling`.
- `harnessOverlapMap.js` — 오버랩·긴장 쌍.
- `harnessReviewMatrix.js` — `HARNESS_REVIEW_PAIRS` + 매트릭스.
- `harnessOrgModel.js` — `HARNESS_ORG_LANES` (인지/인사이트/재무/캐피탈 커뮤니케이션/프로덕트 엔지니어링/퀄리티·릴리스).
- `harnessEscalationPolicy.js` — 창업자 에스컬레이션·승인 문구 상수.

## 핵심 규칙 (요약)

- `fullstack_swe`: deploy / db_live_apply 금지.  
- `db_ops`: app 코드 변경 금지.  
- `deploy_ops`: 최종 릴리스 게이트 **단독 승인** 금지; `release_governor`가 kill point.  
- `qa_agent`: 빌드 측 self-report 단독 신뢰 금지.  
- `audit_reconciliation_agent`: tool truth 우선.  
- `release_governor`: 프로덕션·고위험 릴리스 최종 단계.

## 회귀

`npm test` → `test-vnext13-2-harness-charters.mjs`
