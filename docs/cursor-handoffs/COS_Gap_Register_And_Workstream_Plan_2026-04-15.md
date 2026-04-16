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

## 7) 다음 권장

1. **W0** 유지·개선(필요 시 청크 크기·워크스트림 확장).  
2. **W1 / W2 / W3** 설계를 에픽 단위로 쪼개 착수 — 시나리오 실현의 받침.
