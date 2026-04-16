# COS·하네스 업그레이드 마일스톤 (2026-04-16)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md`, `COS_Phase1_CrossLayer_Envelope_2026-04-15.md`, `COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md`.

**외부 로드맵 SSOT:** `G1_COS_Upgrade_Roadmap_2026-04-14.md` (M1~M10, non-goals). **제품 서술 SSOT:** `WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md`.

**W0 Start Gate (필독·갭 SSOT):** `docs/runtime_required_docs.json` · `scripts/preflight_required_docs.mjs` · `scripts/verify_preflight_ack.mjs` · `ops/README.md` · 갭/워크스트림 본문 `COS_Gap_Register_And_Workstream_Plan_2026-04-15.md`. 의미 있는 패치 전 매니페스트·청크별 ack·`verify:preflight-ack` 권장.

**목표 수준(한 줄):** 같은 Supabase·같은 COS 프로세스 안에서 **워크스페이스·제품·프로젝트·배포** 경계가 **자동·일관**하게 태깅·필터되고, **ledger·스트림·요약**이 같은 식별자 어휘를 쓰며, **Phase 1 봉투** 필드가 코드 경로에 점진 이식된다.

## 구현 스냅샷 (누적)

- **W0 Start Gate (일부):** `docs/runtime_required_docs.json` + `preflight_required_docs.mjs` / `verify_preflight_ack.mjs` + `test-runtime-required-docs-registry.mjs` — 필독 문서 청크·sha256 매니페스트 및 ack 검증(fail-closed); 갭/워크스트림 SSOT `COS_Gap_Register_And_Workstream_Plan_2026-04-15.md`.
- **W1 Tool plane (클로즈아웃):** `dispatchExternalToolCall.js` 는 `runExternalToolInvocationFlow` (`externalToolInvocationFlow.js`) 로만 위임하는 **얇은 진입**; 본문은 동일 파일에 레지스트리·차단·Cursor 레인 import·`runCursorCloudAutomationExecutionBranch` 연결을 유지. Cursor 클라우드/emit_patch/콜백·artifact 폴백 본문은 `toolPlane/lanes/cursor/cursorCloudAutomationPath.js` 및 `cursorEarlyExitBlocks.js`·`cursorEmitPatchAssemblyBlock.js`·`cursorDelegateMerge.js`·`cursorOrchestratorStatusMap.js` 로 분리. `toolsBridge.js` 는 호환 facade; `externalToolLaneRegistry.js` 는 런타임 바인딩 SSOT. 구조 테스트 `test-w1-dispatch-cursor-split-boundary.mjs`. orchestrator_toolplane 프리플라이트: `npm run preflight:orchestrator_toolplane` · `npm run verify:preflight:orchestrator_toolplane` (`w1_remaining_g3_ab500d7`). **harness_runtime** 프리플라이트: `npm run preflight:harness_runtime` · `npm run verify:preflight:harness_runtime` (`harness_w2a_216aa5d`).
- **G1 로드맵 M1 (일부):** `src/founder/canonicalExecutionEnvelope.js` — `mergeCanonicalExecutionEnvelopeToPayload` 가 `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` append 경로(`appendCosRunEvent` / `appendCosRunEventForRun`) 및 `recordCosPretriggerAudit` 에서 env·요청 스코프·**durable run 행(`runTenancy`)** 로 테넄시 + `run_id` / `thread_key` / `packet_id` 빈칸을 채움. 테스트: `scripts/test-canonical-execution-envelope-smoke-payload.mjs`, `scripts/test-canonical-envelope-run-tenancy-merge.mjs`.
- **G1 로드맵 M2 (일부):** `appendCosRunEvent` / `appendCosRunEventForRun` 가 **요약 타입뿐 아니라 전 ledger 이벤트**에 동일 봉투 병합 적용; `cosRunEventEnvelopeMergeCtxFromRun` (`parcelDeploymentContext.js`). Supabase `run_persisted` 직기입도 동일 병합. SQL: `cos_run_events_tenancy_stream` 뷰.
- **G1 로드맵 M3 (일부):** `audit-parcel-ops-smoke-health.mjs` 가 `cos_run_events_tenancy_stream` 샘플로 `ledger_tenancy_workspace_top` 출력.
- **G1 로드맵 M0 (일부):** `slack_team_id` 뷰 컬럼 + 감사 히스토그램 + merge 시 workspace→team 보강.
- **G1 로드맵 M4 (일부):** Phase1 `intent` — `harnessBridge.runHarnessOrchestration` dispatch 결과 + ledger `harness_dispatch` payload. Phase1 `role` — 패킷 `persona` SSOT 동기 `role` 필드.
- **G1 로드맵 M4 (일부·봉투):** Phase1 패킷 `success_criteria` — `runFounderDirectConversation` strict 패킷 스키마 + `specializePacket` sanitize; `delegateHarnessPacketValidate` 가 비문자열 기계 차단.
- **G1 로드맵 M3 (선택·문서):** `package.json` `name` → `COS_PRODUCT_KEY` / `COS_PROJECT_SPACE_KEY` **문서만** 제안 — `COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md` §2.1.
- **G1 로드맵 M6 (일부·관측):** `audit-parcel-ops-smoke-health.mjs` 가 `cos_run_events_tenancy_stream` 샘플에서 `ledger_tenancy_product_top` · `ledger_tenancy_project_space_top` 분포를 JSON에 포함 (기존 `workspace`·`slack_team` 과 동일 패턴).
- **G1 로드맵 M6 (일부·관측):** 동일 스크립트가 **`cos_runs`** 최근 행에서 `runs_tenancy_*` 히스토그램을 추가 (durable 런 축; ledger 스트림과 혼동하지 말 것).
- **G1 로드맵 M6 (일부·감사·RPC):** `audit-parcel-ops-smoke-health.mjs` 가 `cos_runs_recent_by_tenancy` RPC 를 호출해 `runs_tenancy_rpc_*` 필드 노출; workspace/product/project_space CLI 가 없을 때만 테이블 직조회와 건수 정합 비교.
- **G1 로드맵 M6 (일부·supervisor):** `COS_PARCEL_DEPLOYMENT_KEY` 설정 시 `runStoreSupabase` 의 non-terminal·pending-wake·recovery·thread-key 목록에 `parcel_deployment_key` eq; `executionRunStore` 메모리·파일 동일. 테스트 `test-cos-runs-supervisor-lists-parcel-deployment-filter.mjs`.
- **G1 로드맵 M6 (일부·스레드 ledger):** `mergeLedgerExecutionRowPayload` SSOT — `harness_dispatch` / `harness_packet` / **`tool_invocation`·`tool_result`** / **`execution_note`** / **클로저 mirror `tool_result`** 까지 동일 병합; `invoke_external_tool` ctx `runTenancy`·활성 run.
- **G1 로드맵 M2 (일부·하네스 페르소나 계약 평면):** `personaContracts.manifest.json` + `personaContractManifest.js` — `delegate_persona_enum`·검토·에스컬레이션에 더해 **실행용** `allowed_actions`·`allowed_tools`·`required_output_mode`·`required_output_schema`·`review_duty`·`escalation_predicates`(design 포함 6역할, manifest shape fail-closed). `personaContractHarness.js` 가 `delegate_harness_team` 스키마 검증·`runHarnessOrchestration` 수락 직전에 계약 위반 차단; 수락 응답에 `persona_contract_runtime_snapshot` 컴팩트 줄. `read_execution_context` 에 `persona_contract_snapshot_lines`. `formatPersonaContractLinesForInstructions` 유지. 테스트 `test-persona-contract-manifest-w2a.mjs`. (로컬 스냅샷 “G1 M2 … cos_run_events” 는 이벤트 테넄시 별칭.)
- **G1 로드맵 M2 (W2-A closeout, 2026-04-15 지시):** `read_execution_context` 의 `persona_contract_snapshot_lines` 는 `active_run_shell.dispatch_payload`·`execution_summary_active_run`(객체일 때만)·최근 `harness_dispatch`/`harness_packet` ledger payload 의 `persona_contract_runtime_snapshot` 순으로 역추적 (`founderCosToolHandlers.js`). 수락 harness dispatch 메타는 `buildAcceptedPersonaContractMetadata` 로만 조립·필수(`persona_contract_manifest_invalid` 등으로 차단, 선택적 무시 경로 제거). `personaContractHarness.js` 가 harness 경로에서 `required_output_schema` 의 `min_fields` 전부를 기계 검증(`persona_contract_output_schema_invalid`, `persona_contract_output_field_missing`). `activeRunShellForCosExecutionContext` 가 `dispatch_payload` 스냅샷을 노출. 테스트: `test-persona-contract-read-context-snapshot-w2a-closeout.mjs`, `test-persona-contract-output-contract-w2a-closeout.mjs`. 다음: W2-B / G5 워크셀·모드 의미론은 비목표로 보류.
- **G1 로드맵 M2 (W2-B workcell runtime foundation):** `harnessWorkcellRuntime.js` 의 `buildHarnessWorkcellRuntime` — `workcell_id`·`packet_owners`·`review_checkpoints`(review_required 또는 계약 `review_duty===blocking`)·`escalation_state{status,reasons}`·`summary_lines`. `harnessBridge.runHarnessOrchestration` 수락 경로에서 계약 메타 이후 워크셀 빌드 실패 시 `blocked`. `active_run_shell` 이 `dispatch_payload` 의 `workcell_summary_lines`·`workcell_runtime` 노출. `read_execution_context.workcell_summary_lines` 는 활성 런 셸 → 요약 객체 → `harness_dispatch`/`harness_packet` 역순 스캔. 테스트: `test-harness-workcell-runtime-w2b.mjs`, `test-harness-accepted-workcell-persistence-w2b.mjs`, `test-harness-workcell-read-context-w2b.mjs`.
- **외부 G1 M5 Truth stack (일부):** `read_execution_context` 반환 `recent_artifact_spine_distinct` — `distinctSpineKeysFromLedgerArtifacts` 로 최근 ledger payload 에서 스파인·테넄시 문자열 distinct 만 기계 수집 (Supabase 요약과 혼동 금지; COS 내부 깊은 읽기 보조).
- **외부 G1 M5 Truth stack (일부):** `read_execution_context` 반환 `active_run_shell` — `activeRunShellForCosExecutionContext(getActiveRunForThread)` 로 thread 최신 **durable cos_runs** 활성 행의 id·status·stage·dispatch_id·packet ids·테넄시 키·`updated_at` 만 (요약 문장·objective 전문 없음). ledger 한 줄·ops smoke 요약과 **동일 truth 가 아니라 병치**한다.
- **외부 G1 M5 Truth stack (일부):** 동일 도구 반환에 **`tenancy_keys_presence`**·**`parcel_deployment_scoped_supervisor_lists`** (값 없이 불리언만; 부트 `cos_runtime_truth` 와 동일 어휘) — COS 가 운영 슬라이스를 founder 문장과 혼동 없이 확인.
- **외부 G1 M5 Truth stack (일부):** `read_execution_context` 에 **`execution_summary_active_run`**(활성 런 매칭 요약)·**`parcel_ledger_closure_mirror`**(`summarizeParcelLedgerClosureMirrorPresence`) — WHAT 의 “ledger 요약 + closure mirror” 축을 COS 전용 구조화 읽기로 보강.
- **W3-A (truth / tenancy closeout):** `executionContextShell.js`·`executionTenancyGuard.js` 로 활성 런 truth 셸과 durable 경로 **필수 테넄시 4축** 검증을 분리; `persistAcceptedRunShell`·`supabaseInsertRun`·`supabaseAppendRunEvent`·`finalizeRunAfterStarterKickoff`(Supabase append)·`activeRunShellForCosExecutionContext` 가 fail-closed. `read_execution_context` 상단에 `workspace_key`·`product_key`·`project_space_key`·`parcel_deployment_key` 슬라이스. 프리플라이트: `npm run preflight:truth_tenancy` · `npm run verify:preflight:truth_tenancy` (`w3a_truth_tenancy_closeout`). 회귀: `scripts/test-*-w3a-closeout.mjs` 다섯 종.
- **W3-B (truth read-model closeout):** `executionContextReadModel.js` 가 페르소나 스냅샷·워크셀 요약의 **고정 우선순위**(활성 셸 → 요약 객체 → 테넄시 스코프 최근 아티팩트 → 없음)와 **`persona_contract_snapshot_source` / `workcell_summary_source`**·`tenancy_slice`·`artifact_scan_scoped_by_tenancy`·`active_run_truth_source` 를 한곳에서 산출; `founderCosToolHandlers` 는 조립만. 아티팩트 폴백은 `filterArtifactsForReadModelTenancy`(`executionRunStore.js`)로 테넄시 키가 있을 때 충돌 payload 제외. 요약 객체는 `executionContextShell.js` 의 기계 검증으로만 tier 2 허용. 회귀: `scripts/test-execution-context-read-model-*-w3b.mjs` 세 종.
- **W4 (founder surface layer):** `founderSurfaceModel.js` + `founderSurfaceRenderer.js` 가 내부 실행 truth(`activeRunShellForCosExecutionContext` + `buildExecutionContextReadModel` + 최근 ledger 아티팩트)와 COS 모델 산문 사이의 **표면 계층**을 잡는다. 7종 `surface_intent`(`accepted`/`running`/`blocked`/`review_required`/`completed`/`failed`/`informational`)는 `active_run_shell.status` + `workcell_runtime.status` 우선순위로 확정되고, 모델 산문은 그 위에 덮이지 않는다(truth > prose). 렌더러는 상태별 한국어 헤더 한 줄을 모델 본문 앞에 붙이되, 직전 assistant 턴이 같은 헤더로 시작하면 생략(동일 스레드 연속성 규칙). `completed` 시 `artifact_path` 가 있는 최근 `tool_result` 의 basename 만 **산출물 trailer** 로 붙이고, 모델이 이미 언급한 파일명은 중복 출력하지 않는다(C4). `review_required` 시 jargon 이 걸러진 workcell summary 줄만 근거로 붙는다. 내부 토큰(`run_id`/`packet_id`/`emit_patch`/`lease`/`callback` 등) 누수는 `looksLikeRuntimeJargon` 로 필터. 통합 지점: `runFounderDirectConversation` 종료 직전에 surface 모델을 만들어 렌더; `sendFounderResponse` 는 운송 유지(C5). 프리플라이트: `npm run preflight:founder_surface` · `npm run verify:preflight:founder_surface` (`w4_founder_surface_epic`). 회귀 8종: `scripts/test-founder-surface-{accepted,blocked,review-required,completed,failed,same-thread-continuity,no-internal-jargon,truth-over-model-prose}.mjs`. **비목표(로드맵 유지):** 다중 봇 founder, 워크플로 엔진, 콜백/테넄시 코어 재개방, W5/W6 스핀업·번들은 열지 않는다.
- **W4 closeout (truth precedence · run-scoped trailer):** 두 가지 정확성 갭을 닫는다. **Gap A** — `resolveFounderSurfaceIntent` 가 결정적 순서(workcell `failed`/`blocked`/`escalated`/`review_required`/`rework_requested`·`escalation_open=true` → shell status → hint → informational)로만 intent 를 고른다. authority rank 혼합을 제거해 `active_run_shell.status='completed'` 가 workcell 의 blocked/review_required 를 **절대** 덮지 못한다. **Gap B** — `runFounderDirectConversation` 가 `buildFounderSurfaceModel` 에 아티팩트를 넣기 전에 `scopeArtifactsToActiveRun(artifacts, activeRow)` 로 `executionArtifactMatchesRun` 을 거쳐 **현재 활성 런** 행만 남긴다. run 식별이 없으면 기존 스레드 스코프 fallback. `sendFounderResponse` 는 건드리지 않음(운송 유지). **Gap C** — blocked/review_required/completed 회귀가 **W2-B 실제 shape**(`status`·`packets[]`·`summary_lines`·`escalation_open`·`escalation_targets`) 를 1차 경로로 사용하고, 레거시 `escalation_state.reasons` 는 호환 fallback 으로만 유지. `looksLikeRuntimeJargon` 은 `workcell:`·`packet persona:id`·`tool=`·`action=`·`personas=`·`packets=` 등 W2-B 구조화 summary 헤더까지 차단. 신규 회귀 3종: `scripts/test-founder-surface-workcell-blocked-overrides-completed-shell.mjs`, `scripts/test-founder-surface-workcell-review-required-overrides-completed-shell.mjs`, `scripts/test-founder-surface-completed-trailer-is-active-run-scoped.mjs`.

---

## 번호 정리 (혼동 방지)

- 이 파일의 **M0~M6** 표기는 **COS·하네스 업그레이드 마일스톤(로컬 번호)** 이다.
- **`G1_COS_Upgrade_Roadmap_2026-04-14.md` 의 M5 = Truth stack v2** 는 위 구현 스냅샷의 **“외부 G1 M5”** 줄로 추적한다 (로컬 “M5 — 하네스·COS 경계” 와 **다른 축**).

### 외부 G1 M5 — Truth stack v2 (이 레포 진행 상황)

| 신호 (로드맵 exit) | 상태 |
|-------------------|------|
| ledger-first founder 연속성 | 헌법·기존 `[최근 실행 아티팩트]` 경로 유지 |
| 깊은 점검용 구조화 context read | `read_execution_context` + `recent_artifact_spine_distinct` + **`active_run_shell`** |
| Supabase = 운영 truth | 기존 smoke/이벤트 스트림·감사; 도구 반환과 **문장·필드 동일화하지 않음** |
| anti-conflict 회귀 | 스냅샷 정합 테스트 (`test-truth-stack-active-run-shell` 등); founder 슬랙 본문 런타임 검열은 비목표 |

**Non-goals (로드맵 인용):** 감사 row 를 Slack 자연어에 직접 붓지 않는다. 매 founder 턴마다 깊은 운영 상태를 긁지 않는다.

---

## 축 정의 (무엇을 “완료”로 볼지)

| 축 | 완료 정의 |
|----|-----------|
| **A. 테넄시 깊이** | 스트림·`cos_runs`를 넘어 **cos_run_events·핵심 ledger 메타**에도 동일 네 키(또는 payload 동등물)가 **누락 없이** 들어가고, 요약/감사가 한 축으로 자른다. |
| **B. Slack 자동 워크스페이스** | `COS_WORKSPACE_KEY` 미설정 시 **Slack `team`/`team_id`** 로부터 안전하게 `workspace_key` 후보를 채우거나, 명시적 “env 우선” 규칙으로 병합한다. |
| **C. Phase 1 봉투** | `intent` / `role` / `success_criteria` 등이 **새 코드 경로**에서 이 표 이름으로만 추가된다 (헌법 자연어와 병행). |
| **D. 택배사무소(운영)** | 멀티 프로젝트가 “자동”이라 함은 **수동 env 분기 없이** 기본 슬라이스가 잘리거나, **한 프로세스·한 봇** 전제에서 팀 단위 태깅이 일관된다는 뜻으로 단계 정의. |
| **E. 하네스** | delegate·콜백 권위·live-only 가드는 유지; **봉투 필드**와 하네스 패킷 메타의 **정합 검증**(테스트·fixture)을 늘린다. |

---

## 마일스톤 (순서 고정 — 앞 단계가 뒤의 전제)

### M0 — 관측 가능성 (낮은 위험, 즉시)

- [x] 부트 `cos_runtime_truth.tenancy_keys_presence` (값 미노출).
- [x] **Slack 수신 로그에 `slack_team_id` 노출** (`team` / `team_id` — PII 아님, 공개 Team ID). 구현: `slackEventTenancy.js`, `handleFounderSlackTurn`.
- [x] 동일 정보를 **ops_smoke / pretrigger** 등 “한 줄 진단”에 선택 반영: `mergeCanonicalExecutionEnvelopeToPayload` 가 `workspace_key`≈팀 ID 형태일 때 `slack_team_id` 보강; `cos_ops_smoke_summary_stream`·`cos_run_events_tenancy_stream` 뷰에 `slack_team_id` 열; `audit-parcel-ops-smoke-health` 의 `smoke_slack_team_top` / `ledger_slack_team_top`.

**완료 기준:** Railway에서 턴 단위로 **어느 Slack 워크스페이스인지** 로그만으로 구분 가능.

### M1 — 동적 `workspace_key` (핵심 “멀티” 1단계)

- [x] **정본 봉투 코드 SSOT:** `canonicalExecutionEnvelope.js` (`mergeCanonicalExecutionEnvelopeToPayload`) 도입; 요약 이벤트 append·pretrigger 경로에서 공통 병합 사용.
- [x] **규칙 SSOT:** `COS_WORKSPACE_KEY` 가 비어 있을 때만 `sanitize(slack_team_id)` 를 `workspace_key` 로 사용; env가 있으면 **env 우선** (운영 단일 팀은 기존과 동일). 코드: `workspaceKeyFromRequestScopeFallback` + `applyCosRunTenancyDefaults` / `appRunToDbRow` + `mergeCanonicalExecutionEnvelopeToPayload`.
- [x] **전달 경로(1차):** `requestScopeContext`(AsyncLocalStorage) + `handleFounderSlackTurn` → `mergeCanonicalExecutionEnvelopeToPayload` 에서 `slack_team_id`/`workspace_key` 병합.
- [x] **전달 경로(2차):** 스레드 외 경로(웹훅/백그라운드)에서 ALS 없을 때 `cos_runs` 행 테넄시를 `mergeCanonicalExecutionEnvelopeToPayload(..., { runTenancy })` 및 `appendCosRunEvent`/`appendCosRunEventForRun` 요약 병합에 반영.
- [x] **테스트:** 단위 + 최소 1개 통합(메모리 스토어) — `scripts/test-canonical-envelope-run-tenancy-merge.mjs`.

**완료 기준:** env 없이도 **해당 팀으로 태그된** ops smoke / cos_runs 샘플이 요약 필터 `--workspace-key=T…` 와 맞는다.

### M2 — ledger·이벤트 전 구간 테넄시

- [x] `appendCosRunEvent` / `appendCosRunEventForRun` 에서 **모든 이벤트 타입** payload 에 테넄시·스파인 키 병합(`mergeCanonicalExecutionEnvelopeToPayload` + `cosRunEventEnvelopeMergeCtxFromRun`). 스트림 뷰와 동일 env·스코프·행 우선순위.
- [x] **중복 제거(append ctx):** `cosRunEventEnvelopeMergeCtxFromRun` — 행→merge ctx 단일화; env·요청 스코프는 `canonicalExecutionEnvelope` + `workspaceKeyFromRequestScopeFallback` SSOT 유지.
- [x] **뷰/마이그레이션:** `public.cos_run_events_tenancy_stream` — payload 우선·`cos_runs` coalesce 표현 컬럼 (테이블 열 추가 없음). JS SSOT: `COS_RUN_EVENTS_TENANCY_STREAM_VIEW`.

**완료 기준:** `summarize` / Supabase 직접 쿼리에서 **ledger 이벤트만**으로도 배포·워크스페이스 슬라이스 가능.

### M3 — 택배사무소 “자동 슬라이스” 운영

- [x] `audit-parcel-health` **ledger 테넌시 샘플**: `cos_run_events_tenancy_stream` 최근 N건 `workspace_key`·`product_key`·`project_space_key` 분포(`ledger_tenancy_workspace_top` 등). 뷰 미적용 시 advisory. (`tenancy_keys_presence`는 기존 부트 유지.)
- [x] (선택) **제품/프로젝트** 기본값: 레포 `package.json` name → `COS_PRODUCT_KEY` 기본 제안은 **문서만** (`COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md` §2.1), 코드 기본값은 팀 합의 후.

**완료 기준:** 온콜이 **env 없이**도 “어느 팀/배포가 깨졌는지” 5분 안에 좁힌다.

### M4 — Phase 1 봉투 코드 이식 (점진)

- [x] `intent` (짧은 기계 라벨) — **하네스 dispatch 한 경로**에만 1필드 추가 + 테스트 (`runHarnessOrchestration`, `deriveHarnessDispatchIntent`).
- [x] `role` — 패킷 메타: **SSOT = `persona`** (OpenAI strict), 런타임 출력에 `role` 동일 복제 (`harnessBridge.specializePacket`).
- [x] 문서 `COS_Phase1_CrossLayer_Envelope` 표와 **필드명 diff 없음** (§3 `intent`/`role` SSOT 열·코드 정렬).

**완료 기준:** 새 PR이 “이름 임의 생성” 대신 표의 키만 쓴다.

### 로컬 M5 — 하네스·COS 경계 (통제 아님, 품질; **외부 G1 M5 Truth stack 과 별개**)

- [x] **불필요한 추상 금지:** 범용 “테넌시 매니저” 클래스 추가 없이, 기존 `parcelDeploymentContext` + 소량 헬퍼로 유지 (본 패치도 동일).
- [x] **회귀:** `npm test` + `verify:parcel-post-office` CI 고정; (주간) Slack 스모크 1턴은 **사람 개입** 유지(자동화 대상 아님).

### M6 — G1 테넌시 데이터 플레인 (로드맵; 단계적)

- [x] (일부) **Ledger 샘플 축 확장:** `npm run audit:parcel-health` JSON에 `product_key` / `project_space_key` 상위 분포 추가 (`ledger_tenancy_product_top`, `ledger_tenancy_project_space_top`). 뷰 `cos_run_events_tenancy_stream` 컬럼 재사용, DDL 변경 없음.
- [x] (일부) **실행 ledger 하네스 행:** 스레드 `appendExecutionArtifact` 경로의 `harness_dispatch`·`harness_packet` payload 에 정본 봉투 병합 (`canonicalExecutionEnvelope` + 활성 `cos_runs` 테넄시 힌트).
- [x] (일부·관측) **`cos_runs` 테넄시 히스토그램:** `audit-parcel-ops-smoke-health.mjs` JSON에 `runs_tenancy_sample_size`, `runs_tenancy_workspace_top`, `runs_tenancy_product_top`, `runs_tenancy_project_space_top`, `runs_tenancy_deployment_top` — 스트림 필터·`filterRowsByOptionalTenancyKeys` 와 동일 스코프로 최근 durable 행 샘플 집계 (ledger 분포와 병치; DDL 없음).
- [x] (일부·RPC) **`cos_runs_recent_by_tenancy`:** 마이그레이션 `*_cos_runs_recent_by_tenancy_rpc.sql` — 선택 테넄시 키·limit(1–500)로 최근 `cos_runs` 행 반환; `runStoreSupabase.js` `COS_RUNS_RECENT_BY_TENANCY_RPC` SSOT; 테스트 `scripts/test-cos-runs-recent-by-tenancy-rpc-ssot.mjs`. (운영 적용은 DDL 배포.)
- [x] (일부·감사 연결) **`audit-parcel-ops-smoke-health.mjs`** 가 `supabaseRpcCosRunsRecentByTenancy` 로 RPC 호출해 `runs_tenancy_rpc_*` 및(가능 시) 테이블 직조회 건수 정합 — founder 경로 아님, 운영 가시성만.
- [x] (런타임·배포 슬라이스) **`COS_PARCEL_DEPLOYMENT_KEY`** 가 비어 있지 않을 때 `runStoreSupabase` 의 supervisor·복구·스레드 키 목록 조회에 `parcel_deployment_key` **eq** 적용; `executionRunStore` 메모리·파일 경로 동일. 레거시 null 행은 해당 프로세스에서 제외(가이드 §5.3).
- [x] **M6 (로컬 번호) 완료:** RPC·감사·ledger 병합·supervisor 배포 슬라이스까지 로드맵 M6 “데이터 플레인 slice” 현 단계 목표 충족. 추가 뷰/타 테이블 확장은 별도 에픽에서 합의 후.

---

## 의존 관계 (요약)

```
M0 → M1 (관측 없이 동적 키 넣으면 디버깅 지옥)
M1 → M2 (요청 스코프 규칙이 ledger에도 같아야 함)
M2 → M3 (운영 도구가 데이터를 소비)
M4 는 M1~M2 와 병렬 가능하나, 같은 PR에 섞지 말 것 (리뷰 부담)
```

---

## 사용자 개입이 필요한 지점 (멈춤 규칙)

- **운영 Supabase DDL** 적용·롤백.
- **Slack 실제 1턴**·Cursor Cloud **유료** live.
- **팀 합의:** `product_key` / `project_space_key` 기본 문자열 표.

---

## Owner actions

- 이 파일을 이슈/PR 상단에 링크.
- M0 완료 후 M1 착수; M1 설계 확정 시 `COS_Inbound_Routing` 또는 실행 경로 핸드오프 한 줄 갱신.
