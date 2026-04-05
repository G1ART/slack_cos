# Foundation reset — founder authority (vNext.13.5 / 13.5b)

이 문서는 **창업자(COS 대표) 면**의 권한·기억·실행 연결을 한 페이지로 고정한다. `docs/cursor-handoffs/00_Document_Authority_Read_Path.md` 하위 보조 정본이다.

## 1. 해석 주체

- **창업자 자연어를 앱 코드(정규식·결정론 launch 문구 매칭)가 “의도”로 해석하지 않는다.**
- 맥락 해석은 **COS 플래너(sidecar)** 와 **durable conversation state** 가 담당한다.
- **Transcript**는 보조 기억이며, **structured state**(`founder-conversation-state.json` 등)가 주 기억 축이다.

## 2. Launch / approval / execution 권한

- **Launch(실행 스파인)** 은 **execution artifact**가 유효하고, **approval lineage**가 **이번 턴 이전에 이미 persisted 된 durable state** 와만 대조될 때 허용된다 (vNext.13.5b hard lock).
  - 같은 턴 planner sidecar 의 `state_delta` 및 proposal/approval `_cos_artifact_id` 병합분은 **다음 턴 persist 후보**일 뿐이며, **현재 턴 spine eligibility 근거가 될 수 없다** (`evaluateExecutionSpineEligibility`, `buildPersistedEligibleLineageView`).
  - `source_proposal_artifact_id` / `source_approval_artifact_id` 는 **턴 직전** state의 `latest_proposal_artifact_id` / `latest_approval_artifact_id` 와 일치해야 한다.
  - `last_founder_confirmation_at` 및 `approval_lineage_status === 'confirmed'` 는 **턴 직전 durable 행에 이미 있어야** 하며, 이번 턴 sidecar 가 방금 쓴 값만으로는 불충분하다.
- **Raw founder text만으로 launch 하는 경로는 금지**다. 레거시 raw-text 감지는 `src/legacy/` 회귀 전용이며 프로덕션 import 에서 제외된다.
- **외부 디스패치**는 기존과 같이 `external_execution_authorization.state === 'authorized'` 일 때만 (default-deny 유지).

## 3. 운영 메타 숏서킷

- SHA / Cursor / Supabase 등 운영 질의는 **`metadata.founder_explicit_meta_utility_path === true`** 일 때만 커널 입구에서 결정론 처리한다.
- 그 외 일반 대화는 **conversation pipeline**(플래너·상태)으로 처리한다. **vNext.13.7**: 기본 창업자 **표면 출력**은 자연어(`partner_natural_surface`)이며, `[COS 제안 패킷]` 전개는 **외부 실행 승인이 실제로 필요할 때**만 승인 블록으로 제한된다.

## 3b. 파일 인제스트와 플래너 입력 (vNext.13.7)

- Slack 첨부 **실패**(HTML 대신 받음, 시그니처 불일치 등)는 **플래너 `userText`에 실패 로그를 붙이지 않는다**. `latest_file_contexts`에는 실패 메타만 남기고, 사용자에게는 **한 겹의 짧은 자연어**로만 안내한다.
- **성공**한 추출만 요약 길이 상한을 두어 컨텍스트에 넣는다 (`buildConciseFileContextForPlanner`).
- MIME/확장자 선언보다 **다운로드 바이트 시그니처**를 우선해 오판을 줄인다 (`peekPayloadNature`, `resolveEffectiveKindAfterDownload`).

## 4. Preflight / staging 경계

- 기본 전제: **founder DM 실전형 staging** 까지 허용. `COS_FOUNDER_STAGING_MODE=0` 이 아니면 trace에 `founder_staging_mode: true` 등 preflight 표식이 실린다.
- **팀 전체 무인 운영·broad rollout** 은 이 문서 범위 밖(아직 아님).

## 5. 관련 코드 (참조용)

- `src/founder/founderDirectKernel.js` — 단일 커널.
- `src/founder/founderArtifactGate.js` — lineage 검증 후 `runFounderLaunchPipelineCore`.
- `src/founder/founderArtifactSchemas.js` — `validateExecutionArtifactForSpine`(persisted lineage 전용), `evaluateExecutionSpineEligibility`, `buildPersistedEligibleLineageView`, `buildFounderLineagePreview`(persist 미리보기·진단).
- `src/founder/founderConversationState.js` — durable 필드·`previewMergeFounderConversationState`.
- `src/legacy/founderLaunchIntentRawText.js` — **회귀 전용**, 프로덕션 금지.
