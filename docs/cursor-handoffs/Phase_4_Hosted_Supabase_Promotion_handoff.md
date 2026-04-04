# Phase 4 — Hosted Runtime + Plans Supabase Promotion

> 패치명: **Phase 4 — Hosted Runtime + Plans Supabase Promotion**  
> Slack G1 COS · Cursor/운영 이관용 handoff.

---

## 1. 변경 파일 목록

| 영역 | 파일 |
|------|------|
| 스키마 | `supabase/migrations/20260319_g1cos_live_core_tables.sql` — **복구** (work_items, work_runs, approvals, project/environment context) |
| 스키마 | `supabase/migrations/20260320_g1cos_plans.sql` — `g1cos_plans` |
| Supabase CLI 초기화 | `supabase/config.toml`, `supabase/.gitignore` — `npx supabase init` 생성 기본 로컬 스캐폴드 |
| 합본 SQL (복붙용) | `docs/cursor-handoffs/Phase_4_supabase_combined_migrations.sql` |
| 코어 타입 | `src/storage/core/types.js` — `CORE_DUAL_WRITE_COLLECTIONS` (plans, approvals, work_items, work_runs, project_context, environment_context) |
| Supabase 어댑터 | `src/storage/core/supabaseStoreAdapter.js` — plans/work/approval 등 `toArrayRow` |
| 스토어 팩토리 | `src/storage/core/storeFactory.js` — hosted 기본 dual + read supabase, read fallback 로그 |
| 텔레메트리 | `src/storage/core/storageTelemetry.js` |
| 런타임 | `src/runtime/env.js` — `validateHostedStorageEnv` |
| 시작 | `src/runtime/startup.js` — hosted storage 검증, handoff 경로 수정 |
| 헬스 | `src/runtime/health.js` — work_items + g1cos_plans connectivity |
| 앱 | `app.js` — `startup_storage_profile` 확장 (`read_source`, `fallback_on_supabase_read_error`, `silent_fallback`) |
| 예시 env | `.env.example` |
| 스모크 | `scripts/test-phase4-storage.mjs` |
| 구현 ledger 참조 | `docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` §23.17 |

---

## 2. Supabase 승격된 대상 범위

- **plans** → `g1cos_plans` (dual-write, read 우선 대상)
- **approvals** → `g1cos_approvals`
- **work_items** → `g1cos_work_items`
- **work_runs** → `g1cos_work_runs`
- **project_context / environment_context** → `g1cos_project_context`, `g1cos_environment_context`

위 컬렉션은 `CORE_DUAL_WRITE_COLLECTIONS`에 포함되며, `STORAGE_MODE=dual` + Supabase 설정 시 **쓰기 이중화**, `STORE_READ_PREFERENCE=supabase` 시 **읽기 Supabase 우선**(실패 시 JSON + 로그).

---

## 3. read preference 최종 정책

| 조건 | 기본 `STORAGE_MODE` | 기본 `STORE_READ_PREFERENCE` |
|------|---------------------|------------------------------|
| `getRuntimeMode()==='hosted'` (`RUNTIME_MODE=hosted` 또는 `NODE_ENV=production`) | `dual` | `supabase` |
| 로컬 | `json` | `json` |

- env 명시 시 **env 우선**.
- Supabase 미구성 + supabase 선호 → `store_read_preference_unmet` 후 JSON 경로.
- **read-after-write**: dual-write가 Supabase까지 성공하면 이후 `get`/`list`는 Supabase에서 최신을 읽음. Supabase 쓰기 실패 시 `store_dual_write_supabase_fail` — JSON만 최신일 수 있음(운영자 로그 확인).

---

## 4. hosted env / health 보강

**hosted 필수**

- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — 누락 시 `runStartupChecks`에서 **throw**.

**권장**

- `RUNTIME_MODE=hosted`
- `STORAGE_MODE`, `STORE_READ_PREFERENCE` (미설정 시 hosted에서 dual / supabase 기본)

**부팅 로그 (`startup_storage_profile`)**

- `environment`, `runtime_mode`, `storage_mode`, `read_source`, `storage_read_preference`, `write_mode`, `fallback_on_supabase_read_error`, `silent_fallback: false`, `supabase_configured`, `ssot_collections`

**헬스 (`상태점검`)**

- `g1cos_work_items`, `g1cos_plans` connectivity, counts, read preference, dual-write 컬렉션 목록

---

## 5. TEST 1~5 결과

| 테스트 | 결과 | 비고 |
|--------|------|------|
| TEST 1 계획등록 | **수동** | Slack + Supabase 적용 후 |
| TEST 2 계획 조회 3종 | **수동** | query-only 경로 + Supabase read |
| TEST 3 업무상세/검토 | **수동** | 동일 |
| TEST 4 read-after-write | **수동** | dual Supabase 성공 가정 |
| TEST 5 startup/health | **부분 자동** | `node scripts/test-phase4-storage.mjs` 통과; 실 연결은 배포 환경 |
| 회귀 | **자동** | `node scripts/test-operations-loop.mjs` 통과 |

---

## 6. 남은 리스크 (2~3)

1. **`20260319`가 과거 손상되어 있었음** — 이번에 복구함. 이미 수동으로 다른 스키마를 쓰는 프로젝트는 **diff 검토** 필요.
2. **`replaceAll` 대량 upsert** — PostgREST 한도/타임아웃.
3. **Slack 응답에 fallback 표시** — 현재는 구조화 **로그** 중심; 채널 가시성은 Phase 4b 권장.

---

## 7. 다음 추천 패치 1개

**Phase 4b — 백필 CLI + 조회 응답에 `read_source` 한 줄** (JSON→Supabase 동기화 스크립트, query/work 명령 푸터).

---

## 8. doc 폴더 handoff

- 본 파일
- `docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md` §23.17
- `docs/cursor-handoffs/Phase_4_supabase_combined_migrations.sql`
- `supabase/config.toml`, `supabase/.gitignore` (Supabase CLI 초기화)

### Fallback 정책

- **silent fallback 금지**: `store_read_fallback`, `store_read_ok_after_fallback`, `store_dual_write_supabase_fail` 등 JSON 로그.
- 부팅 로그에 `silent_fallback: false`, `fallback_on_supabase_read_error` 명시.

### 운영 로그 포인트 (grep)

- `startup_storage_profile`
- `storage_telemetry`:`store_read_ok` | `store_read_fallback` | `store_read_ok_after_fallback` | `store_dual_write_ok` | `store_dual_write_supabase_fail` | `store_read_preference_unmet`
- `query_route_*` (조회 명령, Council 미사용)

---

### Next patch recommendation

- **Phase 4b (백필 CLI + Slack 푸터 read_source)**  
- 이유: 운영자가 **채널만** 봐도 JSON fallback 여부를 알 수 있게 하고, 기존 JSON만 있는 plans/work를 Supabase로 맞춰 TEST 2~4의 “stale 금지”를 현실화한다.

---

### Owner actions (copy-paste ready)

#### 1. SQL to run (있다면만)

**한 번에 실행:** 저장소 파일 `docs/cursor-handoffs/Phase_4_supabase_combined_migrations.sql` 전체를 Supabase **SQL Editor**에 붙여넣어 실행.

**또는 순서대로:**

1. `supabase/migrations/20260319_g1cos_live_core_tables.sql`
2. `supabase/migrations/20260320_g1cos_plans.sql`

#### 2. Local run commands

```bash
cd /Users/hyunminkim/g1-cos-slack
npm install
node scripts/test-phase4-storage.mjs
node scripts/test-operations-loop.mjs
node scripts/test-query-only-route.mjs
npm start
```

(`package.json`에 `build`/`test` 스크립트 없음 — 위 `node scripts/...` 가 회귀 스모크.)

#### 3. Git commands

```bash
cd /Users/hyunminkim/g1-cos-slack
git status
git add supabase/migrations/20260319_g1cos_live_core_tables.sql supabase/migrations/20260320_g1cos_plans.sql docs/cursor-handoffs/Phase_4_supabase_combined_migrations.sql docs/cursor-handoffs/Phase_4_Hosted_Supabase_Promotion_handoff.md docs/G1_ART_Slack_COS_Handoff_v2_2026-03-18.md src/runtime/startup.js app.js .env.example
git commit -m "Phase 4: hosted Supabase primary read path, restore core migration, startup storage profile"
git push origin main
```

(브랜치가 `main`이 아니면 마지막 줄의 `main`을 실제 브랜치명으로 바꿀 것.)

#### 4. Hosted deploy actions (있다면)

- **확인 필요**: 실제 호스팅(Render/Railway/Fly 등)이 없으면 수동 실행만 해당.
- **env 추가**: `RUNTIME_MODE=hosted`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, (선택) `STORAGE_MODE=dual`, `STORE_READ_PREFERENCE=supabase`
- **배포 후**: 프로세스 로그에서 `startup_storage_profile` JSON 1줄 확인 → `read_source`, `fallback_on_supabase_read_error` 확인
- Slack에서 `상태점검` → `supabase connectivity (work_items)` / `(plans)` pass 확인
