# COS Slack — 운영 핸드오프 (요약)

**정본 읽기 순서**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md`

## vNext.13.2 (2026-04-03) — Launch gate purification + harness constitution + E2E dress rehearsal

1. **Launch gate**: `founderLaunchGate.js`는 `evaluatePolicy` / `renderFounderSurface` 없음. 창업자 텍스트는 `founderLaunchFormatter.js`·`founderLaunchApprovalPacket.js`만.
2. **Harness**: `harnessAgentCharters.js` 등 13 에이전트 헌법, 오버랩·리뷰·에스컬레이션·`harnessSkillsRegistry.js` 스킬 패킷.
3. **제안·승인**: 맥락 우선 제안 커널; 승인 패킷 결제 표면 확장; `holdExternalExecutionForRun` → `draft_only`.
4. **문서**: `docs/harness-constitution.md`, `docs/harness-subagent-skills.md`, `docs/approval-escalation-policy.md`, `docs/cursor-handoffs/COS_vNext13_2_Launch_Gate_Purification_Harness_Constitution_E2E_2026-04-03.md`
5. **회귀**: `scripts/test-vnext13-2-*.mjs` 여섯 + 기존 vNext.13.1 여섯.

## vNext.13.1 (2026-04-03) — Founder kernel final lock + default-deny

1. **창업자 커널**: `src/founder/founderDirectKernel.js` → `runFounderDirectKernel` 만 `app.js`·`runInboundAiRouter` 창업자 경로에서 호출. `founderRequestPipeline.js`는 **오퍼레이터/채널 spine 전용**.
2. **승인 게이트**: `isExternalMutationAuthorized` — **`authorized`만 true**; auth 필드 없음/null/pending/draft_only는 **전부 거부**. `getExternalExecutionAuthState` 기본은 `pending_approval`.
3. **제안·승인**: `external_execution_tasks`가 있을 때만 승인 패킷 섹션; IR/예산/투자자 카피 등은 단어 언급만으로 외부 실행으로 가지 않음(실제 mutation 문구일 때만).
4. **상세**: `docs/cursor-handoffs/COS_vNext13_1_Founder_Kernel_Final_Lock_Default_Deny_Approval_2026-04-03.md`
5. **회귀**: `scripts/test-vnext13-1-founder-kernel-final-lock.mjs` + vNext.13 여섯 스크립트.

## vNext.13 (2026-04-03) — Proposal kernel + approval-orchestrated execution

1. **창업자 표면**: 기본 응답은 `[COS 제안 패킷]`; vNext.13.1부터 구현체는 `runFounderDirectKernel`.
2. **Launch gate**: `launchMinimalWorkContext` 등 `core/founderLaunchGate.js`.
3. **외부 실행**: `pending_approval`이면 디스패치 스킵; 신규 런 기본 pending, 내부/회귀는 `external_execution_auth_initial: 'authorized'` 명시.
4. **Completion**: `truth_reconciliation` 정본 유지.
5. **업무 capability**: `cosCapabilityCatalog.js` + `extractCapabilitiesFromProposalPacket`.
6. **상세**: `docs/cursor-handoffs/COS_vNext13_Founder_Proposal_Kernel_Approval_Orchestrated_Execution_2026-04-03.md`

## vNext.12.1 (2026-04-03) — Founder constitution + single truth closure

1. **창업자**: `app.js`에서 `founderRoute`일 때 첫 번째 블록만 사용 — 그 안에 command/AI router 호출 없음 (`test-vnext12-1-founder-no-command-router.mjs`).
2. **`founderRequestPipeline`**: 오퍼레이터/채널 전용 spine. 창업자 DM은 `runFounderDirectKernel`.
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

`npm test`에 vNext.12.1·vNext.13(여섯 스크립트)·vNext.13.1·**vNext.13.2(여섯 스크립트)** 포함.

## 남은 리스크

- Cursor **strict satisfied**는 handoff+live ref 동시 요구 — 로컬은 대부분 `draft_only`/`partial` until 결과 드롭.
- `executionSpineRouter` 등 일부 PM/슬랙 서픽스는 여전히 `evaluateExecutionRunCompletion`만 사용하나, 런에 truth가 있으면 동일 정본을 공유.
