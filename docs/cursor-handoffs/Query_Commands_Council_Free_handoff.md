# Query Commands — Council-Free Structured Response

## 1. 변경 파일 목록

| 파일 | 내용 |
|------|------|
| `src/features/queryCommandPrefix.js` | 조회 접두·토큰 파서 — `queryOnlyRoute`·`queryNavButtons` 공유 (순환 import 방지) |
| `src/features/queryOnlyRoute.js` | query-only 라우트, 로깅; `tryFinalizeSlackQueryRoute` 가 `effectiveQueryLine` 로 네비 버튼 연동 |
| `src/slack/queryNavButtons.js` | PLN 3종·WRK 2종 상호 네비 `actions` 블록 |
| `src/slack/registerHandlers.js` | `g1cos_query_nav_*` → `tryFinalizeSlackQueryRoute` + 스레드 `postMessage` |
| `src/slack/queryResponseBlocks.js` | `wrapQueryFinalizePlainText(plain, { effectiveQueryLine })` |
| `app.js` | (역사) `도움말` 직후 query; **현행**은 `runInboundCommandRouter.js` 가 동일 순서로 `tryFinalizeSlackQueryRoute` 호출 |
| `src/features/runInboundCommandRouter.js` | **현행** pre-AI 진입 — `도움말` 다음·컨텍스트 전에 조회 finalize |
| `src/features/plans.js` | `formatPlanDetail` 계약 정렬, `formatPlanNextBlockQuery`, `formatPlanProgressSlack`, `buildPlanDispatchSlackBody({ queryDispatchList })` |
| `src/features/workItems.js` | `formatWorkItemDetailQuery`; 거절/차단 시 next 문구를 판단형에서 명령형으로 |
| `src/features/workLifecycle.js` | `formatWorkReviewQuery` |
| `scripts/test-query-only-route.mjs` | 스모크 |
| `scripts/test-query-blocks.mjs` | Block Kit·네비 버튼 래핑 스모크 |
| `docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` | §23.18 |
| 본 파일 | handoff |

## 2. query-only route 위치

- **`handleQueryOnlyCommands(trimmed)`** — `src/features/queryOnlyRoute.js`
- **`runInboundCommandRouter`** (`src/features/runInboundCommandRouter.js`): `도움말` 처리 직후 **`tryFinalizeSlackQueryRoute`** → Council·플래너 하드 락·`runInboundStructuredCommands`·AI 꼬리 이전에 조회면 반환 (`app.js` `handleUserText` 가 이 모듈을 호출)

## 3. Council 차단 방식

- 해당 5 접두사는 **항상** query 라우터에서 종료.
- `runCouncilMode`, `parseCouncilCommand` fallback, `inferWorkCandidate` 푸터, 승인 대기열 합성 **미경로**.
- 데이터 부족 시: **usage / not_found / empty_state** 문자열만 (Council 장문 금지).

## 4. TEST 1~7 결과

| 테스트 | 결과 | 비고 |
|--------|------|------|
| TEST 1~5 (실 PLN/WRK) | **미실행** | Slack·실데이터 필요; 포맷은 구조화 블록만 |
| TEST 6 not_found | **스모크 통과** | `node scripts/test-query-only-route.mjs` |
| TEST 7 usage | **스모크 통과** | 동일 |
| 회귀 | `node scripts/test-operations-loop.mjs` 통과 | (자동) |

## 5. 남은 리스크 1~2개

1. **접두사 오탐**: `계획상세`로 시작하는 자유 텍스트가 앞으로 추가되면 query 라우터가 먼저 잡을 수 있음 (현재는 `<id>` 필수로 완화).
2. **`formatWorkItemDetail` vs Query**: 상세 장문 포맷은 다른 경로에서만 필요 시 유지; 운영 혼동 시 문서에 “조회는 업무상세 = Query 계약” 명시.

## 6. 다음 추천 패치 1개

**툴 레지스트리 v2**: LLM function calling·실차단 게이트. *(v1: `cosToolRegistry`·`cosToolTelemetry`·`cosToolRuntime`·`tool_registry_bind` 로그 — 조회 네비 버튼은 기존과 동일.)*

## 7. doc handoff

- 메인: `docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` **§23.18**
- 본 파일: `docs/cursor-handoffs/Query_Commands_Council_Free_handoff.md`

### 금지 푸터 (조회형)

- 실행 작업 후보로 보입니다… / 종합 추천안 / 페르소나별 관점 / 반대 논리 / 긴장·충돌 / 핵심 리스크 / 대표 결정 필요 여부 — **조회 응답에 포함하지 않음**.
