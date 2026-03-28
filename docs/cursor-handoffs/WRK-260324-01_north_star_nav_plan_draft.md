# WRK-260324-01 — North Star 문서 정렬 + 내비 `계획등록:` 복붙 초안

> **후속**: 아래 “다음 (North Star 목록)”은 초안 시점 순서이다. **현재 북극성 순서**는 `COS_Project_Directive_NorthStar_FastTrack_v1.md` §4 · `COS_NorthStar_Workflow_2026-03.md` “다음 패치”를 따른다 (Phase 2 Decision packet·Approval matrix 우선).

## 요약
- `COS_NorthStar_Workflow_2026-03.md`: **Slack UX 기둥** 절 추가, 권장 패치 순서를 Architecture Phase·User Guide와 정렬. 내비 초안 항목 **완료**로 트래킹.
- `src/features/cosNavigator.js`: `getCosNavigatorEmptyIntro`·`formatNavigatorPayload` 하단에 fenced **`계획등록:` 초안** (`buildPlanRegisterDraftLine`, 본문 있을 때 `이해한 내용` 한 줄 압축).
- `.cursor/rules/handoff-docs-update.mdc`: 응답 말미 **Owner actions** 습관( SQL / Git / 로컬런 ) 명시.
- 연동 문서: `COS_Navigator_260323.md`, `COS_Operator_QA_Guide_And_Test_Matrix.md`, `G1_ART_Slack_COS_Handoff_v2` §23.19, `README_HANDOFFS.md`, `scripts/replay-slack-fixtures.mjs` 권장 다음 패치 문구.

## 코드
- `buildPlanRegisterDraftLine` — export (테스트·재사용 가능).

## 검증
- `npm test` 통과.

## 다음 (North Star 목록)
1. `/g1cos` 슬래시 MVP  
2. 조회 Block Kit 섹션  
3. 툴 레지스트리 → 함수 포인터  
4. dialog 한 턴 도구  
5. 버퍼 영속화  
