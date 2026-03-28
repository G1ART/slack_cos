# WRK-260325-01 — `runPlannerHardLockedBranch` 모듈 분리

## 변경

- **`src/features/runPlannerHardLockedBranch.js`**: 기존 `app.js` 내 플래너 `hit`/`miss` 전용 분기 (Invariant 1: Council·inferWorkCandidate 금지).
- **`src/util/formatError.js`**: `app.js`·`registerHandlers` 가 공유하는 짧은 오류 문자열 (플래너 모듈에서도 사용).
- **`app.js`**: 위 모듈 import; 사용되지 않던 `plans` / `plannerRoute` / `topLevelRouter` import 및 `createPlannerApprovalRecord` import 제거.

## 검증

- `npm test`

## 다음 (North Star)

- 툴 레지스트리 실연결, 대화 버퍼 영속화.
