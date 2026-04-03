# Harness subagent / skills (vNext.13.2)

## 개념

- **Skill:** 하네스 레이어의 on-demand 패킷. COS planner가 승인된 작업·플랜에 맞춰 attach한다.  
- **Invocation:** 창업자 키워드 라우팅이 아니라 **승인된 제안·작업 목록**이 기준이다.

## 레지스트리

`src/orchestration/harnessSkillsRegistry.js`

각 스킬: `summary`, `jit_context_refs` (전체 대화를 찢지 않고 identifier·ref만), `typical_agents`.

## Context engineering

Founder 대화 전체를 capability로 쪼개지 말고, 실행 시점에 필요한 ref만 JIT 로딩한다.

## 회귀

`npm test` → `test-vnext13-2-skills-registry.mjs` (see also `docs/harness-skills-registry.md`)
