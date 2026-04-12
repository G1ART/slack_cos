# 파이프라인 “택배사무소” 게이트 비전 (2026-04-01)

정본 순서: `00_Document_Authority_Read_Path.md`.

## 0. 코드 앵커 (단일 게이트 모듈)

- `src/founder/opsSmokeParcelGate.js` — 플랫 행 → 세션 버킷(`buildSmokeSessionBucketsFromFlatRows`), 집계용 교차 레인(`SESSION_WIDE_AGGREGATE_EVENT_TYPES` + `filterRowsForSessionAggregateTopline`), 런 하니스 `ops_smoke_session_id` 앵커, intake 페이로드의 `smoke_session_id` 해석. **동일 run·다중 세션**이면 sid 없는 intake 는 기본 `dominant`(행 수 우세 + 결정적 tie-break); 하니스 맵이 있으면 최우선. 레거시 복제는 `intakeOrphanReplication: 'all'`.
- `src/founder/supervisorTickSharding.js` — 슈퍼바이저 tick 재진입 키 `r:` / `t:` (병렬 샤딩).
- `smokeOps.js` 는 기록·`aggregateSmokeSessionProgress`·founder-facing 포맷을 유지하고, **분류·버킷·필터**는 게이트를 호출한다.

## 0b. 이번까지 한 일과의 관계

- 최근 레포 패치는 **관측 파이프라인의 정합**(이벤트 타입 SSOT, intake·lineage 집계, 감사 체크리스트)에 가깝다.
- **GPT 시절 .env 부족 → 바이패스·감사 애드온 누적**이라는 가설은, “진실이 여러 경로·화이트리스트·테이블에 쪼개져 있다”는 현재 구조와 잘 맞는다. 다만 **그 레이어를 일괄 삭제하는 대청소는 아직 하지 않았다.** 삭제는 계약(테스트·운영 의존성) 없이 하면 회귀가 난다.

## 1. 장담할 수 없는 것

푸시 후에도 **원하는 화면/요약/슬랙 문구까지 항상 만족**한다고 장담할 수는 없다. 이유는 최소한 다음이 겹치기 때문이다.

- 프로덕션 **환경 변수·토큰·Supabase/Railway** 상태
- **Cursor/프로바이더** 응답 형식·가용성
- **실행 프로필**(예: `create_spec` 금지)과 사용자 프롬프트의 긴장
- 요약 스크립트의 **DB row 상한·병합 방식**

즉 “코드가 맞다”와 “한 번의 배포로 모든 현장 조건에서 성공”은 다르다. 대신 **불변식 테스트 + 단일 계약 + 명시적 실패**로 신뢰도를 올린다.

## 2. “택배사무소”로 이름 붙인 목표 (품질·속도·병렬)

우체국 택배 분류처럼, **들어온 소포(이벤트/콜백)를 키로 정렬하고, 같은 소포는 한 번만 처리하고, 창구는 병렬로 열린다**는 이미지로 정리한다.

| 원칙 | 의미 (구현 쪽 힌트) |
|------|---------------------|
| **단일 입구 계약** | 인바운드는 가능하면 한 스키마/한 append 경로로 정규화한 뒤 저장. “요약용/런타임용” 이중 진실 최소화. |
| **정렬 키 고정** | `run_id` + `packet_id` + `correlation`(request_id 등) 조합으로 idempotent 처리. 중복 콜백은 명시적 no-op. |
| **병렬** | 글로벌 뮤텍스로 전체를 막지 않고, **샤드 키**(예: `run_id` 또는 `thread_key` 해시) 단위로 처리 가능하게 설계. 지금도 run-scoped 처리 방향과 맞추면 됨. |
| **고속** | 핫 경로에서 불필요한 이중 DB 쓰기·거대 payload 중복 제거. 읽기는 **한 번의 시계열 쿼리(또는 뷰)** 로 끝내는 쪽이 이상적. |
| **고품질** | “스모크 통과”가 아니라 **불변식**: 예) 서명 검증 통과 + ledger 일치 시에만 `cursor_receive_intake_committed`; 그렇지 않으면 **원인 코드가 있는 거절 이벤트**. |
| **프로덕션은 실패를 숨기지 않음** | 필수 env 누락 시 조용한 바이패스 대신, **명시적 degraded 모드 플래그** 또는 기동 실패(정책 선택). |

## 3. 권장 페이즈 (끝까지 가는 순서)

**페이즈 A — 쓰기 계약 정리 (삭제보다 먼저 관측)**

- 표로 정리됨: `COS_Ops_Smoke_Callback_Pipeline_Audit_2026-04-01.md` §5.
- “없어도 되는” 감사 행 vs “법적·운영 필수” 행 구분 후, 중복만 제거 후보로 둔다 (D 전 단계).

**페이즈 B — 읽기 단일화**

- 적용됨: 뷰 `cos_ops_smoke_summary_stream` + `supabaseListMergedSmokeSummaryEventsFromStream`; 폴백은 이중 쿼리 + 소스 예산(`mergedSmokeSummaryPerSourceFetchBudget`).

**페이즈 C — 병렬·부하**

- 적용·고정: 프로세스 내 tick 재진입 키는 `supervisorTickSharding.js` — `r:${runId}` / `t:${threadKey}` (`runSupervisor.js`). 전역 단일 Set 이 아니라 **런·스레드 샤딩**.
- 남음: 웹훅 인그레스→wake 경로가 동일 원칙을 끝까지 지키는지 회귀 테스트·부하 시나리오.

**페이즈 D — 레거시 제거**

- 테스트와 운영 런북이 붙은 뒤에만 **바이패스 분기 대량 삭제**.

## 4. 다음 패치에서 잡을 수 있는 작은 한 걸음

- `smokeOps` **불변식 테스트**: `scripts/test-ops-smoke-parcel-gate-summary-invariant.mjs` — `summarizeOpsSmokeSessionsFromFlatRows` 경로에서 provider correlated + intake ⇒ `run_packet_progression_patched` (lineage 케이스 포함).
- intake persist 시 **`smoke_session_id` 주입**(컨텍스트 있을 때)으로 2차 귀속 의존도 감소 — 적용됨(`cursorReceiveCommit` + 하니스 병합).
- 뷰 SQL `IN` 목록 ↔ JS SSOT: `scripts/test-smoke-summary-stream-view-sql-ssot.mjs` 로 드리프트 방지.

## Owner actions

- 비전만으로는 배포 검증이 없다. 레포 관례: `npm test`, Supabase 모드면 `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 10` (하니스 앵커 자동 로드; 레거시 복제 감사는 `--intake-replicate-all`).
- Git 동기화는 워크스페이스 패치 보고 규칙 따름.
