# COS vNext.12.1 — Founder Constitution Cleanup + Single Truth Closure (2026-04-03)

## 요약

기능 확장이 아니라 **헌법·정본 정합** 패치. 창업자 면은 `app.js`에서 이미 단일 커널로 끝나며, 본 패치는 **문서·파이프라인 잔재 제거**, **`truth_reconciliation`을 completion 정본으로 승격**, **창업자 결정론 유틸·executeSpine이 reconciliation·provider truth만 읽도록** 정리한다.

## A. Founder — command / AI router

- `app.js` 첫 번째 `if (founderRoute)` 블록 안에 `runInboundCommandRouter` / `runInboundAiRouter` 문자열이 없어야 함 — 회귀: `scripts/test-vnext12-1-founder-no-command-router.mjs`.
- 오퍼레이터 경로의 `runInboundCommandRouter`는 `structuredOnly: false` (창업자는 해당 분기 미도달).

## B. `founderRequestPipeline.js`

- 창업자(`founderRoute`): `founderDirectInboundFourStep` 조기 반환 이후 코드는 **오퍼레이터 전용**. 죽은 `founderRoute` 분기·제품 분기 클리핑 함수 제거.
- 오퍼레이터 kickoff 시 인테이크 오픈: `gold.kind === 'kickoff'` (창업자 한정 조건 제거).

## C. Completion 정본

- `evaluateExecutionRunCompletion`: `run.truth_reconciliation.entries`가 있으면 `deriveExecutionCompletionFromTruthReconciliation` 우선 (`completion_source: truth_reconciliation`). 없으면 레거시 lane outbound.
- `truthReconciliation.js`: 경로별 `reconciled_status` — `satisfied` | `unsatisfied` | `draft_only`. GitHub live issue id, Cursor handoff+run ref, Supabase apply ref, deploy 패킷/요약 등 **계약 기반**.
- `outbound_dispatch_state`: 첫 디스패치 후 `partial`일 수 있음 — **재디스패치 방지**는 `completed`만이 아니라 `not_started`가 아닌 대부분의 종료 상태에서 스킵(`already_dispatched`), `failed`만 재시도 허용.

## D. Founder-facing status

- `founderDeterministicUtilityResolver`: 진행/핸드오프 질문에 `formatReconciliationLinesForFounder` + provider 스냅샷.
- `executeSpine` / 골드 `status`: provider truth + reconciliation 줄 병합.

## E. 브랜치 위생 (main-only 권고)

- `feat/thread-scoped-space-identity-hardening`: `main`과 동일하면 로컬/원격 브랜치 삭제 후보.
- `cursor/supabase-initialization-b747` / 초안 PR #35: merge·흡수 또는 close 후 브랜치 삭제.
- **짧은 수명 브랜치만** 사용; merge 후 GitHub **auto-delete head branches** 권장.

```bash
git fetch --prune
git branch -d feat/thread-scoped-space-identity-hardening  # 이미 main에 포함 시
git push origin --delete feat/thread-scoped-space-identity-hardening   # 원격 정리 시
```

## 테스트

- `test-vnext12-1-founder-no-command-router.mjs`
- `test-vnext12-1-single-truth-completion.mjs`
- `test-vnext12-1-founder-status-from-reconciliation.mjs`

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
git commit -m "vNext.12.1 founder constitution cleanup and single truth closure"
git pull --rebase origin "$(git branch --show-current)"
git push -u origin patch/vnext12-1-founder-constitution-single-truth
```

이번 패치에 SQL 없음.
