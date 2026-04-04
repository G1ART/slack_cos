# Release lock — vNext.13.5 (Founder preflight / staging gate)

기능 추가가 아니라 **창업자 면 preflight** 와 **launch 권한**에 대한 회귀 방지 계약이다. 상위 서사: `docs/FOUNDATION_RESET.md`.

## 1. Founder authority chain (현행)

1. `app.js` `handleUserText`: `founder_route === true` 이면 **`runFounderDirectKernel` 만** (command / AI 라우터 미도달).
2. **대화 파이프라인**: durable state → `planFounderConversationTurn` → `tryArtifactGatedExecutionSpine`(lineage 통과 시만 `runFounderLaunchPipelineCore`) → 제안·승인 표면.
3. **원문 regex / raw-text launch** 는 프로덕션 경로에 **없음**. 레거시는 `src/legacy/` + `scripts` 회귀만.
4. 오퍼레이터·채널: `founderRequestPipeline` — 창업자 생성 경로와 분리.

## 2. Conversation-state memory

- 주 기억: `founderConversationState` 필드(`latest_proposal_artifact_id`, `latest_approval_artifact_id`, `last_founder_confirmation_at`, `approval_lineage_status` 등).
- Transcript는 보조. 실행 요청은 **state + sidecar `_cos_artifact_id`** 와 **cross-check** 된 경우만 유효.

## 3. Artifact-gated launch

- `execution_artifact.request_execution_spine === true` 이고 `goal_line` / `locked_scope_summary` / `source_proposal_artifact_id` / `source_approval_artifact_id` 가 갖춰져도, **lineagePreview 대조 실패 시 launch 불가**.
- `approval_lineage_confirmed` 같은 **단독 boolean** 만으로는 통과하지 않는다.

## 4. Approval lineage verification

- `approval_lineage_status === 'confirmed'` 및 `last_founder_confirmation_at` 존재 필요.
- execution artifact 의 source id 가 state·sidecar 의 최신 아티팩트 id 와 **문자열 일치**해야 한다.

## 5. Default-deny external dispatch

- 변경 없음: `external_execution_authorization.state === 'authorized'` 만 허용.

## 6. Operational meta short-circuit

- `metadata.founder_explicit_meta_utility_path === true` 가 아니면 **자동** SHA/Cursor/Supabase 숏서킷 **금지**.

## 7. Staging boundary

- 기본: `COS_FOUNDER_STAGING_MODE !== '0'` 이면 founder 커널 trace에 staging·preflight 표식.
- 문서·코드 모두: **팀 전체 무인 운영은 아직 아님**.

## 8. Forbidden regressions

- `src/core` 또는 `src/founder` 에서 `legacy/founder` 또는 삭제된 `founderLaunchIntent.js` 경로 import.
- lineage cross-check 우회 또는 raw-text 로 production launch 복구.
- `founder_explicit_meta_utility_path` 없이 운영 메타 자동 매칭 복구.
- 승인 게이트 완화.

## 9. 구버전 서술 폐기

- `founderDirectInboundFourStep`, “결정론 유틸 → launch gate → 제안” 을 **현행 정본**처럼 쓰지 않는다. 현행은 위 1~3절.
