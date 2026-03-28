# Handoff: Planner Front Door Hotfix v2

**날짜:** 2026-03-20  
**목표:** planner 진입 전 입력 normalize, 빈 본문 안내, dedup 시 **저장소에서 contract 재조립**, Council `실행 작업 후보` 푸터 억제 강화.

---

## 변경 파일

| 파일 | 요약 |
|------|------|
| `src/slack/inboundText.js` | **`event.text` 비어 있을 때 `blocks`에서 평문 복원**; **멘션만 있고 본문은 `rich_text`(굵게 등)만 있을 때 `blockStripped` 사용**; `link` 노드 텍스트 수집 |
| `src/slack/registerHandlers.js` | `stripMention(event.text)` 대신 **`getInboundCommandText(event)`** (멘션·DM 공통) |
| `src/features/plannerRoute.js` | `normalizePlannerInputForRoute`(BOM/ZWSP, NFKC, **VS15/16(`\uFE0E`/`\uFE0F`) 가장자리 제거** 후 `*…*` 벗김, 코드펜스, 앞 빈 줄·줄 장식), 줄 단위 `계획등록`만 매칭, dedup은 `plan_id` 저장, `logPlannerFc` |
| `src/features/plans.js` | `formatPlanRegisterContractFromStoredPlan(planId)` |
| `app.js` | `userText` → normalize → `extractPlannerRequest`, 빈 본문 한 줄 응답, dedup hit 시 DB에서 contract 재생성, Council 푸터 `shouldSuppressWorkCandidateFooter`, Council 직전 **`planner_routing_miss`** |
| `scripts/test-operations-loop.mjs` | normalize + dedup plan_id 반영 |

---

## normalize 순서 (route 판정보다 먼저)

`handleUserText` planner 분기에서 **`normalizePlannerInputForRoute(userText)`** 를 최우선 호출한 뒤 `extractPlannerRequest(plannerNorm)` 호출.

파이프라인: BOM/ZWSP 제거 → 바깥 ``` 펜스 제거(반복) → 바깥 `*…*` / `_…_` 제거(반복) → **앞쪽 빈 줄 + `*`·`>`·리스트만 있는 줄 스킵** → trim.

줄 단위 매칭 전 **`stripLeadingLineDecorations`**: `*계획등록:`(닫는 `*` 없음), `> 계획등록:`, `- `·`•`·`1. ` 등 제거 후 `계획등록` 판정.

---

## empty-body return

`plannerReq`가 잡혔고 `!raw || plannerReq.empty_body` 이면 즉시:

`계획등록 본문이 비어 있습니다. 예: 계획등록: slack_cos에서 ...`

이 경로에서 Council 미호출. 로그: `planner_empty_body`, `planner_fallback_blocked`.

---

## dedup hit 시 기존 plan/APR

- 키: `channel:user:sha256(normalizePlannerBodyForDedup(raw))` (`raw` = planner 본문)
- 저장: 성공 시 `plan_id` 만 TTL 맵에 저장
- hit: `formatPlanRegisterContractFromStoredPlan(plan_id)` → `getPlan` + `getLatestPlannerApprovalForPlan` + `formatPlanRegisterContract`
- plan 없으면 캐시 무효화 후 신규 생성
- 하단 보조 한 줄만: `(동일 요청 재사용 — …)`

---

## 로그 (`planner_event`)

- `planner_normalized_input`
- `planner_prefix_detected`
- `planner_empty_body`
- `planner_dedup_hit` / `planner_dedup_returned_existing`
- `planner_fallback_blocked` (빈 본문, persist 실패, Council 푸터 억제 시 등)

---

## 테스트

- 로컬: `node scripts/test-operations-loop.mjs`
- Slack A–E: `doc/testing/SLACK_TEST_PACK_Operations_Loop_Closure_v1.md` 와 동일 시나리오 권장

**이번 패치 SQL 없음.**

```bash
cd ~/g1-cos-slack && npm start
```
