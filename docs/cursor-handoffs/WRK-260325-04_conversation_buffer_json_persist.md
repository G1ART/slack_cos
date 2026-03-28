# WRK-260325-04 — 대화 버퍼 로컬 JSON 영속 (옵트인)

## 목적

프로세스 재시작 후에도 **동일 인스턴스**에서 스레드/DM 대화 맥락을 복구하기 위한 **1단계** 스냅샷. 멀티 워커·수평 확장 공유는 **하지 않음** (후속: Supabase 등).

## 환경 변수

| 변수 | 설명 |
|------|------|
| `CONVERSATION_BUFFER_PERSIST` | `1` / `true` / `yes` 이면 디스크 저장 활성 |
| `CONVERSATION_BUFFER_FILE` | 선택. 기본 `data/slack-conversation-buffer.json` (`src/storage/paths.js`) |
| `CONVERSATION_BUFFER_DISABLE` | `1` 이면 버퍼 전체 비활성 (기존과 동일) |

## 코드

- `src/features/slackConversationBuffer.js` — 디바운스 flush, `loadConversationBufferFromDisk`, `flushConversationBufferToDisk`
- `app.js` — `ensureStorage()` 후 로드, `attachGracefulShutdown`에 flush
- `src/runtime/startup.js` — `beforeStop` 훅에서 종료 전 flush

## 회귀

- `scripts/test-conversation-buffer-persist.mjs` — `npm test` 체인 포함

## 관련

- `COS_Inbound_Routing_Current_260323.md` §1·§2·§6
- `.env.example` 주석
