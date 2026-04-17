# COS Gap Register · Dependency Map · Workstream Plan (2026-04-15)

**소스:** 로컬 마스터 인스트럭션 `CURSOR_MASTER_INSTRUCTION_slack_cos_Start_Gate_Gap_Register_Workstream_Plan_2026-04-15.md` 를 레포에 옮긴 SSOT. **용어는 그대로 쓴다:** Gap Register = 병렬 갭 목록, Dependency Map = 선행 관계만, Workstream Plan = 실행 묶음(엄격한 위상·계층 아님).

**필독 정본:** `CONSTITUTION.md`, `docs/cursor-handoffs/WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md` (레지스트리 파일명은 `docs/runtime_required_docs.json` 참조).

---

## 0) W0 — Global Start Gate (구현됨)

- **레지스트리:** `docs/runtime_required_docs.json`
- **매니페스트:** `npm run preflight:required-docs -- --task-id <id> [--workstream <key>] [--write-ack-template ops/preflight_ack/<file>.json]`
- **검증:** `npm run verify:preflight-ack -- --manifest ops/preflight_manifest/<id>.json --ack ops/preflight_ack/<ack>.json`
- **산출물 디렉터리:** `ops/preflight_manifest/`, `ops/preflight_ack/` (`*.json` 은 `.gitignore` — `.gitkeep` 만 추적)
- **회귀:** `scripts/test-runtime-required-docs-registry.mjs`

### 매 작업 시작 시 에이전트에게 붙일 문구 (하드 게이트)

```md
Required Docs Start Gate

This is not guidance. This is a hard start gate.

Before implementation:
1. Build the required-doc manifest for this task (`npm run preflight:required-docs -- ...`).
2. Read every required document in chunked form.
3. Write a preflight acknowledgment artifact covering every chunk (factual short summary per chunk; no vague "read and understood").
4. Verify the acknowledgment artifact against current file hashes (`npm run verify:preflight-ack -- ...`).
5. Do not begin code changes until verification passes.

If any required document changes during the task, rerun preflight and refresh the acknowledgment artifact before continuing.
```

---

## 1) 제품 프레이밍 (흔들면 안 되는 것)

- Founder 는 **COS 만** 본다.
- Harness·툴은 COS 뒤에서만 돈다.
- 앱 코드는 가능한 한 **최소**: strict 봉투, 어댑터 안전, ledger/감사 가시성, 테넄시 규율, 회귀 보호.
- Founder 와 COS 사이에 **두꺼운 해석 껍질**을 다시 끼우지 않는다.
- 택배사무소 코어(콜백 권위·클로저)를 **가볍게 다시 열지** 않는다.
- “콜백이 닫히느냐”보다 빠진 큰 그림은 **COS ↔ Harness ↔ Tools 운영체제 행동 전체**다.

---

## 2) Gap Register (병렬 목록 — 순서 ≠ 우선순위)

| ID | 요약 |
|----|------|
| **G1** | 제품 SSOT 가 런타임 정책 스냅샷으로 완전히 승격되지 않음 → 헌법+WHAT+마일스톤/ops 를 해시 기반으로 부트·검증에 노출할 여지 |
| **G2** | Founder 오케스트레이터 한 파일/한 경로에 책임 과밀 |
| **G3** | 외부 툴 평면이 단일 덩어리에 가깝고 레인 의미 분리 부족 |
| **G4** | Harness 페르소나 계약이 아직 “강한 실행 계약”이 아님 (도구 범위·출력 스키마·리뷰 의무·에스컬 조건의 코드 강제) |
| **G5** | Harness 워크셀 런타임(소유권·내부 핸드오프·리뷰·COS 에스컬)이 조직으로 성숙하지 않음 |
| **G6** | 진실 스택이 분산(run·ledger·콜백 클로저·ops) — 단일 실행 상태 읽기 모델 부족 |
| **G7** | 테넄시: 키는 많으나 **모든 위험 경로에서** tenantless 생성 차단은 미완 |
| **G8** | Founder 표면의 진행·막힘·납품 표현이 제품 수준으로 얇음 |
| **G9** | 시나리오1: 멀티 프로젝트 스핀업 오케스트레이터 없음(레포·배포·DB 바인딩·에스컬 게이트) |
| **G10** | 시나리오2: 리서치→번들 파이프라인 없음(출처·초안·검수·다운로드·human 제출 게이트) |
| **G11** | 릴리스/ops 가 문서 의존 — 코드 검증으로 강제할 여지 |

---

## 3) Dependency Map (선행만)

- **G5**는 **G4**에 강하게 의존 (약한 계약 위에 워크셀을 쌓지 말 것).
- **G8**은 **G6** 이후 더 안정 (founder 보고는 단일 진실에서 읽는 편이 안전).
- **G9**는 **G3**, **G7**에 강하게 의존 (툴 평면·테넄시가 헐거우면 스핀업은 위험).
- **G10**은 **G5**, **G8**에 강하게 의존 (역할 런타임 + founder 납품 표면).
- **G11**은 G1~G10 중 최소 계약이 생긴 뒤 가치가 커짐.

해석: **G3 / G4 / G7** 기초, **G5 / G6 / G8** 운영 제품층, **G9 / G10** 시나리오 실현, **G11** 운영 규율 완성.

---

## 4) Workstream Plan (묶음 — 병렬 가능, 선행 존중)

| ID | 포함 갭 | 목적 한 줄 |
|----|---------|------------|
| **W0** | (게이트) | 필독 재실행·드리프트 방지·ack 아티팩트 |
| **W1** | G2, G3 | Founder 오케스트레이터 분산 + 툴 레인 정규화 |
| **W2** | G4, G5 | 계약 강화 + 워크셀 런타임 |
| **W3** | G6, G7 | 진실·테넄시 한축으로 굳히기 |
| **W4** | G8 | Founder 표면 렌더링·경계 언어 |
| **W5** | G9 | 시나리오1 스핀업 |
| **W6** | G10 | 시나리오2 번들 |
| **W7** | G11 | 릴리스 검증 스크립트 묶음 |

**금지:** W5/W6 만 표면 UX로 먼저 튀기기. 시나리오1은 W1·W3·(이후)W2, 시나리오2는 W2·W4·W3 수혜.

---

## 5) 하지 말 것

- 슬래시 커맨드로 제품을 다시 쓰기
- Founder 쪽 과한 커맨드 폴리싱
- 회귀 없이 택배 코어 대개조 주장
- 계정 조작이 필요한 레인을 “완전 자동”이라 속이기
- Gap 목록을 가짜 아키텍처 층으로 바꾸기
- 계약/진실/테넄시 전에 표면만 얹기

---

## 6) 패치 종료 시 운영자 보고 형식 (요약)

1. 구현·변경 파일·실행한 명령·검증 결과  
2. Preflight 증거(매니페스트 경로, ack 경로, verify 결과)  
3. 건드린 G 항목 / 의도적으로 안 건드린 항목  
4. 새로 생긴 리스크(택배·테넄시·founder 표면)  
5. 다음 추천 워크스트림 한 가지와 이유  
6. 운영자 수동 조치(환경·배포·재시작)

---

## 6.1) W8~W10 Closeout 총괄 보고 (2026-04-16)

1. **구현·변경·검증**
   - **W8 (live binding & propagation core):** `bindingRequirements` SSOT + `projectSpaceBindingGraph` + DDL `20260601120000_binding_propagation_and_continuation.sql`(additive) + `envSecretPropagationPlan/Engine` + `humanGateRuntime` resumable + live binding writers 4종(smoke-default, flag-gated) + `deliveryReadiness` 4 verdict & 3 slice lines + `read_execution_context` 슬라이스 3종 추가. 회귀 19종 통과.
   - **W9 (live scenario proof harness):** `scenarioProofResultClassifier` (4축) + `scenarioProofScorecard` + `scenarioProofLiveRunner` + CLI `scenario:proof:live` + 양 러너 `--fixture` 옵션 & Supabase 운영 모드 가드(`tenancy_or_binding_ambiguity`). 회귀 7종 통과.
   - **W10-A (proactive ops surface, audit/draft only):** `proactiveSurfacePolicy`(severity·dedupe·rate-limit·jargon reject) + `proactiveSurfaceDraft`(“[COS 운영 메모]” 블록) + `founderConversationInput.proactiveSurfaceLines` 파이프 + no-new-send-path 정적 가드. 회귀 5종 통과.
   - **W10-B (harness quality proof):** `harnessProofScorecard`(6종 roll-up) + `audit-harness-proof` CLI + npm `audit:harness-proof` + `read_execution_context.harness_proof_scorecard(+_lines)` 슬라이스. 회귀 4종 통과.
   - 실행 명령: `npm test` 전체 그린(W8~W10 새 회귀 35종 포함).
2. **Preflight 증거**
   - `ops/preflight_manifest/{w8_live_binding_propagation_epic,w9_scenario_proof_live_epic,w10_proactive_actuation_audit_only_epic}.json` 재생성.
   - `ops/preflight_ack/*` 동일 3쌍 ack 재해시(Milestones 청크 갱신).
   - `npm run verify:preflight:{live_binding_propagation,scenario_proof_live,proactive_actuation_audit_only}` 전부 ok.
3. **G 항목**
   - 닫음: G4(live binding writers 자격·dry-run), G5(human gate continuation resumable), G6(live scenario proof harness), G7(proactive actuation audit/draft), G8(harness proof scorecard).
   - 의도적 미접촉: 콜백 권위·단일 Slack 송신 경로·founder 본문 토큰 노출 금지 — 헌법 §4·§5 유지.
4. **새 리스크**
   - Live binding writers: `COS_LIVE_BINDING_WRITERS=1` 사용 시 실제 토큰 노출이 가능하지만 **기본은 smoke**, writer 계약에서 secret value 키 reject. 운영 전 팀 합의·감사 필요.
   - Supabase DDL(W8) 은 코드 경로가 부재 시 graceful degrade 하지만, 실제 마이그레이션 적용은 **운영자 수동 조치**.
   - Proactive surface lines 는 founder 본문 앞부분을 점유 — rate-limit·dedupe 로 피로 방지하지만 실사용 피드백 주기적 튜닝 필요.
5. **다음 권장**
   - Live binding writers 플래그-온 운영 리허설(smoke→live) & delivery readiness scorecard 기반 `audit:delivery-readiness` 감사 CLI 신설 검토.
6. **운영자 수동 조치**
   - Supabase 마이그레이션 `20260601120000_binding_propagation_and_continuation.sql` 배포·롤백.
   - `COS_LIVE_BINDING_WRITERS` flip 여부 결정(기본 off 유지 권장).
   - `audit:harness-proof` / `scenario:proof:live` 를 주간 리허설 runbook 에 편입.

---

## 6.2) W11 Internal Alpha Qualification & Live Rehearsal 총괄 보고 (2026-04-16)

- **구현 순서**: W0 확장 → G11-A(capability registry) → G11-C(resume audit DDL + 런타임) → G11-D(engine rollup) → G11-B(audit CLI) → G11-E(scenario cause axis + bounded live) → G11-F(audit-only read slices) → cross-project contamination 회귀 → closeout.
- **주요 산출물**:
  - **A**: `src/founder/liveBindingCapabilityRegistry.js`(SSOT, 4 sinks × 5축) · `envSecretPropagationPlan.buildPropagationPlan` registry fallback · `envSecretPropagationEngine.executePropagationPlan` verification_kind 호환성 fail-closed.
  - **C**: `supabase/migrations/20260616120000_human_gate_resume_audit.sql`(5 additive columns) · `projectSpaceBindingStore.openHumanGate`/`closeHumanGate`/`markGateResumed` · `humanGateRuntime.openResumableGate`/`closeGateAndResume`·`RESUME_TARGET_KINDS`·`deriveContinuationKey`·`formatUnresolvedHumanGatesCompactLines`.
  - **D**: `executePropagationPlan` → additive 6 roll-up 필드(`attempted_steps_count`·`completed_steps_count`·`blocked_steps_count`·`verification_modes_used`·`resumable`·`next_human_action`).
  - **B**: `scripts/audit-delivery-readiness.mjs` + npm `audit:delivery-readiness`(fixture/json/project-space-key 옵션).
  - **E**: `BREAK_REASON_CAUSES` 8종 enum + additive `break_reason_cause` 필드(envelope·classification·scorecard), `scenarioProofLiveRunner.detectLiveBoundaryBlock` 로 Supabase·`COS_SCENARIO_LIVE_OPENAI`·writers 조건 누락 시 inconclusive + 정확 cause 반환.
  - **F**: `src/founder/humanGateResumeAuditLines.js`·`src/founder/propagationRunAuditLines.js` 신규 pure 모듈, `founderCosToolHandlers.read_execution_context` 에 `human_gate_resume_audit_lines`·`propagation_run_audit_lines` 병치(기존 응답 shape 보존, founder 본문 파이프와 비혼용).
  - **W0**: `docs/runtime_required_docs.json.internal_alpha_qualification` 워크스트림 + `ops/preflight_manifest/w11_internal_alpha_qualification_epic.json` + `ops/preflight_ack/w11_internal_alpha_qualification_epic.json`.
- **회귀 18종(모두 green, `npm test` 전체 통과)**:
  - `test-live-binding-capability-registry-schema.mjs`
  - `test-propagation-plan-uses-registry.mjs`
  - `test-propagation-plan-unknown-sink-fails-closed.mjs`
  - `test-human-gate-resume-target-invariant.mjs`
  - `test-human-gate-reopened-count-and-timestamps.mjs`
  - `test-human-gate-continuation-key-derived.mjs`
  - `test-human-gate-tenancy-preserved-across-resume.mjs`
  - `test-propagation-engine-result-rollup-fields.mjs`
  - `test-propagation-engine-next-human-action-fallback.mjs`
  - `test-audit-delivery-readiness-fixture-basic.mjs`
  - `test-audit-delivery-readiness-no-secret-leak.mjs`
  - `test-audit-delivery-readiness-blocked-plus-open-gate.mjs`
  - `test-audit-delivery-readiness-smoke-vs-verified-distinguished.mjs`
  - `test-scenario-proof-envelope-break-reason-cause-additive.mjs`
  - `test-scenario-proof-classifier-break-reason-cause-mapping.mjs`
  - `test-scenario-proof-scorecard-cause-histogram.mjs`
  - `test-scenario-proof-live-bounded-gates.mjs`
  - `test-scenario-proof-live-no-secret-in-cause.mjs`
  - `test-human-gate-resume-audit-lines-pure.mjs`
  - `test-propagation-run-audit-lines-pure.mjs`
  - `test-read-execution-context-w11f-audit-slices.mjs`
  - `test-cross-project-contamination-no-mix.mjs`
- **검증 / 안전성**:
  - `npm run preflight:internal_alpha_qualification` → 청크 매니페스트 생성, `npm run verify:preflight:internal_alpha_qualification` → ack 해시·요약 통과.
  - `npm test` 전체 green. `npm run audit:delivery-readiness -- --json` 는 Supabase 미자격 환경에서 `skipped` exit 0.
  - Founder surface 토큰 금지(헌법 §4/§6): cause enum·resolution_class·`resume_target_kind`·`continuation_*`·내부 ID 는 audit 슬라이스 안에서만 노출되고 `summary_lines`·founder 대화 본문으로 흐르지 않는다(회귀 검증됨).
  - **Cross-project contamination 불가 증명**: 같은 workspace/product 에서 서로 다른 `project_space_key` A/B 에 각각 gate·propagation run 을 주입해도, `listOpenHumanGates`·`listRecentPropagationRunsForSpace`·`loadDeliveryReadiness`·audit lines 어디에도 반대편 키/ID 가 섞이지 않는다.
- **Non-goals 준수**: 새 Slack 송신 경로·founder 본문 내부 토큰 직접 노출·live writer 기본 on·`continuation_key` DB 중복 저장·콜백 코어 재개방·자동 재시도/오케스트레이션 모두 도입하지 않음.
- **운영 후속(다음 기회에 다룰 권고)**:
  - live rehearsal runbook 에 `audit:delivery-readiness` + `scenario:proof:live` 체인을 정기 스케줄로 편입.
  - W8 DDL 사전 의존(W5-B 마이그레이션 선행) 을 릴리즈 체크리스트 첫 줄에 고정.

---

## 6.3) W12 Live Qualification · Secret Source-of-Truth · Design-Partner Beta Packaging 총괄 보고 (2026-04-16)

1. **Implemented (슬라이스별 요약)**
   - **W0 확장**: 정본 `docs/cursor-handoffs/W12_LIVE_QUALIFICATION_AND_PACKAGING_PLANMODE_MASTER_INSTRUCTION_2026-04-16.md` 이동, `docs/runtime_required_docs.json` 에 `design_partner_beta_qualification` 워크스트림 등록, `package.json` 에 `preflight:design_partner_beta_qualification`·`verify:preflight:design_partner_beta_qualification` 쌍 추가, 매니페스트·ack 생성 및 검증(21 chunks verified).
   - **W12-A (verified capability matrix)**: `liveBindingCapabilityRegistry.js` 에 qualification 메타 additive 8 필드 + `getQualifiedCapabilityForSink`·`isLiveWriteAllowed`·`maxAllowedVerificationKind`·`isStaleByDate`·`listKnownSinks` 추가. 신규 CLI `scripts/qualify-live-binding-capability.mjs` (`--sink|--all`·`--mode fixture|live`·`--verified-by`·`--notes`·`--evidence-ref`·`--ledger`·`--json`) → `ops/live_binding_capability_qualifications.json` 원장 upsert(.gitignore). `envSecretPropagationPlan` 은 caller 가 `sinkCapabilities` 를 강제하지 않을 때만 qualification 기반 downgrade, `envSecretPropagationEngine` 은 `isLiveWriteAllowed===false` 에서 live 쓰기를 스킵하고 `technical_capability_missing` 으로 정직한 실패.
   - **W12-B (secret source-of-truth graph + snapshot)**: 신규 pure 모듈 `src/founder/secretSourceGraph.js` + 마이그레이션 `supabase/migrations/20260617120000_propagation_runs_secret_source_snapshot.sql`(`propagation_runs.secret_source_graph_snapshot_json jsonb` additive). engine 이 run 시작 시 메타 그래프를 계산·`detectSecretLeakInGraph` 로 redaction 검증 후 snapshot 저장. `projectSpaceBindingStore.loadSecretSourceGraphSnapshotForRun` 추가. `audit-delivery-readiness` 와 `read_execution_context` 에 audit-only `secret_source_graph_compact_lines` 병치(founder 본문 주입 금지).
   - **W12-C (human gate escalation contract)**: 신규 pure 빌더 `src/founder/humanGateEscalationContract.js` 가 `{ gate_id, gate_kind, reason_why, where_to_act, exact_action, resumable, what_resumes }` 를 돌려주고 `renderHumanGateEscalationFounderLines` 가 jargon/raw secret 없는 한국어 라인을 만든다. `founderSurfaceModel.buildFounderSurfaceModel` 가 기존 `human_gate_*` 필드 시그니처를 유지한 채 **모델 입력 compact lines** 로만 `human_gate_escalation_lines` 를 병치(신규 Slack 송신 경로 0).
   - **W12-D (live rehearsal qualification)**: `scenarioProofLiveRunner.detectLiveBoundaryBlock` 이 qualified registry 에서 `live_verified` sink 0 → `product_capability_missing`+`technical_capability_missing` 로 bounded block. `scenarioProofScorecard.capability_mismatch_counts` 집계 + compact line(`제품 기능 불일치 N건`). `audit-delivery-readiness` 의 verdict `ready` 는 `technical_capability_missing` 근거나 human-gate 요구 graph 가 있으면 `needs_verification` 으로 승격하고 `capability_verification_lines` 병치. 시나리오 2 러너는 live 모드에서 fixture 에 `manual_submission_gate` 가 없어도 **수동 제출 게이트를 강제 주입**.
   - **W12-E (design-partner beta packaging)**: 신규 `docs/design-partner-beta/` 5개 — `SLACK_APP_MANIFEST.reference.json`·`INSTALL_NOTES.md`·`BYO_KEYS_INFRA_STANCE.md`·`OPERATOR_SMOKE_TEST_CHECKLIST.md`·`KNOWN_HUMAN_GATE_POINTS.md`. `.env.example` 에 `COS_LIVE_BINDING_WRITERS`·`COS_SCENARIO_LIVE_OPENAI` 베타 플래그 섹션 추가. `test-cross-project-contamination-no-mix` 를 secret source graph / snapshot / compact lines 까지 동시 검증하도록 확장.

2. **Capability qualification changes (sink 별 현재 상태)**
   - `github`·`railway`·`supabase`·`vercel`·`openai` 모두 정적 registry 의 verification_modes 는 W11 과 동일하게 보존. 기본 `qualification_status='conservative'` — 실제 `live_verified` 승격은 `scripts/qualify-live-binding-capability.mjs --sink <name> --mode live` 실행으로만 발생.
   - runtime 은 `isLiveWriteAllowed` 가 true 가 아닌 모든 sink 에 대해 live 쓰기를 보수적으로 차단. 이는 W11 대비 **정직성은 동일하거나 상승**, writer 가 정책적으로 `live_verified` 라고 주장하는 경로는 제거됨.

3. **Secret propagation model**
   - raw secret 값은 DB(`propagation_runs.secret_source_graph_snapshot_json`)·audit 출력·founder surface 어디에도 들어가지 않는다(`detectSecretLeakInGraph` 가드 + 회귀 5종).
   - 메타 그래프는 `value_name`·`source_kind`·`source_ref`·`sink_targets[]`·write/verification policy 만 보관하며 project_space_key 별 격리를 cross-project 회귀에서 추가 증명.

4. **Human gate contract**
   - 모든 open human gate 는 founder-facing 경로에서 **어디서 / 무엇을 / 이어받기 경로** 를 한국어로 설명. `hil_required_*`·`tool_adapter_unavailable`·raw secret/URL 은 렌더 결과에 포함되지 않음(회귀 4종).
   - 기존 `human_gate_required`·`human_gate_reason`·`human_gate_action` 필드 시그니처는 보존(추가 `human_gate_escalation_lines` 는 additive).

5. **Live rehearsal**
   - 시나리오 1·2 모두 fixture_replay 기본. live 경로는 `COS_SCENARIO_LIVE_OPENAI=1` + (`COS_LIVE_BINDING_WRITERS=1` 또는 writers 주입) + 최소 1 sink `live_verified` 세 조건을 모두 만족할 때만 실제 실행되고, 시나리오 2 는 자동 제출 경로를 항상 수동 게이트로 분기.
   - 현재도 inconclusive 로 남는 것: 실제 외부 provider API 호출 근거가 부족한 sink(Railway deploy 등) 의 live 경로 — `KNOWN_HUMAN_GATE_POINTS.md` 에 명시.

6. **Packaging**
   - `docs/design-partner-beta/` 가 파트너에게 제공하는 문서 경계의 SSOT. Slack manifest reference + INSTALL_NOTES + BYO 원칙 + 스모크 체크리스트 + 알려진 human-gate 포인트.
   - 파트너가 추가로 공급해야 하는 것: 파트너 소유 Supabase 프로젝트, provider 키(GitHub/OpenAI 등), 런타임 호스팅. 수동 조치가 여전히 필요한 지점은 `KNOWN_HUMAN_GATE_POINTS.md` 와 회귀 `test-packaging-docs-no-fake-automation-claims.mjs` 로 강제.

7. **Open risks**
   - qualification 원장이 로컬 파일이므로 파트너 환경 간 공유/동기화는 운영자 책임(의도적).
   - Railway deploy 자동화 부재는 baseline; W12 에서 확장하지 않는다.
   - `COS_PROPAGATION_SNAPSHOT_ENABLE` 같은 추가 feature flag 는 이번 에픽에서 도입하지 않았음(현재 snapshot 는 항상 안전하게 수행).

8. **Next recommendation**
   - 외부 design partner 1~2곳과 bounded pilot 을 진행하되, 첫 온보딩 이후 수집되는 `ops/live_binding_capability_qualifications.json` 패턴을 바탕으로 W13 에서 sink 별 live-verified 비율을 올리는 qualification 에픽을 이어 진행.
   - 실 파일럿 전, `scripts/qualify-live-binding-capability.mjs --all --mode fixture` 를 기본 seed 로 실행할 것.

- **회귀 21종 (이번 에픽 신규, 모두 `npm test` 체인에 연결됨)**:
  - W12-A(5): `test-live-binding-capability-qualification-artifact-schema`·`test-live-binding-capability-registry-merge`·`test-live-binding-capability-stale-fails-closed`·`test-live-binding-capability-unverified-limits-writes`·`test-live-binding-capability-no-secret-leak-in-artifact`.
  - W12-B(5): `test-secret-source-graph-derivation-metadata-only`·`test-secret-source-graph-write-only-vs-readback-distinguished`·`test-secret-source-graph-mixed-sink-fanout-no-leak`·`test-secret-source-graph-snapshot-persisted-per-run`·`test-secret-source-graph-project-space-isolation`.
  - W12-C(4): `test-human-gate-escalation-contract-shape`·`test-human-gate-escalation-renders-natural-korean`·`test-human-gate-escalation-resumable-preserves-continuation`·`test-human-gate-escalation-no-raw-token-leak`.
  - W12-D(4): `test-scenario-live-runner-uses-qualified-capability`·`test-scenario-scorecard-capability-mismatch-counts`·`test-audit-delivery-readiness-needs-verification-distinguished`·`test-scenario-live-runner-scenario2-bounded-submission-gate`.
  - W12-E(2): `test-packaging-manifest-scope-consistency`·`test-packaging-docs-no-fake-automation-claims`.
  - W11 `test-cross-project-contamination-no-mix` 는 secret source graph / snapshot / compact lines 까지 검증하도록 **확장(신규 파일 없이)**.

---

## 6.4) W13 Bulk — Live Surface · Staging Rehearsal · Release Hygiene · Bootstrap Audit · Harness Quality Proof 총괄 보고 (2026-04-16)

- **스코프 고정**
  - W13-A: **실제 live write surface** 는 GitHub Actions secrets (`libsodium-wrappers` crypto_box_seal → PUT + existence_only) 와 Vercel Project Env (`POST/PATCH /v10/projects/{id}/env` + existence_only + `requires_redeploy_to_apply`) 두 곳만. Railway / Supabase 는 `artifact_only` / `live_verified_read_only` 로 정직 고정.
  - W13-B: Supabase 운영 모드에서의 live rehearsal 은 **hybrid SSOT** — 로컬 `ops/rehearsal_eligibility.json` 을 primary SSOT, 감사용 additive 컬럼 `project_space_bindings.rehearsal_safety_class_json` 으로 mirror. `fixture_replay` 는 Supabase 모드에서도 `COS_RUN_STORE='memory'` 로 임시 overridden (try/finally) 되어 항상 허용.
  - W13-C: 신규 `audit-preflight-ack-drift` CLI + `ops/preflight_ack_drift_exceptions.json` 으로 과거 워크스트림의 stale manifest/ack 를 **숨기지 않고 auditable exception** 으로 고정. 새 manifest (W13+) 는 drift 0 유지.
  - W13-D: 신규 `audit-bootstrap-readiness` CLI (D1~D5 · `pass`/`pass_with_manual_gates`/`fail_drift`/`fail_missing_prereq`/`fail_unsafe_mode` 5종 verdict) + `COS_DESIGN_PARTNER_MODE` env + `app.js` boot 가드.
  - W13-E: 신규 pure 모듈 `harnessQualityProofReadModel.js` (6 축 roll-up · evidence-absent 은 null) + `audit-harness-quality-proof.mjs` CLI.
  - Cross-slice: `test-cross-project-contamination-no-mix` 를 A/B/E 표면까지 확장; `.env.example` 에 W13 플래그 블록.
- **회귀(총 21종)**
  - W13-A(6): `test-github-secrets-actual-live-put-write`·`test-vercel-env-actual-live-post-patch-write`·`test-writer-contract-no-raw-secret-value`·`test-read-back-degrades-to-existence-only-for-write-only-sinks`·`test-qualify-live-binding-capability-live-probe-github-vercel`·`test-bindingwriter-result-includes-write-only-reminder-and-requires-redeploy`.
  - W13-B(6): `test-rehearsal-eligibility-file-is-ssot`·`test-rehearsal-gate-supabase-blocks-when-no-safe-target`·`test-rehearsal-gate-supabase-allows-sandbox-safe`·`test-rehearsal-gate-does-not-cross-project-space`·`test-rehearsal-gate-writer-allowlist-filters-sinks`·`test-rehearsal-gate-does-not-weaken-qualification` + 갱신 `test-scenario-proof-live-supabase-guard`.
  - W13-C(2): `test-audit-preflight-ack-drift-detects-stale-manifest`·`test-runtime-required-docs-integrity`.
  - W13-D(5): `test-audit-bootstrap-readiness-{missing-dependency,partner-mode-memory-store-unsafe,script-drift,live-writers-without-tokens,verdict-ordering}`.
  - W13-E(4): `test-harness-quality-proof-{read-model-axes,no-claim-without-evidence,no-internal-noise-leak,project-space-isolation}`.
  - Cross-slice: `test-cross-project-contamination-no-mix` 는 W13 A/B/E 표면 **모두** 에서 격리 확인하도록 확장(신규 파일 없이).
- **운영자 수동 조치**
  1. Supabase SQL editor 에서 `supabase/migrations/20260618120000_project_space_rehearsal_mirror.sql` 적용.
  2. `ops/rehearsal_eligibility.json` 을 수기 작성(예시: `ops/rehearsal_eligibility.example.json`). production 은 기본 fail-closed.
  3. sink 재자격: `scripts/qualify-live-binding-capability.mjs --sink github --mode live --verified-by <op>` 등.
  4. `npm run audit:bootstrap-readiness` 로 `pass`/`pass_with_manual_gates` 확인; partner install 에선 `COS_DESIGN_PARTNER_MODE=1` + `COS_RUN_STORE=supabase` 권장.
  5. `npm run audit:preflight-ack-drift --strict` 로 새 manifest drift 0 확인.
- **Non-goals (재확인)**
  - Railway 실시간 deploy automation · Supabase `apply_sql` live 기본 on · 새 Slack 송신 경로 · founder 본문에 write_only_reminder/evidence_grade/verdict 원시 토큰 노출 · 이미 적용된 migration 의 rename · 메모리 store 위에서 partner_mode 기동 · marketplace 공개 배포.

---

## 7) 다음 권장

1. **W0** 유지·개선(필요 시 청크 크기·워크스트림 확장).  
2. **W1 / W2 / W3** 설계를 에픽 단위로 쪼개 착수 — 시나리오 실현의 받침.
