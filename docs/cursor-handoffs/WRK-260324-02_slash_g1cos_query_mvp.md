# WRK-260324-02 — `/g1cos` 슬래시 조회 MVP

## 요약
- **`src/slack/registerSlashCommands.js`**: Bolt `slackApp.command('/g1cos')` — `command.text` 를 정규화 후 **`tryFinalizeSlackQueryRoute`** 호출 (멘션/DM 조회와 동일 경로).
- **응답**: 조회 성공 시 **`response_type: 'in_channel'`** (채널에 결과 공유). 미스·빈 입력·`help` 는 **ephemeral** 안내.
- **`app.js`**: `registerG1CosSlashCommand(slackApp)` 등록.
- **회귀**: `scripts/test-slash-g1cos.mjs` → `npm test` 체인에 포함.
- **핸드오프**: North Star, Inbound Routing, User Guide, Regression Harness, G1 §6.1·§23.19, replay 수동 테스트 목록.

## Slack 앱 설정 (운영 필수)
1. [api.slack.com](https://api.slack.com/apps) → 해당 앱 → **Slash Commands** → **Create New Command**
2. Command: **`/g1cos`**, Request URL: Socket Mode 사용 시에도 명령은 앱에 등록되어야 하며, Bolt Socket가 이벤트를 받음 (짧은 설명·사용법 채우기).
3. 앱 재설치(Install)로 워크스페이스에 커맨드 노출.

## 로그
- `slash_command_entered`, `slash_command_query_returned` (`logRouterEvent`).

## 다음
- `/g1cos` 서브커맨드 또는 `response_url` 후속. (조회 본문 Block Kit → `WRK-260324-03`.)
