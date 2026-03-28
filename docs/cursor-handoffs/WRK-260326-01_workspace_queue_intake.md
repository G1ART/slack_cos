# WRK-260326-01 — 워크스페이스 큐 인테이크 (최단거리 1단계)

## 목적

24/7 워크스페이스 비전으로 가기 위한 **최소 이동**: Slack에서 들어온 **구현·아이디어**와 **고객 피드백**을 구조화해 `data/cos-workspace-queue.json`에 쌓는다.  
자동 에이전트 오케스트레이션은 없음 — **인간/Cursor가 파일·ID를 보고** `업무등록`·`커서발행` 등 기존 명령으로 이어간다.

## 명령 (멘션/DM, pre-AI 구조화)

| 입력 | kind | 비고 |
|------|------|------|
| `실행큐: …` | `spec_intake` | 플랫폼/툴 아이디어 (구조화 접두) |
| 자연어 실행 큐 | `spec_intake` | 첫 줄 `실행큐에 올려줘`·`실행 큐에 저장`·`구현 큐에 넣어줘`·`워크스페이스 큐에 올려줘`·`이걸 실행 큐에` 등 + **다음 줄 본문**; 또는 `실행큐에 올려줘: 본문` 한 줄 (`tryParseNaturalWorkspaceQueueIntake`) |
| `고객피드백: …` | `customer_feedback` | 구조화 접두 |
| 자연어 피드백 | `customer_feedback` | `고객피드백으로 저장` + 다음 줄 / `고객피드백으로 저장: 본문` / `피드백 큐에 넣어줘` + 다음 줄 등 |
| `실행큐목록` / `실행큐목록 10` | — | 최근 N건 (기본 5, 최대 20) |
| `고객피드백목록` | — | 동일 |

## 코드

- `src/features/cosWorkspaceQueue.js`
- `src/features/runInboundStructuredCommands.js` (분기)
- `src/storage/paths.js` — `COS_WORKSPACE_QUEUE_FILE`
- `src/storage/jsonStore.js` — `ensureStorage`에 파일 생성

## 로그

- `cos_workspace_queue_intake` (JSON 한 줄, `id`·`kind`·`title`)

## 회귀

- `scripts/test-workspace-queue.mjs` — `npm test` 포함

## dialog 확인 버튼 (2026-03)

- `runInboundAiRouter` → `dialog` 응답이 **일정 길이 이상**이면 Block Kit `actions` 3개: 실행 큐 / 고객 피드백 / 안 올림 (`g1cos_dialog_queue_*`).
- `action.value` 에 사용자 **원문(잘림 가능)** JSON. 클릭 시 `appendWorkspaceQueueItem` + 스레드에 저장 확인.
- 끄기: `SLACK_DIALOG_QUEUE_BUTTONS=0`
- `cosNaturalPartner` 시스템 지침: 의도 불명확 시 **되물어** 의지 정렬 (사소한 일도 게을리하지 않음).

## 다음 단계 (후속 패치)

- 큐 항목 → 승인 버튼 또는 `업무등록:` 초안 자동 생성
- Supabase 동기화 (멀티 인스턴스)
- Cursor/CI 웹훅으로 `pending_review` 구독
