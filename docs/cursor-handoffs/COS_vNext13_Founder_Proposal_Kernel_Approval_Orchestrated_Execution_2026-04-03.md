# COS vNext.13 — Founder Proposal Kernel + Approval-Orchestrated Execution

**Authority:** 구현 정본(런타임)과 동기화된 운영 메모  
**날짜:** 2026-04-03

## 요약

창업자 입력을 intent/키워드/커맨드 라우터로 **나누지 않고**, COS가 먼저 맥락을 합성하고 **제안 패킷**을 제시한다. 외부 시스템을 바꾸는 실행은 **승인(또는 명시적 authorized)** 이후에만 디스패치된다. 실행 완료의 1차 정본은 **`truth_reconciliation`**이며, 엔트리가 없을 때 레인 outbound로 “완료”를 추론하지 않는다.

## Founder–COS 경계

- 분류기·라우트 라벨·structured command를 창업자 표면에 노출하지 않음.
- 기본 표면: `proposal_packet_surface` — 11절 제안 패킷 + (선택) *대화형 보강*.
- 모듈: `src/founder/founderContextSynthesizer.js`, `founderProposalKernel.js`, `founderProposalPacket.js`, `founderApprovalPacket.js`, `executionModeFromProposalPacket.js`.

## 실행 모드 (제안 이후 내부)

- `COS_ONLY` — Slack 내 응답·초안 중심.
- `INTERNAL_SUPPORT` — 내부 아티팩트·하네스.
- `EXTERNAL_EXECUTION_REQUIRES_APPROVAL` — GitHub/Cursor/Supabase/배포 등; 승인 패킷 문구는 `approvalPacketFormatter.js`.

## 승인 게이트

- `src/orchestration/approvalGate.js` — `isExternalMutationAuthorized(run)`.
- 런 필드: `external_execution_authorization` (기본 `authorized` — 기존 회귀 호환).
- `ensureExecutionRunDispatched` (`executionDispatchLifecycle.js`)가 게이트 통과 후에만 `dispatchOutboundActionsForRun`을 호출한다.

## Completion

- `evaluateExecutionRunCompletion`: `truth_reconciliation.entries` 있으면 기존 도출; 없으면 `pending` + `completion_source: 'truth_reconciliation'`만.

## Business-ops capability (카탈로그)

`cosCapabilityCatalog.js`에 `market_research`, `strategy_memo`, `document_write`, `document_review`, `budget_planning`, `financial_scenario`, `ir_deck`, `investor_research`, `outreach_copy` 추가 — 기본 **internal_artifact**, 외부 mutation 금지 계약.

플래너 입력용: `extractCapabilitiesFromProposalPacket` (`runCapabilityExtractor.js`).

## 테스트

- `scripts/test-vnext13-founder-proposal-kernel.mjs`
- 기존 `test-founder-launch-gate`, `test-partner-natural-sanitize`는 `proposal_packet_surface` 기대로 갱신.

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
git commit -m "vNext.13 founder proposal kernel and approval-orchestrated execution"
git pull --rebase origin "$(git branch --show-current)"
git push origin "$(git branch --show-current)"
```

이번 패치에 SQL 없음.
