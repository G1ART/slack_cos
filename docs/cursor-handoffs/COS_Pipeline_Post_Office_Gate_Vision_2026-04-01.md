# 파이프라인 “택배사무소” 게이트 비전 (2026-04-01)

정본 순서: `00_Document_Authority_Read_Path.md`.

## 0. 코드 앵커 (단일 게이트 모듈)

- `src/founder/opsSmokeParcelGate.js` — 플랫 행 → 세션 버킷(`buildSmokeSessionBucketsFromFlatRows`), 집계용 교차 레인(`SESSION_WIDE_AGGREGATE_EVENT_TYPES` + `filterRowsForSessionAggregateTopline`), 런 하니스 `ops_smoke_session_id` 앵커, intake 페이로드의 `smoke_session_id` 해석. **동일 run·다중 세션**이면 sid 없는 intake 는 기본 `dominant`(행 수 우세 + 결정적 tie-break); 하니스 맵이 있으면 최우선. 레거시 복제는 `intakeOrphanReplication: 'all'`.
- `src/founder/supervisorTickSharding.js` — 슈퍼바이저 tick 재진입 키 `r:` / `t:` (병렬 샤딩).
- `smokeOps.js` 는 기록·`aggregateSmokeSessionProgress`·founder-facing 포맷을 유지하고, **분류·버킷·필터**는 게이트를 호출한다.

## 0b. 이번까지 한 일과의 관계

- 최근 레포 패치는 **관측 파이프라인의 정합**(이벤트 타입 SSOT, intake·lineage 집계, 감사 체크리스트)에 가깝다.
- **GPT 시절 .env 부족 → 바이패스·감사 애드온 누적**이라는 가설은, “진실이 여러 경로·화이트리스트·테이블에 쪼개져 있다”는 현재 구조와 잘 맞는다.
- **대청소(페이즈 D)** 는 아래 5절 기준으로만 진행한다. 임의로 고아 쓰기를 끄면 correlation 실패·서명 실패 감사가 DB에서 사라진다.

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
- 웹훅→wake: `processCanonicalExternalEvent` 가 `signalSupervisorWakeForRun` 로 durable 플래그 설정; `app.js` 리스너가 `runId` 있으면 `tickRunSupervisorForRun`. 회귀: Cursor `test-cursor-callback-wakes-correlated-run-supervisor.mjs`, GitHub `test-github-external-event-targets-correlated-run-not-latest.mjs` (`pending_supervisor_wake` 포함). 부하·다중 동시 웹훅 시나리오는 선택 과제.

**페이즈 D — 레거시 제거**

- 런북: `COS_Ops_Smoke_Callback_Pipeline_Audit_2026-04-01.md` 6절 (전제·후보 순위).
- **쓰기 축소·바이패스 삭제**는 5절의 조건을 만족할 때만. 고아 비율이 높은 상태에서 D1 테이블을 “폐쇄”하는 것은 재건이 아니라 맹목이다.

## 4. “택배사무소가 작동한다”의 완료 정의 (코드 기준, A–C)

아래를 만족하면 **백엔드·DB 계약 위의 택배사무소(A–C)는 완료**로 본다. 이것만으로 **슬랙 문구·스레드 UX**까지 증명되지는 않는다(5절).

| 층 | 완료 판정 |
|----|-----------|
| 게이트·요약 | `npm run verify:parcel-post-office` — `scripts/verify-parcel-post-office.mjs` 가 게이트 불변식·뷰 SSOT·병합 예산·스트림 경로 목업·감사 스킵·웹훅 wake·런 스코프 wake 회귀를 한 번에 돈다 (Slack/OpenAI/실 DB 불필요). |
| 전체 회귀 | `npm test` 통과. |
| 성능 계약(콜백·집계·strict recovery 가드) | `npm run verify:performance-contract` 통과. 문서: `COS_Performance_Contract_Ultimate_Goal_And_Roadmap_2026-04-12.md`. |
| 프로덕션 관측 | Supabase 자격이 있는 환경에서 `npm run audit:parcel-health` — `ok: true` 이고 `warnings` 가 비면 런타임 하드 게이트 양호; `advisory` 만 있으면 D1 이중기록 구간에서 흔한 고아 비율 안내(장애 아님). |
| 사람 확인 | `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 10` 등으로 요약 문맥이 기대와 맞는지(문구·상한은 환경 의존). |

이미 반영된 구현 앵커(참고): 불변식 `test-ops-smoke-parcel-gate-summary-invariant.mjs`, intake `smoke_session_id` 주입(`cursorReceiveCommit` + 하니스), 뷰↔JS SSOT `test-smoke-summary-stream-view-sql-ssot.mjs`.

## 5. 당신이 말한 “끝까지”를 한 번에 정리 (빙글거림 금지)

| 말 | 뜻 |
|----|-----|
| **택배사무소 구조가 끝** | A–C: 게이트·뷰·wake·샤딩·불변식 테스트. **`npm run verify:parcel-post-office` + `npm test` + (가능하면) `npm run audit:parcel-health`** 로 레포·DB에서 증명. **지금 여기까지 온 상태다.** |
| **슬랙까지 포함해 완전히 끝** | Socket Mode·토큰·스레드·파운더 응답까지 포함한 **현장 계약**. 이건 코드만으로는 증명 불가. **한 번은** 운영 채널에서 짧은 스모크(클라우드 한 사이클 또는 `/readyz` + 스레드 확인)를 돌려야 “슬랙에서도 된다”고 말할 수 있다. |
| **청소까지 끝 (D)** | `cos_ops_smoke_events` 고아 행은 **서명 실패·JSON 실패·correlation 실패** 등이 `run_id` 없이 쌓인 **감사 궤적**이다. 지금처럼 고아 비율이 높을 때 이 쓰기를 끄거나 테이블을 비우는 것은 **“안 되던 것 폐쇄”가 아니라 관측 맹탕**이다. D는 **상관 성공률이 올라간 뒤** 쓰기 축소를 설계하거나, **명시적 opt-in 플래그**로만 한다. |
| **지금 당장 폐쇄해도 되는 것** | 운영에 `COS_SMOKE_SUMMARY_LEGACY_MERGE_ONLY=1` 이 켜져 있다면 **끄기**(기본은 뷰 단일 읽기). 기동 로그 `cos_runtime_truth` 에 `smoke_summary_read_path` 로 노출된다. 그 밖의 경로는 이름 없이 끄지 말 것. |

## Owner actions

- 빠른 축 확인: `npm run verify:parcel-post-office`
- 성능 계약 묶음: `npm run verify:performance-contract`
- 전체: `npm test`
- 프로덕션 DB: `npm run audit:parcel-health`, `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 10` (레거시 복제 감사는 `--intake-replicate-all`)
- **슬랙까지 “완전 끝”을 주장하려면**: 운영 앱 기준으로 파운더 스레드에서 짧은 스모크 1회(또는 동일 조건 스테이징). 생략하면 백엔드 계약만 증명된 것이다(5절 표).
- 기동 시 `cos_runtime_truth` JSON 에서 `smoke_summary_read_path` 가 `stream_view_default` 인지 확인(레거시 병합 강제 여부).
- Git 동기화는 워크스페이스 패치 보고 규칙 따름.
