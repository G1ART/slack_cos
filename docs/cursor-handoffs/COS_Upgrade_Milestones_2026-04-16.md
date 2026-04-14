# COS·하네스 업그레이드 마일스톤 (2026-04-16)

**상위:** `COS_Layer_Epic_LockIn_2026-04-14.md`, `COS_Phase1_CrossLayer_Envelope_2026-04-15.md`, `COS_Tenancy_Keys_And_Env_Guide_2026-04-15.md`.

**외부 로드맵 SSOT:** `G1_COS_Upgrade_Roadmap_2026-04-14.md` (M1~M10, non-goals). **제품 서술 SSOT:** `WHAT_WE_ARE_BUILDING_G1_COS_2026-04-14.md`.

**목표 수준(한 줄):** 같은 Supabase·같은 COS 프로세스 안에서 **워크스페이스·제품·프로젝트·배포** 경계가 **자동·일관**하게 태깅·필터되고, **ledger·스트림·요약**이 같은 식별자 어휘를 쓰며, **Phase 1 봉투** 필드가 코드 경로에 점진 이식된다.

## 구현 스냅샷 (누적)

- **G1 로드맵 M1 (일부):** `src/founder/canonicalExecutionEnvelope.js` — `mergeCanonicalExecutionEnvelopeToPayload` 가 `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` append 경로(`appendCosRunEvent` / `appendCosRunEventForRun`) 및 `recordCosPretriggerAudit` 에서 env 테넄시 + `run_id` / `thread_key` / `packet_id` 빈칸만 채움. 테스트: `scripts/test-canonical-execution-envelope-smoke-payload.mjs`.

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
- [ ] 동일 정보를 **ops_smoke / pretrigger** 등 “한 줄 진단”에만 선택 반영(필요 시).

**완료 기준:** Railway에서 턴 단위로 **어느 Slack 워크스페이스인지** 로그만으로 구분 가능.

### M1 — 동적 `workspace_key` (핵심 “멀티” 1단계)

- [ ] **규칙 SSOT:** `COS_WORKSPACE_KEY` 가 비어 있을 때만 `sanitize(slack_team_id)` 를 `workspace_key` 로 사용; env가 있으면 **env 우선** (운영 단일 팀은 기존과 동일).
- [ ] **전달 경로:** `handleFounderSlackTurn` → `runCosEvents.append` / `withParcelDeploymentPayload` / `applyCosRunTenancyDefaults` 가 참조할 **요청 스코프** (AsyncLocalStorage 또는 명시 `opts` 전달 — 설계 확정 필요).
- [ ] **테스트:** 단위 + 최소 1개 통합(메모리 스토어).

**완료 기준:** env 없이도 **해당 팀으로 태그된** ops smoke / cos_runs 샘플이 요약 필터 `--workspace-key=T…` 와 맞는다.

### M2 — ledger·이벤트 전 구간 테넄시

- [ ] `appendCosRunEvent` / 관련 경로에서 **payload 또는 top-level**에 네 키 주입(이미 스트림 뷰와 동일 규칙).
- [ ] **중복 제거:** `parcelDeploymentContext` 한 곳에서 “행 + env + 요청 스코프” 병합 헬퍼.
- [ ] **뷰/마이그레이션:** `cos_run_events` 테이블에 컬럼 추가가 필요하면 **열 끝 추가만** (42P16 방지 — 에픽 문서).

**완료 기준:** `summarize` / Supabase 직접 쿼리에서 **ledger 이벤트만**으로도 배포·워크스페이스 슬라이스 가능.

### M3 — 택배사무소 “자동 슬라이스” 운영

- [ ] `audit-parcel-health` / Railway 대시보드용 **한 페이지 요약**: `tenancy_keys_presence` + 최근 N건 `slack_team_id` 분포(식별자만).
- [ ] (선택) **제품/프로젝트** 기본값: 레포 `package.json` name → `COS_PRODUCT_KEY` 기본 제안은 **문서만**, 코드 기본값은 팀 합의 후.

**완료 기준:** 온콜이 **env 없이**도 “어느 팀/배포가 깨졌는지” 5분 안에 좁힌다.

### M4 — Phase 1 봉투 코드 이식 (점진)

- [ ] `intent` (짧은 기계 라벨) — **하네스 dispatch 한 경로**에만 1필드 추가 + 테스트.
- [ ] `role` — 패킷 메타와 중복 시 **한쪽 SSOT**로收斂.
- [ ] 문서 `COS_Phase1_CrossLayer_Envelope` 표와 **필드명 diff 없음**.

**완료 기준:** 새 PR이 “이름 임의 생성” 대신 표의 키만 쓴다.

### M5 — 하네스·COS 경계 (통제 아님, 품질)

- [ ] **불필요한 추상 금지:** 범용 “테넌시 매니저” 클래스 추가 없이, 기존 `parcelDeploymentContext` + 소량 헬퍼로 유지.
- [ ] **회귀:** `npm test` + `verify:parcel-post-office` + (주간) Slack 스모크 1턴은 **사람 개입** 유지.

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
