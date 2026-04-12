# 파운더 슬랙 — 모델 본문 송신 + 스레드 후속 (2026-04-12)

정본 순서: `00_Document_Authority_Read_Path.md`.

## 동작

1. **같은 턴 슬랙 메시지**는 더 이상 고정 접수문만이 아니라 `runFounderDirectConversation` 의 **모델 `text`** 전체를 보냄. `starter_ack` 필드는 **호환용 별칭**으로 `text` 와 동일.
2. **채널/그룹 스레드**에서 COS를 다시 멘션하지 않아도, **최초 멘션으로 `saveSlackRouting` 된 스레드**(`mention:channel:root_ts`)이면 `message` 이벤트로 후속 턴을 이어 받음.
3. **`app_mention` 과 중복**: 본문에 `<@BOT_USER_ID>` 가 있으면 `message` 경로는 건너뜀(멘션 핸들러가 처리).
4. **긴 응답**: `sendFounderResponse` 가 약 38k 자 단위로 분할 전송.
5. **봇 user id**: `SLACK_BOT_USER_ID` 또는 첫 `auth.test` 캐시 — `src/founder/slackBotIdentity.js`.

## Slack 앱 설정

Socket Mode 사용 시에도 **Event Subscriptions** 에 `message.channels` (비공개 채널이면 `message.groups`) 를 켜야 채널 스레드 후속이 들어옵니다. 멘션만 켜져 있으면 후속 턴은 오지 않습니다.

## 코드 앵커

- `src/founder/registerFounderHandlers.js`
- `src/founder/runFounderDirectConversation.js` (`return { text, starter_ack: text }`)
- `src/founder/sendFounderResponse.js` (`chunkFounderSlackText`)

## Owner actions

- 로컬: `npm test`
- 프로덕션: Slack 앱 이벤트 구독 확인 후 재설치/배포
- Git: 워크스페이스 패치 보고 규칙
