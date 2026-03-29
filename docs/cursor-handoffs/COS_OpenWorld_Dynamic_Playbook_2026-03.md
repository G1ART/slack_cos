# Open-World COS / Dynamic Playbook Engine

> 코드 기준일: 2026-03-29
> 관련 패치: `feat: open-world COS — no-council-by-default + dynamic playbook engine`

## 1. 핵심 변경

대표-facing 기본 화자를 **Council → COS (partner_surface / research_surface)**로 교체.
새로운 유형의 요청이 와도 rigid taxonomy가 아닌 **dynamic playbook**으로 처리.

## 2. Council 정책: Internal-Only by Default

### Council이 user-facing으로 노출되는 경우 (딱 2가지)
1. **Explicit council command** — `협의모드:`, `council:` 등 명시적 접두
2. **Bounded escalation** — irreversible decision, legal/tax risk, severe tradeoff

### Council이 절대 user-facing이 되면 안 되는 경우
- 일반 자연어 입력
- Research 질문
- 새 유형의 업무 요청
- execution thread 안

## 3. 라우팅 순서 (변경)

```
1. version / 도움말
2. intake cancel
3. execution spine (hasOpenExecutionOwnership)
4. spec build thread (isPreLockIntake)
5. decision short reply / lock-confirmed / refine / kickoff
6. lineage / query / planner / structured / surface
7. navigator
8. planner hard lock
9. ★ DYNAMIC PLAYBOOK INTERPRETATION ← 신규
10. ★ RESEARCH SURFACE (isResearchSurfaceCandidate) ← 신규
11. ★ PARTNER SURFACE (cosNaturalPartner) ← 기본 fallback으로 승격
12. explicit council (협의모드 only)
```

**ordinary unmatched input → council** 경로는 **제거됨**.

## 4. Dynamic Playbook (`dynamicPlaybook.js`)

### Task Hypothesis Interpretation
- `interpretTask(text)` → `DynamicTaskHypothesis`
- Open-world kind: `grant_research`, `presentation_build`, `ad_hoc_*` 등
- Mode: `answer` | `research` | `execution` | `hybrid`
- Freshness detection: 시간 민감 요청 태깅

### Playbook Object
- `PBK-...` ID
- `status`: draft → active → promoted → completed → cancelled
- Thread 기준 저장, JSON persistence

### Playbook Promotion
- 같은 kind가 3회 이상 사용되면 `promoted` 승격 가능
- Promoted playbook은 빠른 재사용 템플릿 (새 유형을 막지 않음)

## 5. Representative Research Surface

- `representativeResearchSurface.js`
- 자연어 research 요청 패턴: 알아봐줘, 찾아줘, 정리해줘, 비교해줘, shortlist 등
- Freshness-required 요청은 학습 데이터만으로 답하지 않도록 태깅
- 출력 형식: 요청 이해 → 조사 기준 → 결과 → 자격 요건 → 불확실성 → 출처
- Council memo 형식 금지

## 6. Representative Partner Surface

- `cosNaturalPartner.js` (기존) → `responder: 'partner_surface'`로 승격
- 모든 non-council, non-research 자연어 입력의 기본 응답기
- Council report 형식 금지 (이미 프롬프트에서 금지)

## 7. Responder-Path Logging

매 요청마다 `dynamic_task_interpreted` 이벤트:
- `task_kind`, `mode`, `is_research`, `freshness_required`
- `should_open_playbook`, `should_open_execution`
- `playbook_id`, `council_allowed`, `council_exposed`
- `execution_ownership`

## 8. Hard Fail 조건

ordinary natural-language input에서 `responder=council`이면 **fail** (explicit council / bounded escalation 예외).

## 9. 테스트 (`test-open-world-playbook.mjs`)

| # | 시나리오 | 기대 responder |
|---|----------|---------------|
| 1 | 정부지원사업 research | `research_surface` |
| 2 | 일반 질문 | `partner_surface` |
| 3 | 발표자료 만들어줘 | ad-hoc playbook 생성 |
| 4 | 같은 kind 3회 반복 | promotion eligible |
| 5 | 협의모드: ... | `council` |
| 6 | execution thread에서 | execution surface |
