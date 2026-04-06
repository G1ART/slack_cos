# Release lock — vNext.13.9 (Attachment truth + founder purity) / vNext.13.8 (Founder zero-heuristic) / vNext.13.7 (Founder subtraction) / vNext.13.6 (Slack file intake) / vNext.13.5b (Durable approval lineage hard lock)

기능 추가가 아니라 **창업자 면 preflight** 와 **launch 권한**에 대한 회귀 방지 계약이다. 상위 서사: `docs/FOUNDATION_RESET.md`.

## 1. Founder authority chain (현행)

1. `app.js` `handleUserText`: `founder_route === true` 이면 **`runFounderDirectKernel` 만** (command / AI 라우터 미도달).
2. **대화 파이프라인**: 턴 직전 durable state 로드 → `planFounderConversationTurn` → `mergeStateDeltaWithSidecarArtifactIds` 로 **persist 후보만** 계산 → `tryArtifactGatedExecutionSpine` 은 **`evaluateExecutionSpineEligibility`(pre-turn persisted lineage 만)** 통과 시만 `runFounderLaunchPipelineCore` → 턴 끝에 state persist → **자연어 표면**(`partner_natural_surface`, vNext.13.8).
3. **원문 regex / raw-text launch** 는 프로덕션 경로에 **없음**. 레거시는 `src/legacy/` + `scripts` 회귀만.
4. 오퍼레이터·채널: `founderRequestPipeline` — 창업자 생성 경로와 분리.

## 2. Conversation-state memory

- 주 기억: `founderConversationState` 필드(`latest_proposal_artifact_id`, `latest_approval_artifact_id`, `last_founder_confirmation_at`, `approval_lineage_status` 등).
- **vNext.13.6**: Slack 첨부 인테이크 요약·상태는 `latest_file_contexts[]`(캡 `COS_FOUNDER_FILE_CONTEXT_CAP`)에 append; 스냅샷·플래너 컨텍스트의 `recent_file_contexts`로 노출. **파일 인테이크는 실행·승인 lineage와 별도**이며, 첨부만으로 spine/승인을 열지 않는다.
- **vNext.13.9**: 플래너 `user_message` 에는 **대표 원문만**. 파일 성공 맥락은 `durable_state.latest_file_contexts` / 스냅샷; 실패는 `metadata.failure_notes` → `contextFrame.slack_attachment_failure_notes`. **첨부만·전부 실패** → `attachment_short_circuit_failure` 로 LLM 미호출. `ingestSlackFile`: `[SLACK_FILE_ACQUIRE_TRACE]` · `text/html` Content-Type 조기 실패 · 404 → `not_found`. **`app.js`**: 창업자 경로에서 `버전`/SHA **암시적** `runtime_meta` 선처리 **금지**.
- **vNext.13.8 (역사)**: 단일 자연어 표면·패킷 병합 제거.
- **vNext.13.7 (역사)**: 실패 재주입 금지 방향 — 13.9 에서 본문 재주입 완전 제거.
- Transcript는 보조. **Spine eligibility** 은 “이번 턴 sidecar 가 방금 제안한 lineage”가 아니라 **이미 저장된 pre-turn 행**만 신뢰한다 (same-turn self-authorization 금지).

## 3. Artifact-gated launch

- `execution_artifact.request_execution_spine === true` 이고 필드가 갖춰져도, **`buildPersistedEligibleLineageView(convStateBeforeTurn)` 대조 실패 시 launch 불가**.
- 같은 턴 merged preview 로만 통과할 수 있게 두지 말 것. 우회 시 trace `same_turn_lineage_not_eligible` 등.
- `approval_lineage_confirmed` 같은 **단독 boolean** 만으로는 통과하지 않는다.

## 4. Approval lineage verification

- `approval_lineage_status === 'confirmed'` 및 `last_founder_confirmation_at` 는 **턴 직전 persisted state** 에 있어야 한다.
- execution artifact 의 source id 가 **pre-turn** `latest_*` 와 **문자열 일치**해야 한다 (이번 턴 sidecar 가 새로 쓴 id 만으로는 불가).

## 5. Default-deny external dispatch

- 변경 없음: `external_execution_authorization.state === 'authorized'` 만 허용.

## 6. Operational meta short-circuit

- `metadata.founder_explicit_meta_utility_path === true` 가 아니면 **자동** SHA/Cursor/Supabase 숏서킷 **금지**.

## 7. Staging boundary

- 기본: `COS_FOUNDER_STAGING_MODE !== '0'` 이면 founder 커널 trace에 staging·preflight 표식.
- 문서·코드 모두: **팀 전체 무인 운영은 아직 아님**.

## 8. Forbidden regressions

- 창업자 기본 경로에서 `buildFounderApprovalPacket` 본문 병합·`formatFullFounderProposalSurface`·모델 전 키워드 접두 제거 복구.
- `src/core` 또는 `src/founder` 에서 `legacy/founder` 또는 삭제된 `founderLaunchIntent.js` 경로 import.
- lineage cross-check 우회, **same-turn sidecar merged preview 로 spine 열기**, 또는 raw-text 로 production launch 복구.
- `founder_explicit_meta_utility_path` 없이 운영 메타 자동 매칭 복구.
- 창업자 `user_message` 에 파일 **실패** 문구·`(첨부 처리 안내)` 재주입, 또는 **`app.js` 창업자 경로 `version` 암시 shortcut** 복구.
- 승인 게이트 완화.

## 9. 구버전 서술 폐기

- `founderDirectInboundFourStep`, “결정론 유틸 → launch gate → 제안” 을 **현행 정본**처럼 쓰지 않는다. 현행은 위 1~3절.
