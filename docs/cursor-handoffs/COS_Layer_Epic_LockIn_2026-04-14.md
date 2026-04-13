# COS–하네스–외부툴 에픽 — 잠금 결정 (2026-04-14)

참고: `COS_Harness_Validation_Persona_First_2026-04-13.md`, `COS_Parcel_Multi_Product_Operations_2026-04-13.md`.

## Founder 잠금 (객관식 응답 반영)

| # | 항목 | 결정 |
|---|------|------|
| 1 | Slack 면 | **지금 B** (founder는 COS만; 하네스는 내부 채널 전용 추가 봇 가능). **고도화 후 C** (founder가 특정 페르소나 봇과도 가끔 직접). |
| 2 | 진행/완료 정본 | **에이전트 추천 아래 표준** (founder 직감 A/B 1·2순위와 정합). |
| 3 | 하네스 런타임 | **지금 A** (단일 COS 루프·패킷/페르소나). **반드시 B(멀티 Slack 앱)** 로 갈 전제로 **확장 가능하게** 구현. |
| 4 | 견제 깊이 | **B** — 페르소나별 **다른 시스템 프롬프트** (같은 앱/모델 내 스위치). |
| 5 | 코드 vs 지시 | **A** 유지. **코드로 무엇을 제어할지는 founder와 케이스별 합의**. |
| 6 | 멀티 제품·공유 DB | **C 필수** — 감사·뷰·필터까지 **시작부터 병행**. 택배사무소 설계 방향과 정합. **에픽 내 고난도 축**. |
| 7 | 완료 정의 | **C** — 슬랙 E2E + **운영 Supabase** 요약·감사 확인. |

## 2번 — 진행/완료 정본 (에이전트 추천)

**1순위: A (스레드 execution ledger 요약 + 클로저 미러)**  
**2순위: B (`read_execution_context`)** — 리뷰 큐·아티팩트·집계가 필요하거나 ledger만으로 애매할 때.

**이유:** founder 턴 입력에 이미 `[최근 실행 아티팩트]`가 들어가고, `emit_patch` 는 클로저 미러로 `running` 다음 `completed` 가 보인다. 일상 대화의 **같은 스레드 연속 진실**에는 ledger가 가장 가깝다. `read_execution_context` 는 **깊이 보기·리뷰·차단 건** 보강용.

**Supabase 요약/감사(옵션 C)** 는 **운영·스모크·멀티 제품 관측**의 정본으로 두고, **매 턴 COS 필수 입력으로 올리지는 않음** (6번 에픽에서 배포별 필터·뷰를 맞추면 “필요 시 조회” 경로로 명시).

## 에픽 준비 메모 (구현 전)

- **3 + 4:** 단일 프로세스에서 `app_id`/봇 식별자 추상화, 페르소나→프롬프트 테이블, 나중에 B에서 앱만 쪼개기.  
- **6:** `summarize --session-prefix`·`COS_OPS_SMOKE_SESSION_ID_PREFIX` 외에 **`audit:parcel-health` 배포 스코프**, 스트림 뷰 또는 RPC·payload 태그(`parcel_deployment_key` 등) **설계 문서 → 마이그레이션 → 스크립트** 순.  
- **7:** 릴리스 게이트에 `verify:parcel-post-office` + (자격 시) `audit:parcel-health` + 짧은 슬랙 시나리오 체크리스트.

## 구현 스냅샷 (2026-04-01)

- **6:** `COS_PARCEL_DEPLOYMENT_KEY` → 요약 이벤트 타입 append 시 `payload.parcel_deployment_key` 주입 (`parcelDeploymentContext.js`, `runCosEvents` / `pretriggerAudit`). 뷰 `cos_ops_smoke_summary_stream` 에 표현 컬럼 `parcel_deployment_key` (마이그레이션 `20260414120000_*`; **열 순서**는 기존 4열 끝에 `created_at` 까지 동일한 뒤 5열로만 추가 — 중간 삽입 시 `CREATE OR REPLACE VIEW` 가 PostgreSQL 42P16). `listOpsSmokePhaseEventsForSummary`·`supabaseListMergedSmokeSummaryEvents*`·`summarize-ops-smoke-sessions.mjs`·`audit-parcel-ops-smoke-health.mjs` 에 배포 스코프 필터·CLI.
- **4:** Founder 시스템 지시에 `personaHarnessInstructions.js` 블록 삽입 (`buildSystemInstructions`).

## 다음 단계

1. 3번 **확장점 인터페이스** 스케치 (멀티 Bolt 앱 vs 단일 프로세스 멀티 앱).  
2. 운영 Supabase에 `20260414120000` 마이그레이션 적용 후 `audit:parcel-health`·요약 스크립트로 배포 스코프 검증.

## Owner actions

- 이 문서를 기준으로 PR/이슈를 쪼갠다.  
- `npm test` / `npm run verify:parcel-post-office` 는 기존 관례 유지.
