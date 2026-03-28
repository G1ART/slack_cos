# WRK-260324-04 — 조회 네비 버튼 (PLN/WRK)

## 요약

- **`src/slack/queryNavButtons.js`**: `계획상세|진행|발행목록` 은 동일 PLN 토큰으로 나머지 2종, `업무상세|검토` 는 동일 WRK 로 상대 1종을 **`actions`** 버튼으로 제시.
- **`wrapQueryFinalizePlainText(plain, { effectiveQueryLine })`**: 실제 매칭된 조회 줄을 넘겨 버튼 생성.
- **`tryFinalizeSlackQueryRoute`**: `effectiveQueryLine` 연동.
- **`registerHandlers.js`**: Bolt `action(/^g1cos_query_nav_\\d+$/)` — `value` 를 정규화 후 `tryFinalizeSlackQueryRoute` → **`chat.postMessage`** (스레드 `thread_ts` 우선).
- **순환 import 방지**: `src/features/queryCommandPrefix.js` (`matchQueryCommandPrefix`, `parseCommandToken`, `PREFIX_KIND`, `QUERY_PREFIXES`).
- **환경**: `SLACK_QUERY_NAV_BUTTONS=0|false` 로 버튼만 끔. `SLACK_QUERY_BLOCKS=0` 이면 본문은 평문이어도 네비만 블록으로 붙을 수 있음.

## Owner actions

1. **Slack 앱**: Interactivity 가 켜져 있어야 버튼이 동작 (Request URL = Bolt 서버).
2. Local: `npm test`
3. Git: 필요한 경로만 add / commit / push
