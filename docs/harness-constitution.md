# Harness constitution (vNext.13.2)

COS(플래너)는 **승인된 작업**을 기준으로 에이전트·스킬 조합을 자유롭게 고른다. 하네스 에이전트는 **명시된 헌법** 안에서만 움직인다.

## 소스 파일

- `src/orchestration/harnessAgentCharters.js` — 에이전트별 mission, scope, allowed_providers, forbidden_actions, required_outputs, success_criteria, escalation_triggers, review_obligations, overlap_peers, challenge_reviewed_by.
- `src/orchestration/harnessOverlapMap.js` — 의도적 오버랩 쌍.
- `src/orchestration/harnessReviewMatrix.js` — 검토·challenge 관계 요약.
- `src/orchestration/harnessEscalationPolicy.js` — 창업자 에스컬레이션 조건·승인 문구 상수.

## 원칙

1. **COS autonomy:** 고정 오케스트레이션 경로를 코드로 강제하지 않는다.  
2. **Harness governance:** 역할·금지 액션·상호 검토·에스컬레이션은 명문화한다.  
3. **Deploy kill point:** 프로덕션·최종 배포는 별도 대표 확인(다른 문서·승인 패킷과 동일).

## 회귀

`npm test` → `test-vnext13-2-harness-charters.mjs`
