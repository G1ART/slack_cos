# vNext.13.11 — Founder chat-first / structured planner opt-in

**날짜**: 2026-04-01  
**목적**: 창업자 슬랙 턴에서 **구조화 JSON 플래너(`callJSON`)를 기본 끄고**, 표면은 **COS 단일 대화 LLM 1회**만 돌린다. 운영에서 턴마다 “플래너 한 번 + 파트너 한 번” 이 겹치며 톤·포맷이 흔들리거나 Council형이 새는 문제를 줄인다.

## 코드

- `src/founder/founderConversationPlanner.js`: `useStructuredPlanner === false` 이면 즉시 `founder_chat_only` + `emptySidecarFromPartner('')`. mock 행은 기존처럼 최우선.
- `src/founder/founderDirectKernel.js`: `useFounderStructuredPlanner(metadata)` — `disableFounderStructuredPlanner` / `enableFounderStructuredPlanner` / `COS_FOUNDER_STRUCTURED_PLANNER=1`. trace `founder_structured_planner`, `pipeline_version: vNext.13.11`.
- `src/features/cosNaturalPartner.js`: `route === null` 일 때 **짧은 시스템 프롬프트**(라우터 비트·비서실장 래퍼 장문 생략). 창업자 커널 표면 경로는 `route: null`.
- `src/features/founderSurfaceGuard.js`: `**ops_grants**:` 등 **굵게 감싼 페르소나 라벨 줄** 제거 + 마커 검출 보강.
- `.env.example`: `COS_FOUNDER_STRUCTURED_PLANNER` 설명.
- `.gitignore`: `data/*.json` 활성화 — 로컬 런타임 JSON 은 커밋 대상에서 제외(이미 추적된 파일은 `git rm --cached` 필요).

## 회귀

- `scripts/test-vnext13-10-founder-natural-surface-harness.mjs`: 구조화 분기 검증을 위해 파일 상단에서 `COS_FOUNDER_STRUCTURED_PLANNER=1` 설정 후 복원.
- `scripts/test-partner-natural-sanitize.mjs`: `**ops_grants**:` 줄 포함 시 sanitize.

## Owner actions

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
git commit -m "vNext.13.11: founder chat-first, structured planner opt-in, data json gitignore"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
