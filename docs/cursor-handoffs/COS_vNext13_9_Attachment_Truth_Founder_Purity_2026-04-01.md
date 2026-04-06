# Handoff: vNext.13.9 — Attachment truth pass + founder purity (2026-04-01)

작업지시서: `COS_vNext13_9_Attachment_Truth_Pass_Founder_Purity.md`.

## Before / after

- **Before**: `buildFounderTurnTextAfterFileIngest` 가 실패 블록·파일 요약을 `combinedTextForPlanner` 에 합쳐 모델 user 본문으로 보냄. `planFounderConversationTurn` 의 structured JSON 경로는 `natural_language_reply` sanitize 생략. `app.js` 가 `classifyFounderRoutingLock=version` 이면 창업자여도 즉시 `runtime_meta_surface`.
- **After**: `buildFounderTurnAfterFileIngest` → `modelUserText` 만 커널; `failure_notes` 는 메타·`contextFrame.slack_attachment_failure_notes`. 전부 실패·본문 없음 → 핸들러에서 one-shot. `ingestSlackFile` 에 단계별 `acquire_trace` + `[SLACK_FILE_ACQUIRE_TRACE]` 로그; `text/html` Content-Type 조기 실패. structured/mock 경로 동일 sanitize. 창업자 경로만 `version` 선처리 제외. `sendFounderResponse` thin `sanitizeFounderOutput`.

## Root cause (요약)

- Acquisition·planner·surface 계층이 한 문자열에 섞여 실패/내부 포맷이 대표 면으로 새었음.

## Touched files (주요)

- `src/features/founderSlackFileTurn.js`, `src/slack/registerHandlers.js`, `src/features/slackFileIntake.js`, `src/founder/founderContextSynthesizer.js`, `src/founder/founderConversationPlanner.js`, `src/founder/founderDirectKernel.js`, `src/core/founderOutbound.js`, `app.js`, `package.json`, `scripts/test-vnext13-9-*.mjs`, 기존 13.7/13.8 테스트 정합.

## Tests

- `npm test` (전체 체인에 `test-vnext13-9-*` 8개 포함).

## Residual risk

- 이중 sanitize(플래너 + 아웃바운드)로 일부 정상 마크다운이 줄어들 수 있음 — 필요 시 허용 surface 조정.
- `founderRequestPipeline`(비창업자) 경로는 기존처럼 `version` 락이 intent에 반영될 수 있음; 창업자 SSOT는 `runFounderDirectKernel`.

## Owner actions

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

Git 동기화는 `docs/HANDOFF.md` 패치 규칙 블록 따름.
