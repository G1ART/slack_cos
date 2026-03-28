# WRK-260327 — Fast-Track Phase 1

## 패치 리포트

1. **제품 문제** — 대표 `도움말`에 내부 실행 어휘 전체 노출; 목표·상태·보류를 문법 없이 말할 통로 부재.
2. **답답함** — A(문법)·C(내부 덤프).
3. **파일** — `app.js`, `runInboundCommandRouter.js`, `runInboundAiRouter.js`, `topLevelRouter.js`, `executiveSurfaceHelp.js`, `surfaceIntentClassifier.js`, `tryExecutiveSurfaceResponse.js`, `statusPacketStub.js`, `cosWorkflowPhases.js`, `cosNavigator.js`, `registerSlashCommands.js`, `scripts/test-surface-intent.mjs`, `package.json`, North Star·Fast-Track·Inbound·User·Reset·README·replay.
4. **스키마** — Decision/Approval/proof **Phase 2**.
5. **라우팅** — `COS_FastTrack_v1_Surface_And_Routing.md` §0.
6. **비변경** — 구조화 분기 전체; 조회·플래너; Council 명시 진입.
7. **테스트** — `npm test`.
8. **수동 Slack** — `도움말` / `운영도움말` / `지금 상태` / `프로젝트시작:` / 조회 한 줄.
9. **리스크** — surface 오탐.
10. **다음** — Decision packet + Approval matrix (**1차 북극성**); trace·final responder 관측 (**병행**). surface replay fixture는 **반영됨** (`19_surface_ask_status`).
11. **명령** — `npm test`; `git add` → commit → push.
12. **핸드오프** — `COS_FastTrack_v1_Surface_And_Routing.md` 동기화.

## 코드

- `formatExecutiveHelpText`, `operatorHelpText`, `tryExecutiveSurfaceResponse`
