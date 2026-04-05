# vNext.13.6 — Slack 파일 인테이크 (Founder DM/멘션 수직 슬라이스)

**날짜**: 2026-04-01  
**목적**: 창업자 면에서 DOCX / PDF(text layer) / PNG(vision) 첨부를 **다운로드·추출**하고, **실행·승인 lineage와 분리**된 durable 필드 `latest_file_contexts[]`에 남긴다.

## 구현 요약

| 구역 | 파일 |
|------|------|
| MIME/확장자·용량·추출 | `src/features/slackFileIntake.js` — `resolveMvpFileKind`, `extractMvpFileFromBuffer`, `ingestSlackFile` |
| PNG vision | `src/features/founderDmImageSummary.js` — `summarizePngBufferForFounderDm` |
| durable 항목 빌드 | `src/founder/founderFileContextRecord.js` — `buildFounderFileContextEntry` |
| 상태 병합·스냅샷 | `src/founder/founderConversationState.js` — `mergeDelta`의 `latest_file_contexts`, `founderStateToSnapshot.recent_file_contexts` |
| 컨텍스트 합성 | `src/founder/founderContextSynthesizer.js` — `recent_file_contexts`, constraints 힌트 |
| 플래너 지시 | `src/founder/founderConversationPlanner.js` — `durable_state.latest_file_contexts`와 실행·승인 혼동 금지 |
| Slack 이벤트 | `src/slack/registerHandlers.js` — 인제스트 후 `mergeFounderConversationState`, 프리앰블, `summarizePng` 주입 |

## 환경 변수

- `COS_FOUNDER_FILE_MAX_BYTES` — 기본 15MB
- `COS_FOUNDER_FILE_CONTEXT_CAP` — `latest_file_contexts` 최대 길이, 기본 10
- `COS_FOUNDER_IMAGE_MODEL` — PNG vision 모델, 기본 `gpt-4o-mini`
- `OPENAI_API_KEY` — PNG 경로에 필요

## 회귀

`npm test`에 포함:

- `scripts/test-vnext13-6-resolve-mvp-file-kind.mjs`
- `scripts/test-vnext13-6-extract-mvp-buffer-pdf-png.mjs`
- `scripts/test-vnext13-6-extract-oversized.mjs`
- `scripts/test-vnext13-6-latest-file-contexts-merge.mjs`
- `scripts/test-vnext13-6-founder-file-context-entry.mjs`
- `scripts/test-vnext13-6-synthesize-with-file-contexts.mjs`

## Owner actions (패치 후)

### 로컬 검증

```bash
cd /Users/hyunminkim/g1-cos-slack
npm test
```

### Git (동기화)

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git pull --rebase origin "$(git branch --show-current)"
git add -A
git commit -m "vNext.13.6: Slack file intake for founder DM (DOCX/PDF/PNG, latest_file_contexts)"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
