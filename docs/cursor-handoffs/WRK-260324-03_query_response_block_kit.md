# WRK-260324-03 — 조회 응답 Block Kit (단락 section)

## 요약
- **`src/slack/queryResponseBlocks.js`**: `wrapQueryFinalizePlainText` — 빈 줄(`\n\n`) 기준 단락을 `section`+`mrkdwn` 블록으로 분할 (최대 길이·블록 수 상한).
- **`tryFinalizeSlackQueryRoute`**: `finalizeSlackResponse` 직후 래핑 → **`string | { text, blocks }`** 반환 (기본: 블록 on).
- **비활성**: `SLACK_QUERY_BLOCKS=0` 또는 `false` → 기존처럼 **문자열만**.
- **`registerSlashCommands`**: 객체 응답 시 `respond({ text, blocks, response_type: 'in_channel' })`.
- **`registerHandlers`**: 기존 `resolvePostPayload` 가 `{ text, blocks }` 지원 — 멘션/DM 조회 동일 적용.
- **회귀**: `scripts/test-query-blocks.mjs` → `npm test`.

## 미포함 (로드맵)
- `action_id` 고정 버튼, Header 블록, 포맷터별 의미 단위 분할.

## 운영
- `.env.example` 에 `SLACK_QUERY_BLOCKS` 주석 추가.
