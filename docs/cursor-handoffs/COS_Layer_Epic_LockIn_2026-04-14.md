# COS–하네스–외부툴 에픽 — 잠금 결정 (2026-04-14)

참고: `COS_Harness_Validation_Persona_First_2026-04-13.md`, `COS_Parcel_Multi_Product_Operations_2026-04-13.md`.

**외부 검토 메모:** 방향(1·2·3·7번 잠금, 택배사무소 이후 레이어 확장)에 동의하는 검토가 있었고, 아래 **실패 방지선·테넌시 키·페르소나 계약·4단계 로드맵**은 그 의견을 문서 SSOT로 흡수한 것이다. 철학보다 **초기 구현 순서와 경계**가 성패를 가른다는 점을 명시한다.

## Founder 잠금 (객관식 응답 반영)

| # | 항목 | 결정 |
|---|------|------|
| 1 | Slack 면 | **지금 B** (founder는 COS만; 하네스는 내부 채널 전용 추가 봇 가능). **고도화 후 C** (founder가 특정 페르소나 봇과도 가끔 직접). |
| 2 | 진행/완료 정본 | **에이전트 추천 아래 표준** (founder 직감 A/B 1·2순위와 정합). |
| 3 | 하네스 런타임 | **지금 A** (단일 COS 루프·패킷/페르소나). **반드시 B(멀티 Slack 앱)** 로 갈 전제로 **확장 가능하게** 구현. |
| 4 | 견제 깊이 | **B** — 페르소나별 **다른 시스템 프롬프트** (같은 앱/모델 내 스위치). **장기 궤적은 아래 「페르소나 계약」** (프롬프트만으로 끝내지 않음). |
| 5 | 코드 vs 지시 | **A** 유지. **코드로 무엇을 제어할지는 founder와 케이스별 합의**. |
| 6 | 멀티 제품·공유 DB | **C 필수** — 감사·뷰·필터까지 **시작부터 병행**. 택배사무소 설계 방향과 정합. **에픽 내 고난도 축**. **구현 순서는 아래 「최소 테넌시 키」 먼저** (범용 추상 스키마부터 들어가지 않음). |
| 7 | 완료 정의 | **C** — 슬랙 E2E + **운영 Supabase** 요약·감사 확인. **흔들리지 말 것** (보이는 메시지와 실제 상태 전이 괴리가 과거 이슈의 중심이었음). |

## 2번 — 진행/완료 정본 (에이전트 추천)

**1순위: A (스레드 execution ledger 요약 + 클로저 미러)**  
**2순위: B (`read_execution_context`)** — 리뷰 큐·아티팩트·집계가 필요하거나 ledger만으로 애매할 때.

**이유:** founder 턴 입력에 이미 `[최근 실행 아티팩트]`가 들어가고, `emit_patch` 는 클로저 미러로 `running` 다음 `completed` 가 보인다. 일상 대화의 **같은 스레드 연속 진실**에는 ledger가 가장 가깝다. `read_execution_context` 는 **깊이 보기·리뷰·차단 건** 보강용.

**Supabase 요약/감사(옵션 C)** 는 **운영·스모크·멀티 제품 관측**의 정본으로 두고, **매 턴 COS 필수 입력으로 올리지는 않음** (6번 에픽에서 배포별 필터·뷰를 맞추면 “필요 시 조회” 경로로 명시). 이 구분을 유지한다.

## 검토에서 도출한 실패 방지선 (실구현 시 못 박기)

1. **멀티 제품·공유 DB:** 범용 데이터 모델을 먼저 크게 그리지 말고, **최소 테넌시 키를 먼저 강제**한 뒤 뷰·RPC·집계를 얹는다.
2. **페르소나:** 지금은 시스템 프롬프트 수준(B)으로 시작하되, 코드·설계는 **페르소나 계약 = 프롬프트 + 도구 허용/금지 범위 + 산출물 스키마** 를 수용할 자리를 남긴다.
3. **레이어 간 언어:** COS·하네스·외부툴이 **같은 run / packet / project-space 중심 계약**을 쓰게 통일한다 (아래 Phase 1).

## 6번 구체화 — 최소 테넄시 키 (뷰보다 먼저)

6번은 north star와 맞지만, **스키마를 과도하게 추상화하면 구현이 수주 단위로 미뤄질 수 있다.** 따라서 첫 단계에서는 아래 축만 명시적으로 강제하고, **run·packet·감사·아티팩트·요약 행**이 각자 필요한 키를 payload 또는 컬럼으로 **반드시** 갖게 만든 다음에 뷰·필터·감사 스크립트를 쌓는다.

| 키 | 역할 (초기 해석) |
|----|------------------|
| `workspace_key` | Slack 워크스페이스·동등한 테넌트 경계 |
| `product_key` | 제품/서비스 단위 |
| `project_space_key` | 프로젝트·스코프 (ledger·패킷과 정합) |
| `deployment_key` | 배포·환경·파편 인스턴스 (코드·운영: `COS_PARCEL_DEPLOYMENT_KEY` / `parcel_deployment_key` 와 동일 축) |

**정책:** 키가 비어 있으면 “레거시 전역”으로 읽을 수는 있으나, **신규 경로는 빈 값을 허용하지 않도록** 점진적으로 조이는 것이 목표다. 기존 `parcel_deployment_key`·세션 프리픽스·요약 스트림은 이 축의 **첫 번째 고정 말뚝**으로 본다.

## 4번 확장 궤적 — 페르소나 계약 (프롬프트 이후)

지금 잠금(B: 페르소나별 시스템 프롬프트)은 유지한다. North star에 가까워질수록 페르소나마다 최소한 아래 **세 층**을 분리해 둘 수 있어야 한다.

- **시스템 프롬프트** — 이미 4번 잠금으로 진행 중 (`personaHarnessInstructions` 등).
- **허용·금지 도구 범위** — `COS_TOOLS` / delegate 스키마와 정합; 페르소나별 allowlist·denylist 또는 역할 태그로 확장 가능한 경계.
- **제출 산출물 스키마** — delegate 패킷·emit_patch envelope 등 **기계 검증 가능한 출력 계약**.

문서·코드에서 “페르소나 = 프롬프트 테이블”만 언급하지 말고, **향후 동일 테이블 또는 인접 모듈에 tool scope·output contract 슬롯**을 둔다고 명시한다.

## 실행 로드맵 (North Star까지 4단계)

검토안을 에픽 위에 올린 **실행 순서**다. 기능을 무작정 늘리기보다 **계약·키·감사 경계**를 먼저 고정한다.

**Phase 1 — 인터페이스 잠금**  
COS ↔ Harness ↔ External tool 사이 **최소 공통 envelope** 고정. 예시 축:

- `run_id` / `packet_id` / `project_space_key` / `product_key`
- `intent` / `role` / `success_criteria` / `escalation_rule` (문서화 수준에서라도 SSOT)
- `artifacts` / `review_state` / `authority_state`
- **founder-facing 요약 카테고리**와 **internal audit 이벤트 카테고리**의 분리 (메시지 vs Supabase 스모크·감사)

이 단계에서는 **모든 레이어가 같은 run/packet 언어**를 쓰는 것이 목표다.

**Phase 2 — 하네스 그룹 고도화**  
하네스를 “단순 다중 페르소나”가 아니라 **역할이 다른 운영 그룹**으로 키운다 (예: planner / researcher / implementer / reviewer / risk gate). **founder는 여전히 COS만** 본다 (1번 잠금과 정합).

**Phase 3 — 외부툴 인터페이스 범용화**  
Cursor 레인이 첫 closure spine. GitHub·Supabase·Vercel/Railway 등은 **툴별 예외 나열이 아니라 공통 execution contract 위에 adapter**를 얹는다. **run/packet authority가 툴 특수성보다 우선**한다.

**Phase 4 — 멀티 제품 운영체제화**  
6·7번이 이 단계의 씨앗: 여러 제품·프로젝트 동시 운영, 감사 가능, founder는 자연어, COS 단일 병목 완화, 하네스 역할별 상시 가동. **최소 테넌시 키·감사 뷰**가 여기까지 버티도록 Phase 1~3에서 기반을 깐다.

## 에픽 준비 메모 (구현 전)

- **3 + 4:** 단일 프로세스에서 `app_id`/봇 식별자 추상화, **페르소나 계약(프롬프트 + tool scope + 산출물 스키마)** 저장 위치를 founder와 한 줄씩이라도 고정, 나중에 B에서 앱만 쪼개기.  
- **6:** `summarize --session-prefix`·`COS_OPS_SMOKE_SESSION_ID_PREFIX`·**최소 테넄시 키**·`audit:parcel-health` 배포 스코프, 스트림 뷰·payload 태그 — **키 강제 → 마이그레이션 → 스크립트** 순.  
- **7:** 릴리스 게이트에 `verify:parcel-post-office` + (자격 시) `audit:parcel-health` + 짧은 슬랙 시나리오 체크리스트.

## 구현 스냅샷 (2026-04-01)

- **6:** `COS_PARCEL_DEPLOYMENT_KEY` → 요약 이벤트 타입 append 시 `payload.parcel_deployment_key` 주입 (`parcelDeploymentContext.js`, `runCosEvents` / `pretriggerAudit`). 뷰 `cos_ops_smoke_summary_stream` 에 표현 컬럼 `parcel_deployment_key` (마이그레이션 `20260414120000_*`; **열 순서**는 기존 4열 끝에 `created_at` 까지 동일한 뒤 5열로만 추가 — 중간 삽입 시 `CREATE OR REPLACE VIEW` 가 PostgreSQL 42P16). `listOpsSmokePhaseEventsForSummary`·`supabaseListMergedSmokeSummaryEvents*`·`summarize-ops-smoke-sessions.mjs`·`audit-parcel-ops-smoke-health.mjs` 에 배포 스코프 필터·CLI. → 상단 **deployment_key** 축의 첫 구현물.
- **6 (보강):** `COS_WORKSPACE_KEY` / `COS_PRODUCT_KEY` / `COS_PROJECT_SPACE_KEY` → 동일 경로로 payload·뷰 표현 컬럼 (`20260415120000_*`, 기존 5열 뒤에만 추가). 네 축이 에픽 표와 정합.
- **4:** Founder 시스템 지시에 `personaHarnessInstructions.js` 블록 삽입 (`buildSystemInstructions`). → 페르소나 계약 중 **프롬프트** 층.
- **4 (보강):** `personaContractOutline.js` — 계약 3층 슬롯 이름 SSOT (`system_prompt` / `tool_scope` / `deliverable_schema`); 하네스·도구 바인딩은 후속.

## 다음 단계 (즉시)

1. **Phase 1** 스케치: run/packet/envelope 필드 목록을 코드 주석 또는 `docs/cursor-handoffs/` 짧은 부속 문서로 고정.  
2. **3번** 확장점: 멀티 Bolt 앱 vs 단일 프로세스 멀티 앱 — `app_id` 경계만이라도 SSOT.  
3. 운영 Supabase에 `20260414120000`·`20260415120000` 마이그레이션 적용 후 `audit:parcel-health`·요약으로 **deployment** 스코프 검증.  
4. 테넄시 키 **요약 스트림 외** 경로(cos_runs·ledger)에 붙일 우선순위·필터 CLI( workspace 등 )를 founder와 찍는다 — env 주입만으로는 감사 샘플에 태그가 보이는 상태.

## Owner actions

- 이 문서를 기준으로 PR/이슈를 쪼갠다.  
- `npm test` / `npm run verify:parcel-post-office` 는 기존 관례 유지.  
- 로드맵 작업 시 **Phase 순서**를 뛰어넘지 않도록 이슈에 Phase 라벨을 단다.
