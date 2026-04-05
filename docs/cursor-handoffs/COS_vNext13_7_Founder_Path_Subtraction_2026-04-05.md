# vNext.13.7 — Founder path subtraction / conversation purity

**날짜**: 2026-04-05  
**목적**: 창업자 면에서 **중간 렌더층을 제거**해 슬랙 안 대화를 GPT 수준의 자연어에 가깝게 유지한다. 파일 실패가 플래너·패킷으로 샐 때를 끊는다.

## 코드 맵

| 영역 | 파일 |
|------|------|
| 파일 시그니처·HTML 감지 | `src/features/slackFileIntake.js` — `peekPayloadNature`, `resolveEffectiveKindAfterDownload`, `buildConciseFileContextForPlanner`, `partitionFileIntakeForFounderTurn` |
| DM/멘션 턴 조립 | `src/features/founderSlackFileTurn.js` — `founderIngestSlackFilesWithState`, `buildFounderPlannerInputAfterFileIngest` |
| Slack 핸들러 | `src/slack/registerHandlers.js` |
| 커널 표면 | `src/founder/founderDirectKernel.js` — 자연어 기본, 승인 시만 `buildFounderApprovalPacket` |
| 아웃바운드 안전망 | `src/core/founderOutbound.js` — `FOUNDER_CONVERSATION_FORBIDDEN_MARKERS` |
| 플래너 지시 | `src/founder/founderConversationPlanner.js` |

## 불변식

1. 파일 인제스트 **전부 실패** + 사용자 텍스트 없음 → **`handleUserText` 호출 없음**; 짧은 실패 문구만 전송.  
2. 일부 실패 → 성공 요약만 플래너 입력; 실패는 답변 말미 `(참고)` 한 줄.  
3. 다운로드 바이트가 HTML/JSON 오류면 `downloaded_html_instead_of_file` 등으로 분리.  
4. PDF/PNG 시그니처가 있으면 Slack MIME·확장자 불일치를 덮어쓸 수 있음.

## 회귀

`npm test`에 포함: `scripts/test-vnext13-7-*.mjs` (6종).

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
git commit -m "vNext.13.7 founder path subtraction and file failure purity reset"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
