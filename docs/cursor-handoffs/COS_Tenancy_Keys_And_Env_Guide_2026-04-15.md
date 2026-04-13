# 테넌시 키 · `.env` 가이드 (2026-04-15)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md` 의 최소 테넄시 키, `parcelDeploymentContext.js`, 요약 스트림 뷰.

## 1. “테넌시”가 뭔가요?

**한 줄:** 여러 팀·제품·배포가 **같은 Supabase(같은 테이블·뷰)** 를 쓸 때, 각 행이 **어느 경계에 속하는지** 붙이는 **짧은 라벨**입니다. 비밀이 아니라 **감사·요약·필터용 태그**입니다.

- **레거시(키 없음):** 예전처럼 “전역 한 덩어리”로 보입니다. 잘못된 것이 아니라 **이행 구간**입니다.
- **지금 코드가 하는 일:** `ops_smoke_phase`, `cos_pretrigger_*` 등 **요약 스트림에 들어가는 이벤트 타입**의 payload에만, env에 값이 있으면 자동으로 네 가지 키를 채웁니다 (`withParcelDeploymentPayload`).  
  `cos_runs` 본문·일반 ledger 전체에는 아직 **강제하지 않습니다** (다음 단계).

## 2. 각 환경 변수에 실제로 뭘 넣으면 되나요?

공통 규칙: **영문·숫자·하이픈·밑줄** 위주(코드에서 이상 문자는 `_` 로 정규화). **시크릿·토큰·이메일·전체 URL을 넣지 마세요.** 길이는 대략 **64자 이내**를 권장합니다.

| 변수 | payload 필드 | 넣을 값 예시 | 용도 |
|------|----------------|-------------|------|
| `COS_PARCEL_DEPLOYMENT_KEY` | `parcel_deployment_key` | `railway_prod`, `railway_staging`, `local_dev`, `henry_mac` | **같은 DB**에 여러 **프로세스/배포**가 쓸 때 “이 이벤트는 어느 인스턴스에서 나왔나” 구분. `npm run audit:parcel-health` 의 `--parcel-deployment-key`·요약 스크립트와 짝. |
| `COS_WORKSPACE_KEY` | `workspace_key` | Slack **Team ID** `T0ABCDEFGH` 를 그대로 쓰거나, 짧게 `acme_corp` | **여러 Slack 워크스페이스**가 같은 Supabase를 쓸 때 경계. (지금은 단일 워크스페이스면 비워도 됨.) |
| `COS_PRODUCT_KEY` | `product_key` | `g1cos_slack`, `internal_cos` | **같은 회사·같은 DB**에 제품(봇)이 여러 개일 때. |
| `COS_PROJECT_SPACE_KEY` | `project_space_key` | `slack_cos`, `milestone_m2`, `repo_g1cos` | **프로젝트/이니셔티브** 단위로 잘라 보고 싶을 때. ledger·패킷 “스코프”와 맞출 이름을 정하면 나중에 합치기 쉬움. |
| `COS_SLACK_APP_ID` | (payload 아님) | Slack 앱 설정의 **App ID** `A0123456789` | 부트 로그 `cos_runtime_truth` 에만 노출. **멀티 Slack 앱** 대비 앵커. |
| `COS_OPS_SMOKE_SESSION_ID_PREFIX` | (세션 ID 접두사) | `prod_`, `henry_` | 자동 `smoke_session_id` 앞에 붙음. 요약 `--session-prefix` 와 짝. 테넌시와 **비슷한 목적**이지만 **세션 문자열**에만 적용. |

**운영 예 (흔한 조합):**

- Railway 프로덕션만:  
  `COS_PARCEL_DEPLOYMENT_KEY=railway_prod`  
  나머지 테넄시 키는 비움 → 요약/감사에서 배포 단위로만 자름.
- 스테이징 + 프로덕션이 **같은 Supabase**:  
  프로덕션 서비스에는 `COS_PARCEL_DEPLOYMENT_KEY=railway_prod`, 스테이징에는 `railway_staging` → 스트림에서 섞여도 필터로 분리.
- 로컬에서 프로덕 DB를 **읽기만** 할 때: 로컬 `.env`에는 `COS_PARCEL_DEPLOYMENT_KEY=local_readonly` 등으로 태그 → 운영 이벤트와 섞이지 않게(선택).

## 3. “무엇을 우선할지”에 따른 장단점 (지금 설계 기준)

| 우선 축 | 잘 맞는 상황 | 장점 | 단점 |
|---------|----------------|------|------|
| **deployment** (`COS_PARCEL_DEPLOYMENT_KEY`) | Railway 서비스 여러 개, prod/staging, 로컬 | **이미 CLI·감사·PostgREST 필터가 구현됨**. 설정이 단순. | 같은 배포 안에서 “제품 A vs B”는 못 잘라냄. |
| **workspace** | Slack 워크스페이스가 DB를 공유 | 고객/조직 단위 분리에 직관적. | 지금은 **요약 스트림 필터에 deployment만** 있음; workspace 필터는 후속. |
| **product** | 한 DB에 봇·제품 여러 개 | 제품별 대시보드에 좋음. | 값을 **수동으로 통일**해야 하고, 필터도 아직 deployment 중심. |
| **project_space** | 레포·마일스톤 단위로 보고 싶음 | 가장 세밀. | 태깅 누락·오타에 민감; 운영 규율이 필요. |

**솔직한 한 줄:** 지금 레포는 **deployment 축이 제일 완성도가 높습니다.** 나머지 세 키는 **스트림 뷰 컬럼·payload에는 들어가지만**, “한 방에 필터”까지는 다음 패치에서 붙이면 됩니다.

## 4. 추천 (근거)

1. **당장:** 운영 Railway에 `COS_PARCEL_DEPLOYMENT_KEY=railway_prod` (또는 서비스 이름 slug)만 넣어도 충분한 경우가 많습니다. 감사는 `npm run audit:parcel-health -- --parcel-deployment-key railway_prod` 로 **배포 단위 샘플**을 볼 수 있습니다.
2. **Slack 워크스페이스가 하나뿐이면** `COS_WORKSPACE_KEY` 는 비워도 됩니다. 나중에 **워크스페이스가 두 개 이상** 같은 DB를 쓰게 되는 순간 `T…` Team ID를 넣는 것을 권장합니다.
3. **`COS_PRODUCT_KEY` / `COS_PROJECT_SPACE_KEY`** 는 “보고서·필터를 제품/프로젝트 축으로도 자르고 싶다”는 요구가 생기면 그때 고정값을 넣고, 팀 안에서 **한 표로 SSOT**를 정하면 됩니다 (예: product=`g1cos`, project_space=`slack_cos_mvp`).

## 5. `audit:parcel-health` 결과와 테넌시

- **`cos_ops_smoke_events_null_run_id_count` 경고**, **스트림 고아 비율 advisory**는 **테넄시 키로 “고쳐지는” 문제가 아닙니다.**  
  `run_id` 없이 쌓이는 고아 줄기·D1 이중기록 구간의 **설계/운영 특성**입니다. 문서에도 “advisory는 정상일 수 있음”이라고 되어 있습니다.
- 테넌시 키는 **같은 DB 안에서 슬라이스**할 때 유리합니다. 고아 건수 자체를 줄이려면 **런 연결·기록 경로**를 손봐야 합니다 (별도 에픽).

## Owner actions

- Railway(또는 호스트) 환경 변수에 위 키 주입 후 재배포.
- 팀에서 `product_key` / `project_space_key` **표준 문자열** 한 줄만 정하면 됨.
- 상세 SSOT는 이 파일; `.env.example` 은 예시·요약.
