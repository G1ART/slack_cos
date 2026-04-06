# COS Slack — 운영 핸드오프 (요약)

**정본 읽기 순서**: `docs/cursor-handoffs/00_Document_Authority_Read_Path.md` → `docs/FOUNDATION_RESET.md` → `docs/RELEASE_LOCK.md`

## vNext.13.10 (2026-04-06) — Founder natural surface subtraction (no planner body)

**목적**: 슬랙 창업자 표면에서 **planner JSON의 `natural_language_reply`를 완전히 배제**하고, **항상 `runCosNaturalPartner`(단일 COS 대화)** 만이 본문을 쓴다. structured planner는 sidecar·실행 게이트·trace만. Council/섹션형 응답은 모델이 플래너에서 생성해도 **사용자에게는 절대 노출되지 않음**. 테스트: `scripts/test-vnext13-10-founder-natural-surface-harness.mjs`. 상세: `docs/cursor-handoffs/COS_vNext13_10_Founder_Natural_Surface_Subtraction_2026-04-06.md`.

## vNext.13.9 (2026-04-01) — Attachment truth pass / founder surface purity closure

**목적**: 첨부 **acquisition 단계 진실 기록**, 플래너 `user_message` 는 **대표 원문만**, 실패는 `failure_notes`·`contextFrame.slack_attachment_failure_notes` 만. **첨부만·전부 실패** → LLM 없이 one-shot 실패 응답. **structured_llm** 경로도 `sanitizePartnerNaturalLlmOutput` 동일 강도. **`app.js`** 창업자 경로에서 **`버전`/SHA 암시적 `runtime_meta` 선처리 제거**(비창업자만 즉시 메타). **`sendFounderResponse`**: `partner_natural_surface` 최종 thin sanitize + `founder_outbound_purity_adjusted` trace.

**회귀**: `scripts/test-vnext13-9-*.mjs` (8종, `npm test` 포함). **상세**: `docs/cursor-handoffs/COS_vNext13_9_Attachment_Truth_Founder_Purity_2026-04-01.md`.

## vNext.13.8 (2026-04-01) — Founder zero-heuristic reset / 단일 자연어 표면

**목적**: 앞단 **내용 해석·패킷 표면 병합·파일 실패 조기 분기**를 걷어내고, 창업자 경로를 **transport + boundary + 단일 COS 턴**에 가깝게 고정한다.

**핵심**: (1) `runFounderDirectKernel` 기본 경로는 **정규화된 원문 그대로** 플래너에 전달(접두 제거 없음). (2) **표면은 항상** `partner_natural_surface` 텍스트(`natural_language_reply`); 승인 패킷 본문 병합(`buildFounderApprovalPacket`) **제거** — 외부 실행 후보는 `trace.approval_packet_attached` / `external_dispatch_candidate` 로만 표시. (3) `founder_hard_recover` 는 제안 패킷 대신 **짧은 안전 폴백**. (4) Slack 파일: **vNext.13.9**부터 턴 조립은 `buildFounderTurnAfterFileIngest` (`modelUserText` + `failure_notes` 메타). (5) `founderOutbound` 금지 마커는 **`[COS 제안 패킷]`** 계열만 최소 유지 + **vNext.13.9** thin sanitize. (6) 운영 메타 숏서킷은 여전히 **`founder_explicit_meta_utility_path` 전용**.

**회귀**: `scripts/test-vnext13-8-*.mjs` (6종, `npm test` 포함). **상세**: `docs/cursor-handoffs/COS_vNext13_8_Founder_Zero_Heuristic_2026-04-01.md`.

## vNext.13.7 (2026-04-05) — Founder path subtraction / 대화 순도

**목적**: 규칙 추가가 아니라 **중간층 제거**. 창업자 면은 슬랙 안 **자연어 GPT 수준**을 목표로, 파일 실패·일반 대화가 패킷/페르소나 구조로 샐 때를 끊는다.

**핵심**: (1) 파일 인제스트 **실패**는 `combinedText`로 플래너에 넣지 않고 **짧은 실패 응답만**(`founderSlackFileTurn`, `partner_natural_surface`). (2) **성공** 파일만 `buildConciseFileContextForPlanner`로 요약 주입(전문 덤프 금지). (3) `slackFileIntake`: 다운로드 후 **`peekPayloadNature` / `resolveEffectiveKindAfterDownload`** 로 PDF·PNG·DOCX 시그니처 우선(HTML 미리보기·MIME 오판 완화). (4) `founderDirectKernel`: 기본 응답은 **`natural_language_reply`만**; **외부 실행 후보가 있을 때만** 승인 블록(`buildFounderApprovalPacket`). (5) `sendFounderResponse`: `partner_natural_surface` 등에 **금지 마커** 스캔(최후 안전망).

**회귀**: `scripts/test-vnext13-7-*.mjs` (6종, `npm test` 포함). **상세**: `docs/cursor-handoffs/COS_vNext13_7_Founder_Path_Subtraction_2026-04-05.md`.

## vNext.13.6 (2026-04-01) — Slack 파일 인테이크 (Founder DM/멘션 수직 슬라이스)

**목적**: 창업자 DM·멘션에서 **DOCX / PDF(text) / PNG(vision)** 첨부를 다운로드·추출하고, 실행·승인과 분리된 **`durable_state.latest_file_contexts[]`** 에 누적한다.

**핵심**: `ingestSlackFile` + `extractMvpFileFromBuffer`(회귀용); PNG는 `summarizePngBufferForFounderDm`(`COS_FOUNDER_IMAGE_MODEL`, `OPENAI_API_KEY`); 용량 `COS_FOUNDER_FILE_MAX_BYTES`(기본 15MB); 보관 상한 `COS_FOUNDER_FILE_CONTEXT_CAP`(기본 10). 실패 시 `formatFileIngestError` 한국어 안내. 인제스트 직후 `mergeFounderConversationState`; 컨텍스트에 파일 프리앰블 + 추출 본문을 붙여 `handleUserText`로 전달(파일만 올린 DM도 응답 가능).

**회귀**: `scripts/test-vnext13-6-*.mjs` (6종, `npm test` 포함). **상세**: `docs/cursor-handoffs/COS_vNext13_6_Slack_File_Intake_Founder_DM_2026-04-01.md`.

## vNext.13.5 (2026-04-04) — Preflight hardening / staging gate lock

**목적**: founder DM **실전형 staging** 직전 하드닝 (새 기능 아님).

**잠금 요약**: (1) 운영 메타 숏서킷은 `founder_explicit_meta_utility_path === true` 만. (2) raw-text launch 는 `src/legacy/` 회귀 전용, 프로덕션 import 0. (3) launch 는 execution artifact + **durable lineage cross-check**. (4) trace `founder_staging_mode` (기본 on, `COS_FOUNDER_STAGING_MODE=0` 로 끔). (5) `docs/FOUNDATION_RESET.md` + 본 릴리스 락 갱신.

**회귀**: `scripts/test-vnext13-5-*.mjs`. **비목표**: 팀 전체 무인 운영.

## vNext.13.5b (2026-04-04) — Durable approval lineage hard lock

**목적**: 같은 턴 planner sidecar 가 lineage+execution 을 한꺼번에 써서 spine 을 열 수 없게 **최종 하드락**.

**핵심**: spine eligibility 는 **`convStateBeforeTurn` persisted 필드만** (`evaluateExecutionSpineEligibility` / `buildPersistedEligibleLineageView`). `mergeStateDeltaWithSidecarArtifactIds` 는 **persist 후보** 전용. 차단 시 trace: `founder_spine_eligibility_reason` (`same_turn_lineage_not_eligible`, `lineage_only_in_sidecar_delta`, `lineage_requires_persisted_confirmation` 등).

**회귀**: `scripts/test-vnext13-5b-*.mjs`, 갱신된 `test-vnext13-5-approval-lineage-crosscheck.mjs`. **레거시 raw-text·launch 회귀**: `npm run test:legacy-launch-regression` (`test-founder-launch-gate.mjs` — 기본 `npm test` 에서 분리).

## vNext.13.3 (2026-04-01) — Release lock / founder contract hardening

**목적**: 기능 확장이 아니라 창업자 단일 진입·승인·truth completion·advisory 부록을 **회귀하기 어렵게 고정**.

**잠근 것**

1. **Founder entry SSOT**: `src/founder/founderRouteInvariant.js` — `app.js`·`runInboundAiRouter.js`만 사용.
2. **제안 계약**: `proposal_execution_contract` (`COS_ONLY` / `APPROVAL_REQUIRED` / `EXECUTION_READY`) + `proposal_contract_trace.reasons`; 모호한 “시작/진행”·짧은 PR/배포만으로 외부 실행 태스크 생성 억제; 활성 런 맥락의 승인 캐리 문구는 유지.
3. **Completion**: `founderTruthClosureWording.js` + 결정론 유틸의 “끝났나?” — `truth_reconciliation` 없으면 완료 단정 금지; 오퍼레이터 status 패킷도 동일 문구 축 사용(`founderRequestPipeline`).
4. **Advisory**: 기본 off (`COS_GOVERNANCE_ADVISORY=1` 아니면 null); 제안·승인 등 표준 서피스에서 부록 금지; 단위 테스트 전용 표면만 허용.
5. **문서 정본**: `docs/RELEASE_LOCK.md` (불변식·금지 회귀 목록).

**남은 리스크 (릴리스 블로커 아님 — 실사용 검증 단계)**

- 스코프 락 휴리스틱은 여전히 **문자 기반**; 매우 교묘한 실행 회피/강제 문장은 실슬랙에서 드물게 어긋날 수 있음.
- Partner natural 보강 LLM은 계약 밖 변형 가능 — sanitize·패킷 골격은 유지하나 문장 품질은 모델 의존.
- Cursor strict satisfied 등 **프로바이더별** 세부는 로컬에서 대부분 draft/partial.

**슬랙 실사용에서 볼 것**

- DM/멘션에서 command·협의모드 흔적 없이 제안 패킷만 나오는지.
- 외부 실행이 필요해 보일 때만 승인 섹션이 붙는지; 짧은 “진행해”만으로 승인 패킷이 안 뜨는지.
- “끝났나?”에 대해 정본 없을 때 **미완료·정본 대기**로 답하는지.

**다음 단계**: 기능 빌드보다 **usage validation**(위 관측) 우선. 상세: `docs/RELEASE_LOCK.md`, `docs/cursor-handoffs/COS_vNext13_3_Release_Lock_Founder_Contract_2026-04-01.md`.

## vNext.13.2 (2026-04-03) — Launch gate purification + harness constitution + E2E dress rehearsal

1. **Launch gate**: `founderLaunchGate.js`는 `evaluatePolicy` / `renderFounderSurface` 없음. 창업자 텍스트는 `founderLaunchFormatter.js`·`founderLaunchApprovalPacket.js`만.
2. **Harness**: `harnessAgentCharters.js` 등 13 에이전트 헌법, 오버랩·리뷰·에스컬레이션·`harnessSkillsRegistry.js` 스킬 패킷.
3. **제안·승인**: 맥락 우선 제안 커널; 승인 패킷 결제 표면 확장; `holdExternalExecutionForRun` → `draft_only`.
4. **문서**: `docs/harness-constitution.md`, `docs/harness-review-matrix.md`, `docs/harness-skills-registry.md`, `docs/cos-governance-advisory.md`, `docs/approval-escalation-policy.md`, `docs/cursor-handoffs/COS_vNext13_2_COS_Autonomy_Harness_Governance_2026-04-03.md` (구 E2E 메모는 `COS_vNext13_2_Launch_Gate_Purification_…` 참고)
5. **회귀**: `test-vnext13-2-launch-gate-purification`, `default-deny-approval`, `proposal-softening`, `cos-governance-advisory`, `harness-charters`, `harness-review-matrix`, `skills-registry`, `slack-e2e-dress-rehearsal` + vNext.13.1 여섯.
6. **정본 메모**: `docs/cursor-handoffs/COS_vNext13_2_COS_Autonomy_Harness_Governance_2026-04-03.md` (COS 자율 vs 하네스 거버넌스·어드바이저리).

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

`npm test`에 vNext.12.1·vNext.13(여섯)·vNext.13.1·**vNext.13.2(여덟)**·**vNext.13.3(넷: single-entry / ambiguous / advisory-budget / status-closure)** 포함.

## 남은 리스크

- Cursor **strict satisfied**는 handoff+live ref 동시 요구 — 로컬은 대부분 `draft_only`/`partial` until 결과 드롭.
- `executionSpineRouter` 등 일부 PM/슬랙 서픽스는 여전히 `evaluateExecutionRunCompletion`만 사용하나, 런에 truth가 있으면 동일 정본을 공유.
