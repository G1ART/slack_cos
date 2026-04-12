# Ops 스모크 · Cursor 콜백 파이프라인 감사 (2026-04-01)

정본 읽기 순서는 `00_Document_Authority_Read_Path.md` 를 따른다. 이 문서는 **왜 한 줄씩 패치가 반복됐는지** 구조적으로 정리하고, **다시 흔들리지 않게** 점검할 포인트를 모은다.

**역사적 맥락**: 초기에 `.env`/런타임 조건이 불완전한 상태에서 기능을 “우선 통과”시키려다 **바이패스·중복 감사·이중 저장**이 쌓였을 가능성이 크다. 그런 층을 한 번에 뜯어내는 것은 **회귀 면적이 넓어** 단계적 페이즈가 필요하다. 스모크 성공을 넘어선 목표(품질·속도·병렬)는 `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md` 에 정리했다.

## 1. 한가닥 패치가 반복된 구조적 이유

- **이중 저장소**: 같은 관측이 `cos_run_events` 와 `cos_ops_smoke_events` 에 갈라질 수 있고, 요약은 **병합 + 상한(slice)** 으로만 본다 (`supabaseListMergedSmokeSummaryEvents`).
- **화이트리스트가 여러 벌**: 과거에는 `cos_run_events` 조회용 타입 집합이 `cos_ops_smoke_events` / 파일 요약용 집합과 **달랐다**. 한쪽에만 타입을 추가하면 다른 경로에서 행이 **영구 누락**된다.
- **집계 vs 추출의 이중 규칙**: `summarizeOpsSmokeSessionsFromFlatRows` 는 `aggregateSmokeSessionProgress(rowsForAgg)` 에 **필터된** 행만 넣고, 머신 필드 추출은 `primaryRows` 또는 전체 `rows` 를 섞어 쓴다. **attempt lineage** 가 켜지면 `filterRowsForSessionAggregateTopline` 이 교차 시도 증거만 예외로 두는데, 예외 목록에 빠진 이벤트는 위상에서 사라진다 (intake 누락 버그, v13.80b 수정). **post-callback `ops_smoke_phase`**(`recordOpsSmokeAfterExternalMatch` 등)는 `attempt_seq` 없이 기록되므로, 예외 없이면 `supervisor_wake_enqueued`·`authoritative_callback_closure_applied` 가 집계에서 빠져 DB 진실과 요약이 어긋난다 — **v13.83**: `SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE` (`opsSmokeParcelGate.js`).
- **스키마 불균형**: `cursor_receive_intake_committed` 는 종종 `smoke_session_id` 없이 기록되므로, 세션 버킷팅에서 **2차 귀속**(run_id 매칭)이 필요하다.

## 2. 잠재 원인 체크리스트 (다음 이슈 때 위에서부터)

| 구역 | 증상 힌트 | 확인할 것 |
|------|-----------|-----------|
| SSOT 타입 | 파일 요약엔 있는데 Supabase만 다름 / 그 반대 | `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` 한 벌만 쓰는지 (`runStoreSupabase` + `runCosEvents` Set) |
| 병합 상한 | 최근 세션이 요약에서 잘림 | `mergedSmokeSummaryPerSourceFetchBudget` — 소스별 `min(10k, finalLimit*2)` 후 merge·`slice(finalLimit)` (`runStoreSupabase.js`). `--max-rows` 로 최종 한도 조정. |
| 세션 귀속 | intake 가 아예 세션에 안 붙음 | `summarizeOpsSmokeSessionsFromFlatRows` 의 `pendingIntakeNoSid` + `runIdToSmokeSids` |
| 집계 필터 | 콜백은 있는데 `without_progression_patch` / DB엔 wake·closure 있는데 요약만 `breaks_at supervisor_wake` | `filterRowsForSessionAggregateTopline` — intake·ingress·GitHub 타입 + **post-callback ops phase**(`SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE`, v13.83) |
| 쓰기 시점 | DB엔 없고 런타임만 성공 | Railway/COS 프로세스의 Supabase 자격·`append` 실패 로그 |
| 정책 레이어 | Slack 에서 `create_spec` 차단 | 실행 프로필 / `toolsBridge` — **요약 집계와 별개** |
| 프로바이더 리포트 | Cursor 구조화 리포트만 성공 | 그건 외부 제품 UI; COS 는 **자체 이벤트·집계**로만 단정 |

## 3. 권장 “재건” 방향 (한 번에 묶어 가기)

1. **타입 SSOT**: `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` 만 정의하고, Supabase `cos_run_events` 조회·파일 스캔 모두 여기서 파생 (이번 패치).
2. **단일 정규화 레이어**(선택): flat row 를 세션에 넣기 전에 `enrichRowForSmokeSummary(row)` 로 `smoke_session_id` / `attempt_seq` 를 가능한 한 채운다 (intake 에 sid 주입까지).
3. **불변식 테스트**: “provider correlated + intake committed ⇒ `phases_seen` 에 `run_packet_progression_patched`” 같은 **속성 테스트**를 `smokeOps` 에 고정.
4. **병합 단일 시계열**: 뷰 `cos_ops_smoke_summary_stream` + `supabaseListMergedSmokeSummaryEventsFromStream` (마이그레이션 `20260413103000`). 실패 시 `supabaseListMergedSmokeSummaryEventsFallback` + 소스 예산. `COS_SMOKE_SUMMARY_LEGACY_MERGE_ONLY=1` 로 강제 레거시.

## 4. 코드 앵커

- **게이트(입구·분류)**: `src/founder/opsSmokeParcelGate.js` — 버킷 빌드, `SESSION_WIDE_AGGREGATE_EVENT_TYPES`, **`SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE`**(v13.83), 하니스 `ops_smoke_session_id` 앵커, intake `smoke_session_id` 보강, 다중 세션 시 orphan intake `dominant` 귀속(`inferPreferredSmokeSessionIdPerRunFromFlatRows`)
- 타입 SSOT + 병합: `src/founder/runStoreSupabase.js` — `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES`, `COS_OPS_SMOKE_SUMMARY_STREAM_VIEW`, `supabaseListMergedSmokeSummaryEvents`, `supabaseListMergedSmokeSummaryEventsFallback`, `supabaseMapHarnessOpsSmokeSessionIdsByRunIds`
- 파일/메모리 필터: `src/founder/runCosEvents.js` — `SMOKE_SUMMARY_EVENT_TYPES`
- 세션 요약 본문: `src/founder/smokeOps.js` — `summarizeOpsSmokeSessionsFromFlatRows`, `aggregateSmokeSessionProgress`, founder-facing
- Intake 기록: `src/founder/cursorReceiveCommit.js` — `cursor_receive_intake_committed` (v13.82: 다중 accepted id 후보 + ledger 정합 재시도, `COS_vNext13_82_Cursor_Intake_Id_Alignment_2026-04-01.md`)
- 런 하니스 보존: `src/founder/executionRunStore.js` — `finalizeRunAfterStarterKickoff` 가 기존 `harness_snapshot` 필드 병합
- 슈퍼바이저 샤딩 키: `src/founder/supervisorTickSharding.js` ( `runSupervisor.js` 에서 사용)
- 요약 불변식: `scripts/test-ops-smoke-parcel-gate-summary-invariant.mjs`

## 5. 쓰기 이중성 요약 (페이즈 A — 삭제 전 관측)

같은 관측이 **두 테이블**로 갈라질 수 있다. 요약은 뷰/병합으로 합치되, **기록 경로**는 아래를 본다.

| 이벤트·유형 | `run_id` 가 있을 때 (일반) | `run_id` 없음·고아 (대체) |
|-------------|---------------------------|---------------------------|
| `ops_smoke_phase` | `cos_run_events` (`recordOpsSmokePhase` → `appendCosRunEventForRun`) | (현 구조: sid+runId 없으면 기록 생략) |
| `cos_cursor_webhook_ingress_safe` | `cos_run_events` | Supabase: `cos_ops_smoke_events` / 그 외: 요약용 orphan 파일 행 |
| `cos_github_fallback_evidence` | `cos_run_events` | 위와 동일 |
| `cos_pretrigger_tool_call` / `_blocked` | `cos_run_events` (pretrigger 감사) | orphan 가능 |
| `cursor_receive_intake_committed` | `cos_run_events` | run 없으면 기록 경로가 달라질 수 있음 — 운영 시 로그 확인 |
| 기타 SSOT 요약 타입 | 캐논 외부 이벤트·도구 결과 등 **런 앵커**가 있으면 `cos_run_events` 우선 | 앵커 없으면 `cos_ops_smoke_events` 또는 병합 스트림의 `_orphan` 런 |

중복 제거(D 페이즈)는 **위 표에서 “필수 한 곳만”으로 줄일 후보**를 집은 뒤 테스트·런북과 함께 진행한다.

## 6. 페이즈 D — 제거·축소 런북 (코드 삭제는 승인·테스트 후)

**전제 (이 순서를 만족하기 전에는 테이블/분기 삭제 금지)**

1. `npm test` 전부 통과, 프로덕 Supabase에 `cos_ops_smoke_summary_stream` 뷰 적용됨.
2. `summarize-ops-smoke-sessions.mjs` 로 최근 운영 데이터 샘플이 기대와 맞는지 확인.
3. 고아( run_id 없음 ) 트래픽 비율·원인 로그를 한 번 이상 점검 — **고아 경로를 끄면 요약에서 사라질 행**이 무엇인지 목록화.

**후보 우선순위 (보수적 순)**

| 순위 | 대상 | 비고 |
|------|------|------|
| D1 | `cos_ops_smoke_events` **전용** 고아 행 | `run_id` 가 붙기 시작한 뒤에도 여전히 고아만 남는지 모니터링. 뷰 병합은 유지하되 **쓰기** 축소는 고아 비율이 무시 가능할 때만. |
| D2 | 동일 사실에 가까운 `cos_run_events` 이벤트 타입 쌍 | 캐논 외부 이벤트 vs `ops_smoke_phase` 중 **요약·감사 중 하나만** 써도 되는 쌍을 표로 따로 뽑은 뒤 제거 (회귀 테스트 추가 필수). |
| D3 | 조용한 바이패스 분기 | `COS_*` 환경변수로 우회하던 경로 — 각각 “거절 이벤트” 또는 명시적 degraded 로 대체 가능한지 검토. |

**쓰기 제거 시점**: 비전 문서 5절(슬랙·D 경계)과 운영 감사(`audit:parcel-health`) 추이를 같이 본 뒤에만 진행. 고아 비율이 높은데 D1만 먼저 끄는 것은 비권장.

### 6.1 `cos_ops_smoke_events` 직접 insert 호출처 (정적)

운영자가 D1 전에 “고아 쓰기”가 어디서 나오는지 빠르게 찾을 때 사용.

| 파일 | 역할 |
|------|------|
| `src/founder/smokeOps.js` | `recordCosCursorWebhookIngressSafe` / `recordOpsSmokeGithubFallbackEvidence` — **run_id 없음** + Supabase 일 때만 |
| `src/founder/pretriggerAudit.js` | pretrigger 감사 — **run_id 없음** + Supabase 일 때만 |
| `scripts/test-supabase-orphan-pretrigger-audit-persists-without-run-id.mjs` | 테스트 목 |

### 6.2 D2 후보 — `cos_run_events` 안의 “같은 줄기” 중복 (축소 시 회귀 필수)

| 줄기 | 행 A | 행 B | 비고 |
|------|------|------|------|
| Cursor 매칭 | `external_status_update` 등 캐논 타입 (`processCanonicalExternalEvent`) | 연쇄 `ops_smoke_phase` (`recordOpsSmokeAfterExternalMatch`) | 요약·브레이크 포인터는 양쪽을 섞어 씀; 한쪽만 남기려면 `aggregateSmokeSessionProgress`·fixture 대량 수정 |
| GitHub 매칭 | 캐논 외부 이벤트 한 줄 | (현재) `recordOpsSmokeAfterExternalMatch` 없음 | 상대적으로 단순 |

### 6.3 §4 고아·이중 기록 판단 — 자동화 (GPT/Cursor)

**사람이 표를 직접 읽지 않아도 되게** 하려면 아래 스크립트 출력(JSON)을 SSOT로 쓴다.

| 항목 | 내용 |
|------|------|
| 스크립트 | `scripts/audit-parcel-ops-smoke-health.mjs` |
| npm | `npm run audit:parcel-health` — 옵션: `--sample N`, `--strict` (하드 경고 또는 advisory 있으면 exit 1), `--json` |
| 무자격 | Supabase URL/키 없으면 `skipped: true`, exit 0 (CI 친화) |
| 집계 | `cos_ops_smoke_summary_stream` 전체 `count` + 최근 N행 샘플에서 `run_id` 분류(`_orphan`/빈/비UUID vs UUID), `cos_runs.pending_supervisor_wake=true` 건수, `cos_ops_smoke_events` 에서 `run_id IS NULL` 건수 |
| 하드 `warnings` | pending wake > 50, 고아 테이블 null run > 500, 카운트 쿼리 실패 등 — `ok: false` |
| `advisory` | 샘플 내 고아·비UUID 비율 > 기본 0.35 — D1 이중기록 구간에서 흔함; `ok` 는 여전히 `true` 일 수 있음 |
| 임계 조정 | `COS_PARCEL_HEALTH_ORPHAN_FRACTION_WARN`, `COS_PARCEL_HEALTH_PENDING_WAKE_WARN`, `COS_PARCEL_HEALTH_OPS_NULL_RUN_WARN` (환경변수, 숫자) |
| 사람용 요약 | JSON 필드 `interpretation_ko` |

**GPT/Cursor 해석 규칙(권장)**: `warnings` 가 비고 `ok: true` 이면 런타임·게이트 관점 양호. `advisory` 만 있으면 문서 4번(고아 비율)은 “추이 확인” 수준이며 즉시 장애로 보지 않음. `warnings` 가 있으면 Railway 로그·웹훅·특정 `run_id` 추적을 제안. `--json` 한 줄을 세션에 붙이면 다른 에이전트가 동일 기준으로 재현한다.

## Owner actions

- 로컬: `npm run verify:parcel-post-office`, `npm test`, `npm run audit:parcel-health`, `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 10`
- Git: 패치 후 `pull --rebase` → `commit` → `push` (워크스페이스 규칙과 동일)
