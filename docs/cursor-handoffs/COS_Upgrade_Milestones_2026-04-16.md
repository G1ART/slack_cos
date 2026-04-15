# COS·하네스 업그레이드 마일스톤 (2026-04-16)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md`, `COS_Phase1_CrossLayer_Envelope_2026-04-15.md`, `COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md`.

**외부 로드맵 SSOT:** `G1_COS_Upgrade_Roadmap_2026-04-14.md` (M1~M10, non-goals). **제품 서술 SSOT:** `WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md`.

**목표 수준(한 줄):** 같은 Supabase·같은 COS 프로세스 안에서 **워크스페이스·제품·프로젝트·배포** 경계가 **자동·일관**하게 태깅·필터되고, **ledger·스트림·요약**이 같은 식별자 어휘를 쓰며, **Phase 1 봉투** 필드가 코드 경로에 점진 이식된다.

## 구현 스냅샷 (누적)

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
- **G1 로드맵 M6 (일부·스레드 ledger):** `mergeLedgerExecutionRowPayload` SSOT — `harness_dispatch` / `harness_packet` / **`tool_invocation`·`tool_result`** / **`execution_note`** / **클로저 mirror `tool_result`** 까지 동일 병합; `invoke_external_tool` ctx `runTenancy`·활성 run.
- **G1 로드맵 M2 (일부·하네스 페르소나 계약 평면):** `src/founder/personaContracts.manifest.json` + `personaContractManifest.js` — 코어 5역할의 `delegate_persona_enum`·검토·에스컬레이션; `formatPersonaContractLinesForInstructions` 가 **시스템 지시에 계약 요약 블록** 삽입(상한만 기계 적용); `runHarnessOrchestration` 반환·ledger `harness_dispatch` payload 에 `persona_contract_version`·`persona_contract_ids` 기계 태깅. (로컬 스냅샷 “G1 M2 … cos_run_events” 는 이벤트 테넄시 별칭.)
- **외부 G1 M5 Truth stack (일부):** `read_execution_context` 반환 `recent_artifact_spine_distinct` — `distinctSpineKeysFromLedgerArtifacts` 로 최근 ledger payload 에서 스파인·테넄시 문자열 distinct 만 기계 수집 (Supabase 요약과 혼동 금지; COS 내부 깊은 읽기 보조).
- **외부 G1 M5 Truth stack (일부):** `read_execution_context` 반환 `active_run_shell` — `activeRunShellForCosExecutionContext(getActiveRunForThread)` 로 thread 최신 **durable cos_runs** 활성 행의 id·status·stage·dispatch_id·packet ids·테넄시 키·`updated_at` 만 (요약 문장·objective 전문 없음). ledger 한 줄·ops smoke 요약과 **동일 truth 가 아니라 병치**한다.

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
- [x] (일부·감사 연결) **`audit-parcel-ops-smoke-health.mjs`** 가 동일 턴에 RPC를 호출해 `runs_tenancy_rpc_*` JSON 필드 및(가능 시) 테이블 직조회와 건수 정합 비교 — founder 경로 아님, 운영 가시성만.
- [ ] (잔여) 추가 뷰·다른 테이블로의 키 전파·런타임 앱 경로에서의 RPC 활용 등.

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
