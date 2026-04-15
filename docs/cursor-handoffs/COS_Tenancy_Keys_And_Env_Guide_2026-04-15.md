# 테넌시 키 · `.env` 가이드 (2026-04-15)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md` 의 최소 테넄시 키, `parcelDeploymentContext.js`, 요약 스트림 뷰.

## 0. 초보자용: `.env`가 뭔지, “여러 개”는 어떻게 되나요?

### `.env` 한 줄 요약

- **환경 변수** = 프로그램이 켜질 때 OS가 넘겨주는 **이름=값** 문자열입니다.
- **`.env` 파일** = 로컬에서 그걸 파일로 모아 두는 관례입니다. **Git에 올리지 않는 경우가 많습니다** (비밀이 들어가니까). 레포에는 `.env.example` 만 참고용으로 있습니다.
- **실행 주체는 “프로세스 하나”**입니다. `node app.js` 한 번 뜰 때 **그 프로세스마다** 환경 변수 집합이 하나입니다.

### “한 변수에 워크스페이스 여러 개” 가능한가요?

**아니요.** `COS_WORKSPACE_KEY` 같은 이름은 **값이 하나**만 들어갑니다. 쉼표로 `T111,T222` 처럼 넣는 방식은 **이 레포 코드가 지원하지 않습니다.**

**여러 Slack 워크스페이스가 같은 Supabase를 쓴다**는 보통 이런 그림입니다.

- 워크스페이스 A용 봇 → Railway **서비스(또는 컨테이너) 하나** → 그쪽 Variables에 `COS_WORKSPACE_KEY=TAAAA...`
- 워크스페이스 B용 봇 → **또 다른** 배포 → `COS_WORKSPACE_KEY=TBBBB...`

즉 **배포를 나누거나**, 아니면 나중에 코드가 **이벤트마다 `team_id`를 읽어서** 넣도록 바꾸는 식입니다. 지금 `COS_WORKSPACE_KEY`는 **env에서 고정 문자열 하나**만 읽습니다.

### `COS_SLACK_APP_ID` 도 앱이 여러 개면?

Slack에 등록된 **앱 하나**마다 App ID가 **하나**입니다.  
봇을 **앱 두 개**로 운영하면, 현실적으로는 **프로세스(배포)도 두 개**이고, 각 배포의 env에 **각자의** `COS_SLACK_APP_ID=A...` 를 넣습니다.  
**변수 이름을 `COS_SLACK_APP_ID_2` 처럼 새로 만들 필요는 없습니다** — 표준 이름은 그대로 두고, **배포 단위로 값만 다르게** 주면 됩니다.

### Supabase에도 넣나요?

**이 테넌시 키들은 Supabase 대시보드에 넣을 필요가 없습니다.**  
Node 봇이 **자기 프로세스의** env를 읽고, DB에 이벤트를 쓸 때 payload에 문자열을 **붙여 넣는** 역할입니다. DB는 “값이 저장되는 곳”이지, `COS_PARCEL_DEPLOYMENT_KEY`를 **읽어 오는 설정 저장소**가 아닙니다.

### `COS_PARCEL_DEPLOYMENT_KEY` 값은 어디서 “받아” 오나요?

**외부 API에서 자동으로 내려받는 값이 아닙니다.** 팀이 정한 **짧은 별칭**을 쓰면 됩니다.

- 예: `railway_prod`, `railway_staging`, `cursor_cloud_agent`, `local_henry`
- Railway **서비스 이름**을 그대로 써도 됩니다. 중요한 건 **prod와 staging이 섞일 때 서로 다른 문자열**인 것입니다.

### 스텝바이스텝: `COS_PARCEL_DEPLOYMENT_KEY` 넣기

1. **문자열 정하기** (30초): 예를 들어 운영만 있으면 `railway_prod` 로 고정.
2. **Railway**  
   - 브라우저에서 프로젝트 → **해당 서비스**(봇이 도는 서비스) → **Variables**.  
   - **New Variable** → Name `COS_PARCEL_DEPLOYMENT_KEY`, Value `railway_prod` → Save.  
   - 서비스 **Redeploy** (변수 반영).
3. **로컬 `.env`** (로컬에서도 같은 Supabase에 쓰고 싶을 때만)  
   - 레포 루트 `.env` 를 열어 한 줄 추가:
     `COS_PARCEL_DEPLOYMENT_KEY=local_dev`  
   - 운영과 **같은 DB**에 쓰면서 구분만 하고 싶으면 `local_readonly` 처럼 prod와 다른 값을 쓰면 됩니다.
4. **Cursor Cloud 에이전트**  
   - **그 환경에서 이 봇(`node app.js`)을 실제로 실행**한다면: Cursor / 호스트의 **Environment variables**에 Railway와 동일한 규칙으로 한 줄 추가.  
   - **봇은 Railway만 돌고**, Cursor는 코드 편집만 한다면 **넣지 않아도 됨** (DB에 태그 안 붙는 건 “그 프로세스가 안 돌았으니까”).
5. **Supabase**  
   - **설정 안 함.** (위 설명 참고)

로컬에서 `.env` 편집 후 내용만 확인할 때 (값은 터미널에 안 찍히게 주의):

```bash
cd /Users/hyunminkim/g1-cos-slack
grep -n '^COS_PARCEL_DEPLOYMENT_KEY=' .env || echo "(아직 .env에 없음 — 에디터로 추가)"
```

---

## 1. “테넌시”가 뭔가요?

**한 줄:** 여러 팀·제품·배포가 **같은 Supabase(같은 테이블·뷰)** 를 쓸 때, 각 행이 **어느 경계에 속하는지** 붙이는 **짧은 라벨**입니다. 비밀이 아니라 **감사·요약·필터용 태그**입니다.

- **레거시(키 없음):** 예전처럼 “전역 한 덩어리”로 보입니다. 잘못된 것이 아니라 **이행 구간**입니다.
- **지금 코드가 하는 일:**  
  - **요약 스트림:** `ops_smoke_phase`, `cos_pretrigger_*` 등 이벤트 payload에 env가 있으면 네 키를 채웁니다 (`withParcelDeploymentPayload`).  
  - **`cos_runs`:** 새 행이 Supabase·메모리·파일에 들어갈 때 `parcel_deployment_key`, `workspace_key`, `product_key`, `project_space_key` 컬럼에 **env 기본값 + 행에 이미 있으면 행 우선** (`applyCosRunTenancyDefaults` / `appRunToDbRow`). DB 마이그레이션: `20260416130000_cos_runs_tenancy_keys.sql`.

## 2. 각 환경 변수에 실제로 뭘 넣으면 되나요?

공통 규칙: **영문·숫자·하이픈·밑줄** 위주(코드에서 이상 문자는 `_` 로 정규화). **시크릿·토큰·이메일·전체 URL을 넣지 마세요.** 길이는 대략 **64자 이내**를 권장합니다.

| 변수 | payload 필드 | 넣을 값 예시 | 용도 |
|------|----------------|-------------|------|
| `COS_PARCEL_DEPLOYMENT_KEY` | `parcel_deployment_key` | `railway_prod`, `railway_staging`, `local_dev`, `henry_mac` | **같은 DB**에 여러 **프로세스/배포**가 쓸 때 “이 이벤트는 어느 인스턴스에서 나왔나” 구분. `npm run audit:parcel-health` 의 `--parcel-deployment-key`·요약 스크립트와 짝. |
| `COS_WORKSPACE_KEY` | `workspace_key` | Slack **Team ID** `T0ABCDEFGH` 를 그대로 쓰거나, 짧게 `acme_corp` | **여러 Slack 워크스페이스**가 같은 Supabase를 쓸 때 경계. (지금은 단일 워크스페이스면 비워도 됨.) |
| `COS_PRODUCT_KEY` | `product_key` | `g1cos_slack`, `internal_cos` | **같은 회사·같은 DB**에 제품(봇)이 여러 개일 때. |
| `COS_PROJECT_SPACE_KEY` | `project_space_key` | `slack_cos`, `milestone_m2`, `repo_g1cos` | **프로젝트/이니셔티브** 단위로 잘라 보고 싶을 때. ledger·패킷 “스코프”와 맞출 이름을 정하면 나중에 합치기 쉬움. |

### 2.1 레포 `package.json` name만 있을 때의 **제안** (코드 미적용)

팀이 아직 `COS_PRODUCT_KEY` 표를 안 정했을 때, **문서용 기본 후보만** 제시한다. 런타임은 env를 읽을 뿐이며, 아래 문자열을 코드가 자동 주입하지는 않는다 (팀 합의 후 env에 명시).

- 이 레포의 `package.json` `"name"` 은 현재 **`g1-cos-slack`** 이다.
- 위 §2의 규칙(하이픈·특수문자 지양, `_` 정규화와 맞추려면)에 맞춘 **후보 한 줄:** `g1_cos_slack` 또는 짧게 `g1cos_slack`.
- `COS_PROJECT_SPACE_KEY` 는 같은 방식으로 예: `slack_cos` · 레포 슬러그 `g1_cos_slack` 등을 **팀 표 한 줄**로 고정하는 것을 권장한다.
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
| **workspace** | Slack 워크스페이스가 DB를 공유 | 고객/조직 단위 분리에 직관적. | PostgREST는 **deployment로만 서버 필터**; workspace 등은 요약·감사 스크립트에서 **클라이언트 필터** (`--workspace-key` 등). |
| **product** | 한 DB에 봇·제품 여러 개 | 제품별 대시보드에 좋음. | 값을 **수동으로 통일**해야 함; `--product-key` 로 슬라이스. |
| **project_space** | 레포·마일스톤 단위로 보고 싶음 | 가장 세밀. | 태깅 누락·오타에 민감; `--project-space-key`·`--tenancy-include-legacy` 로 이행 구간 포함 여부 조절. |

**솔직한 한 줄:** **deployment** 축이 PostgREST·감사 샘플에서 서버 쪽 필터로 가장 강하고, 나머지 세 축은 **`summarize-ops-smoke-sessions.mjs` / `audit-parcel-ops-smoke-health.mjs`** 에서 env와 동일한 플래그로 잘라 씁니다.

**요약 스크립트 한 줄:** `--store file` 또는 `--store memory` 일 때는 `COS_PARCEL_DEPLOYMENT_KEY` env로 **자동 필터하지 않습니다** (로컬 JSONL에 태그가 없는 경우가 많음). 배포 스코프를 쓰려면 `--parcel-deployment-key` 를 넘기거나 Supabase 모드를 쓰세요.

## 4. 추천 (근거)

1. **당장:** 운영 Railway에 `COS_PARCEL_DEPLOYMENT_KEY=railway_prod` (또는 서비스 slug)만 넣어도 충분한 경우가 많습니다. 감사는 `npm run audit:parcel-health -- --parcel-deployment-key railway_prod` 로 **배포 단위 샘플**을 볼 수 있고, 필요하면 `--workspace-key`, `--product-key`, `--project-space-key`, `--tenancy-include-legacy` 를 조합합니다. JSON 출력에는 `ledger_tenancy_workspace_top` 외에 **`ledger_tenancy_product_top`**, **`ledger_tenancy_project_space_top`** (최근 ledger 샘플 분포), **`runs_tenancy_*`** (최근 `cos_runs` 직조회 히스토그램), 그리고 DB에 **`cos_runs_recent_by_tenancy`** RPC가 있으면 **`runs_tenancy_rpc_*`** (RPC 경로·샘플 크기·테이블 샘플과의 건수 정합)가 포함됩니다. `--workspace-key` / `--product-key` / `--project-space-key` 중 하나라도 주면 RPC·테이블 정합 비교는 스킵됩니다(스코프가 달라짐).
2. **Slack 워크스페이스가 하나뿐이면** `COS_WORKSPACE_KEY` 는 비워도 됩니다. 나중에 **워크스페이스가 두 개 이상** 같은 DB를 쓰게 되는 순간 `T…` Team ID를 넣는 것을 권장합니다.
3. **`COS_PRODUCT_KEY` / `COS_PROJECT_SPACE_KEY`** 는 “보고서·필터를 제품/프로젝트 축으로도 자르고 싶다”는 요구가 생기면 그때 고정값을 넣고, 팀 안에서 **한 표로 SSOT**를 정하면 됩니다 (예: product=`g1cos`, project_space=`slack_cos_mvp`).

## 5. `audit:parcel-health` 결과와 테넌시

- **`cos_ops_smoke_events_null_run_id_count` 경고**, **스트림 고아 비율 advisory**는 **테넄시 키로 “고쳐지는” 문제가 아닙니다.**  
  `run_id` 없이 쌓이는 고아 줄기·D1 이중기록 구간의 **설계/운영 특성**입니다. 문서에도 “advisory는 정상일 수 있음”이라고 되어 있습니다.
- 테넌시 키는 **같은 DB 안에서 슬라이스**할 때 유리합니다. 고아 건수 자체를 줄이려면 **런 연결·기록 경로**를 손봐야 합니다 (별도 에픽).

### 5.1 감사 임계 env (선택)

운영 DB가 크거나 D1 구간이 길면 기본값이 빡빡할 수 있다. **하드 `warnings`만** 조정할 때는 아래를 쓴다 (`scripts/audit-parcel-ops-smoke-health.mjs` 와 동일 이름).

| 환경 변수 | 기본 | 의미 |
|-----------|------|------|
| `COS_PARCEL_HEALTH_OPS_NULL_RUN_WARN` | 500 | `cos_ops_smoke_events` 에서 `run_id is null` 행 수가 이 값을 넘으면 **warning** |
| `COS_PARCEL_HEALTH_ORPHAN_FRACTION_WARN` | 0.35 | 스트림 샘플에서 고아 라벨 비율 — 초과 시 **advisory** (strict-only 모드에서 무시 가능) |
| `COS_PARCEL_HEALTH_PENDING_WAKE_WARN` | 50 | supervisor pending wake 건수 경고 임계 |

### 5.2 `cos_runs_recent_by_tenancy` RPC (M6)

- DDL SSOT: `supabase/migrations/*_cos_runs_recent_by_tenancy_rpc.sql`.
- 앱/감사 코드 SSOT: `src/founder/runStoreSupabase.js` 의 `COS_RUNS_RECENT_BY_TENANCY_RPC`, **`supabaseRpcCosRunsRecentByTenancy`**.
- RPC가 없거나 PostgREST 호출이 실패하면 `runs_tenancy_rpc_ok` 가 false 이고, 메시지는 **advisory**에 붙는다(기존 동작).

### 5.3 Supervisor·복구 백스탑과 `COS_PARCEL_DEPLOYMENT_KEY`

`COS_PARCEL_DEPLOYMENT_KEY` 가 비어 있지 않으면, 같은 Supabase를 쓰는 **여러 Railway 서비스**가 서로의 `cos_runs` 행을 밟지 않도록 periodic supervisor 가 고르는 후보 목록에 **배포 키 일치 행만** 포함한다.

- 적용 경로: `supabaseListNonTerminalRunIds`, `supabaseListPendingSupervisorWakeRunIds`, `supabaseListRunsWithRecoveryEnvelopePending`, `supabaseListThreadKeys` (모두 `runStoreSupabase.js`). 메모리·파일 스토어 경로도 동일 규칙.
- **행의 `parcel_deployment_key` 가 null** 인 레거시 행은 env 가 설정된 프로세스에서는 **목록에서 제외**된다. 운영에서 계속 tick 받으려면 행을 백필하거나, 일시적으로 env 에서 키를 비운다.

## Owner actions

- Railway(또는 호스트) 환경 변수에 위 키 주입 후 재배포.
- 팀에서 `product_key` / `project_space_key` **표준 문자열** 한 줄만 정하면 됨.
- 상세 SSOT는 이 파일; `.env.example` 은 예시·요약.
