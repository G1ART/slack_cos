# COS Slack — 운영 핸드오프 (요약)

**정본 읽기 순서**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`

## vNext.13 (2026-04-03) — Proposal kernel + approval-orchestrated execution

1. **창업자 표면**: 기본 응답은 `[COS 제안 패킷]`(`proposal_packet_surface`). 맥락 합성 → 제안 패킷 → (선택) 동일 턴 `runCosNaturalPartner` 보강. intent/키워드 **라우팅 라벨**을 창업자에게 노출하지 않음.
2. **Launch gate**: `resolveWorkObject`/`resolveWorkPhase` 제거, `launchMinimalWorkContext`만 사용.
3. **외부 실행**: `run.external_execution_authorization.state === 'pending_approval'`이면 `ensureExecutionRunDispatched`가 디스패치하지 않음. 기본값 `authorized`는 기존 런 호환.
4. **Completion**: `truth_reconciliation` 엔트리가 없으면 `overall_status: pending`, `completion_source: 'truth_reconciliation'`만 (레인 outbound 레거시 폴백 제거).
5. **업무 capability 카탈로그**: `market_research`, `strategy_memo`, `document_write`, … — 내부 아티팩트 전용 계약(`cosCapabilityCatalog.js`). 플래너용 제안 작업 문장 입력: `extractCapabilitiesFromProposalPacket`.
6. **상세**: `docs/cursor-handoffs/COS_vNext13_Founder_Proposal_Kernel_Approval_Orchestrated_Execution_2026-04-03.md`
7. **회귀**: `scripts/test-vnext13-founder-proposal-kernel.mjs`

## vNext.12.1 (2026-04-03) — Founder constitution + single truth closure

1. **창업자**: `app.js`에서 `founderRoute`일 때 첫 번째 블록만 사용 — 그 안에 command/AI router 호출 없음 (`test-vnext12-1-founder-no-command-router.mjs`).
2. **`founderRequestPipeline`**: 창업자는 4단계 조기 반환 이하만; 아래 구간은 오퍼레이터용. 죽은 founder 분기·별도 제품 클리핑 헬퍼 제거.
3. **Completion 정본**: `truth_reconciliation.entries`가 있으면 `evaluateExecutionRunCompletion`이 이를 우선(`deriveExecutionCompletionFromTruthReconciliation`). 경로별 `satisfied` / `draft_only` / `unsatisfied`.
4. **창업자 문구**: `founderDeterministicUtilityResolver` 진행·핸드오프 + `executeSpine`/status 패킷은 reconciliation 줄 + provider truth (lane 휴리스틱만으로 “완료” 말하지 않음).
5. **디스패치 idempotency**: `outbound_dispatch_state !== 'not_started'` 이고 `failed`가 아니면 재디스패치 스킵 (`already_dispatched`) — truth가 partial이어도 아티팩트 중복 방지.
6. **상세**: `docs/cursor-handoffs/COS_vNext12_1_Founder_Constitution_Cleanup_And_Single_Truth_Closure_2026-04-03.md`

## vNext.12 (2026-04) — Harness constitution + executor truth alignment

1. **창업자 4단계**: transcript → 결정론 유틸(launch 제외) → launch gate → 자연어 파트너/폴백. `founderMinimalWorkContext`만 사용. 접두 스트립.
2. **오퍼레이터**: `source_type: channel` 등 — 헌법 골드/워크오브젝트 파이프라인.
3. **Executor**: `dispatchPlannedRoutes.js` + `truth_reconciliation` 저장.

## 브랜치 운영 (main-only 권고)

- 원격에만 남은 초안 브랜치·merge된 헤드 브랜치는 `git fetch --prune` 후 정리.
- `feat/thread-scoped-space-identity-hardening`는 main과 동일 시 삭제 후보.
- `cursor/supabase-initialization-b747` / PR #35 — close or absorb 후 브랜치 삭제.
- merge 후 **auto-delete head branches** 권장.

## 테스트

`npm test`에 `test-vnext12-1-founder-no-command-router`, `test-vnext12-1-single-truth-completion`, `test-vnext12-1-founder-status-from-reconciliation`, `test-vnext13-founder-proposal-kernel` 포함.

## 남은 리스크

- Cursor **strict satisfied**는 handoff+live ref 동시 요구 — 로컬은 대부분 `draft_only`/`partial` until 결과 드롭.
- `executionSpineRouter` 등 일부 PM/슬랙 서픽스는 여전히 `evaluateExecutionRunCompletion`만 사용하나, 런에 truth가 있으면 동일 정본을 공유.
