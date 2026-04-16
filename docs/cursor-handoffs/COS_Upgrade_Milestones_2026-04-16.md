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
- **W5-A (failure taxonomy + HIL):** `src/founder/failureTaxonomy.js` 가 8종 `resolution_class` SSOT(`hil_required_external_auth` / `hil_required_subscription_or_billing` / `hil_required_policy_or_product_decision` / `technical_capability_missing` / `runtime_bug_or_regression` / `provider_transient_failure` / `model_coordination_failure` / `tenancy_or_binding_ambiguity`)와 `human_gate_required`·`retryable` 유도 규칙을 고정한다. `externalToolLaneRegistry.classifyToolInvocationPrecheck` 가 기존 lane precheck 결과를 감싸 `LANE_STATIC_RESOLUTION_HINTS`(github/supabase/railway) + 휴리스틱으로 `failure_classification` 을 덧댄다(기존 shape 보존). `harnessWorkcellRuntime.buildHarnessWorkcellRuntime` 은 `classifyWorkcellRuntime` 으로 `review_required`/`escalated`/`rework_requested` 를 `model_coordination_failure` 로 분류하고, 생성 실패는 `blockedConstruction` 헬퍼로 동일 분류를 담보. `founderSurfaceModel` 은 `human_gate_required`/`human_gate_reason`/`human_gate_action` 슬라이스만 노출하고, `founderSurfaceRenderer` 는 `blocked`/`review_required` 에 한해 **“다음 조치: …”** 트레일러를 덧붙이되 모델 본문에 이미 있는 문구는 중복하지 않는다(`modelMentionsPhrase`). `resolution_class` 토큰은 founder 텍스트·surface 모델 어느 곳에도 새지 않는다. 프리플라이트: `npm run preflight:failure_taxonomy` · `npm run verify:preflight:failure_taxonomy`. 회귀 5종: `scripts/test-failure-taxonomy-ssot.mjs`, `test-tool-lane-precheck-emits-classification.mjs`, `test-harness-workcell-blocked-classifies.mjs`, `test-founder-surface-human-gate-line.mjs`, `test-founder-surface-resolution-class-not-exposed.mjs`.
- **W5-B (project-space binding graph + human gate lifecycle):** `supabase/migrations/20260501120000_project_space_binding_graph.sql` 이 `project_spaces`(project_space_key PK + 테넄시 3축) / `project_space_bindings`(binding_kind ENUM 6종: repo_binding·default_branch·cursor_root·db_binding·deploy_binding·env_requirement) / `project_space_human_gates`(gate_kind ENUM 5종·gate_status ENUM 3종·open→resolved|abandoned) 를 RLS **service_role only** 로 선언. 앱 측 SSOT `src/founder/projectSpaceBindingStore.js` 는 Supabase 사용 가능 시 service_role 클라이언트를, 아니면 in-memory fallback 로 `getProjectSpace`·`upsertProjectSpace`·`recordBinding`·`listBindingsForSpace`·`openHumanGate`·`closeHumanGate`·`listOpenHumanGates` 를 제공. `src/founder/toolPlane/lanes/projectSpaceLane.js` 는 6종 action(`bind_repo`/`bind_deploy`/`bind_db`/`declare_env_requirement`/`open_human_gate`/`close_human_gate`)과 W5-A classifier precheck, 그리고 `declare_env_requirement.binding_ref` 에 값(secret) 저장을 차단하는 `detectEnvValueLeak` 가드(JWT·URL·KEY=VALUE·AWS AKIA 패턴·NAME 형식 미준수 거부)를 둔다. `ALLOWED_EXTERNAL_TOOLS` 에는 등록하지 않아 OpenAI tool-call 로 외부 조작은 차단. `read_execution_context` 상단에 `active_project_space` 슬라이스(`bindings_compact_lines`·`open_human_gates_compact_lines`·카운트) 가 `loadActiveProjectSpaceSlice(rm.project_space_key)` 로 병치된다(내부 truth; 기존 응답 shape 보존). 프리플라이트: `npm run preflight:project_space_binding` · `npm run verify:preflight:project_space_binding`. 회귀 4종: `scripts/test-project-space-binding-graph-schema.mjs`, `test-project-space-binding-store-memory-roundtrip.mjs`, `test-project-space-lane-precheck-and-env-guard.mjs`, `test-active-project-space-slice.mjs`. **비목표:** 오케스트레이션 순서 하드코딩·워크플로 엔진·고객 배포 패키징·BYO keys·founder 본문에 resolution_class 토큰 노출·env 값(secret) 저장.
- **W6-A (scenario proof harness):** `scripts/scenario/scenarioProofEnvelope.js` 를 ScenarioProofEnvelope SSOT 로 고정한다. 스키마 v1 은 `scenario_id`·`outcome`(`success`/`partial_success`/`failed`)·`break_location`(6종 enum)·`human_gate_required`·`resolution_class`(W5-A 재사용) + 델리버러블/바인딩/크로스프로젝트 오염 여부 플래그 집합을 강제하며, `toFounderCompactLines` 는 내부 jargon(`resolution_class`·`break_location` 토큰 등) 이 founder 표면으로 새지 않도록 **문장만** 반환한다. 러너 2종: `scripts/scenario/run-scenario-1-multi-project-spinup.mjs` (project_space A/B 를 동시에 선언 → repo·deploy·db·env 바인딩 누락 탐지 → human gate 자동 생성 경로·크로스 프로젝트 오염 감지), `scripts/scenario/run-scenario-2-research-to-bundle.mjs` (research → draft → review → bundle 의 artifact 라이프사이클 + 수동 제출 게이트 옵션 + fixture replay deterministic). 출력은 `ops/scenario_runs/*.json`(gitignore) + stdout envelope. 프리플라이트: `npm run preflight:scenario_proof_harness` · `npm run verify:preflight:scenario_proof_harness`. 회귀 3종: `scripts/test-scenario-proof-envelope-schema.mjs`, `test-scenario-1-multi-project-spinup.mjs`, `test-scenario-2-research-to-bundle.mjs`. **비목표:** founder surface 에 내부 토큰 직접 노출·시나리오에서 live Supabase 쓰기·워크플로 엔진 신설.
- **W6-B (harness proof instrumentation):** `harnessWorkcellRuntime.js` 가 기존 shape 을 유지한 채 **proof 필드 6종**을 roll-up 으로 추가한다 — `reviewer_findings_count`(packet 합산) / `rework_cause_code`(`reviewer_finding`/`disagreement_unresolved`/`external_regression`/`unclear_spec`/`other` 중 첫 유효값, `rework_requested` 가 없으면 null 로 강제: 정직성 규칙) / `acceptance_evidence_kind`(`artifact_diff`/`test_pass`/`reviewer_sign_off`/`live_demo`/`bundle_attached` 중 첫 유효값) / `unresolved_disagreements`(`disagreement_open===true` 인 packet 수, 문자열·숫자 등 느슨한 값은 무시) / `correction_hit_rate`(top-level override, [0,1] 범위 밖이면 null) / `patch_quality_delta`(top-level override, 숫자 아니면 null). `validateHarnessWorkcellRuntime` 에 동일 규칙이 추가되며, `formatHarnessProofSnapshotLines` 가 compact line 집합을 만든다. `executionContextReadModel.resolveHarnessProofSnapshotLines` 는 `active_run_shell` → `execution_summary_active_run` → 최근 `harness_dispatch` 아티팩트 순으로 동일 우선순위에서 proof 필드를 뽑아 `read_execution_context` 에 **`harness_proof_snapshot_lines`** 로 병치(기존 응답 shape 보존). founder surface 쪽으로는 어떤 proof 토큰도 흘리지 않는다. 회귀 5종: `scripts/test-harness-proof-fields-{schema,enum-rollup,disagreement}.mjs`, `test-harness-proof-snapshot-lines.mjs`, `test-harness-proof-fields-founder-no-leak.mjs`. **비목표:** founder 본문 proof 토큰 노출·가짜 사유(rework 없이 rework_cause_code) 저장·enum 확장을 코드 밖 config 로 이관.
- **W7-A (proactive COS ops):** `src/founder/proactiveSignals.js` 를 SSOT 로 고정하고, 6종 신호(`stale_run`·`unresolved_escalation`·`missing_binding`·`delivery_ready`·`human_gate_required`·`multi_project_health`) 를 **이미 관찰된 truth**(active_run_shell · workcell_runtime · active_project_space_slice · surface_model · recent_run_shells) 만으로 roll-up 한다. 모듈은 **pure** 이며 Slack/Supabase/외부 tool 을 직접 호출하지 않는다(헌법 §4 단일 송신 경로 보호). `read_execution_context` 에 `proactive_signals_compact_lines` 가 새 슬라이스로 병치되며, 신규 Slack 송신 경로는 만들지 않는다. 운영 가시성용 CLI 는 `scripts/audit-proactive-health.mjs`(— `--fixture <path>` / `--json` / `--stale-run-minutes` — `audit:parcel-health` 와 동일하게 자격 미설정이면 `skipped` exit 0). 회귀 6종: `scripts/test-proactive-signals-{stale-run,escalation-and-delivery,missing-binding,human-gate-and-multi-project,no-new-slack-send-path}.mjs` + `test-audit-proactive-health-cli-compact-lines.mjs`. **비목표:** 새 Slack 송신 경로·founder 본문 토큰 노출(`stale_run`/`resolution_class` 등)·신호 발생 시 자동 재시도/오케스트레이션·외부 호출 신설.
- **W7-B (tool lane qualification):** `src/founder/toolPlane/toolLaneQualification.js` 를 **추가만** 하여 기존 `toolLaneReadiness` / `classifyToolInvocationPrecheck` API 를 보존한다. roll-up 자격 = readiness(declared·configured·live_capable) + 최신 precheck 의 W5-A `resolution_class`(없으면 lane static hint + `classifyLegacyBlockedSignal` 휴리스틱) + `human_gate_required_mirror`(surface_model 의 gate 또는 hil 계열 class 에서 유도). `read_execution_context` 에 `tool_qualification_summary_lines` 가 새 슬라이스로 병치(기존 응답 shape 보존, 시크릿 원시값 노출 금지). 회귀 5종: `scripts/test-tool-lane-qualification-{schema,aggregation,resolution-class,human-gate-mirror,no-secret-leak,read-context-slice}.mjs`. **비목표:** lane 자체 신설·readiness API 변경·founder 본문에 `resolution_class`·`human_gate_required` 토큰 직접 노출·시크릿 원시값(env 값) 표면 노출.
- **W8 (live binding & propagation core):** `src/founder/bindingRequirements.js` SSOT(6종 binding_kind + 3종 secret_handling_mode: `plain_readable`·`write_only`·`smoke_only`) + `projectSpaceBindingGraph.js`(buildBindingGraph / formatBindingGraphCompactLines). DDL 추가 마이그레이션 `supabase/migrations/20260601120000_binding_propagation_and_continuation.sql` — `project_space_human_gates` 에 `continuation_packet_id`·`continuation_run_id`·`continuation_thread_key`·`required_human_action` 컬럼 **additive** 추가 + `propagation_runs`·`propagation_steps`·`delivery_readiness_snapshots` + 4개 ENUM + RLS service_role only. 엔진 평면: `envSecretPropagationPlan.buildPropagationPlan` 은 순수 함수로 `plan_hash` 결정적 · secret value 불저장 · verification_kind 를 sink capability 로 유도; `envSecretPropagationEngine.executePropagationPlan` 은 `writers` 주입·기본 dry_run·step 별 outcome 을 `propagation_runs`/`propagation_steps` (또는 메모리) 에 기록, writer throw 는 `tool_adapter_unavailable` 로 분류. `humanGateRuntime` 이 `openResumableGate`/`closeGateAndResume` 를 store 위에 덧대되 **자동 재개 금지**(close 시 continuation payload 만 반환). Live binding writers 4종(`toolPlane/lanes/{github,vercel,railway,supabase}/...BindingWriter.js`)는 공통 `bindingWriterContract` 를 통해 `COS_LIVE_BINDING_WRITERS=1` 이 아니면 smoke 반환, secret value 키 금지 assert, 토큰/ref 누락 시 `binding_missing` fail-closed; Supabase writer 는 `smoke_only` 모드 고정. `deliveryReadiness` 모듈이 4종 verdict(`ready`/`missing_binding`/`open_gate`/`propagation_failed`, open_gate 최우선) 와 3종 compact line 슬라이스(`delivery_readiness_compact_lines`·`unresolved_human_gates_compact_lines`·`last_propagation_failures_lines`) 를 만들고 `redactSecretLike` 로 token/JWT/URL 을 마스킹. `founderCosToolHandlers.read_execution_context` 가 기존 응답 shape 보존하에 해당 세 줄 슬라이스를 병치(기존 `active_project_space` 와 병렬). projectSpaceLane 액션 enum 에 `plan_propagation`·`execute_propagation_dry_run`·`open_resumable_gate`·`close_and_resume_gate` 4종 additive. 프리플라이트: `npm run preflight:live_binding_propagation` · `npm run verify:preflight:live_binding_propagation`. 회귀 19종: `test-binding-requirements-*.mjs`(3) + `test-propagation-plan-*`(2) + `test-propagation-engine-{dry-run-smoke,failure-classifies}.mjs` + `test-human-gate-{runtime-resumable,continuation-columns-ddl}.mjs` + `test-live-binding-writers-{default-smoke,reject-secret-value,flag-gated-live,missing-token-fails-closed,static-guard}.mjs` + `test-delivery-readiness-{verdict-priority,no-secret-leak,loader-end-to-end,read-execution-context-slice}.mjs`. **비목표:** founder surface 토큰 누수·live writer 기본 on·풀 퍼블릭 배포 패키징·콜백 코어 재개방·founder 본문에 continuation/verdict 원시 토큰 노출.
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
