# Ops 스모크 · Cursor 콜백 파이프라인 감사 (2026-04-01)

정본 읽기 순서는 `00_Document_Authority_Read_Path.md` 를 따른다. 이 문서는 **왜 한 줄씩 패치가 반복됐는지** 구조적으로 정리하고, **다시 흔들리지 않게** 점검할 포인트를 모은다.

**역사적 맥락**: 초기에 `.env`/런타임 조건이 불완전한 상태에서 기능을 “우선 통과”시키려다 **바이패스·중복 감사·이중 저장**이 쌓였을 가능성이 크다. 그런 층을 한 번에 뜯어내는 것은 **회귀 면적이 넓어** 단계적 페이즈가 필요하다. 스모크 성공을 넘어선 목표(품질·속도·병렬)는 `COS_Pipeline_Post_Office_Gate_Vision_2026-04-01.md` 에 정리했다.

## 1. 한가닥 패치가 반복된 구조적 이유

- **이중 저장소**: 같은 관측이 `cos_run_events` 와 `cos_ops_smoke_events` 에 갈라질 수 있고, 요약은 **병합 + 상한(slice)** 으로만 본다 (`supabaseListMergedSmokeSummaryEvents`).
- **화이트리스트가 여러 벌**: 과거에는 `cos_run_events` 조회용 타입 집합이 `cos_ops_smoke_events` / 파일 요약용 집합과 **달랐다**. 한쪽에만 타입을 추가하면 다른 경로에서 행이 **영구 누락**된다.
- **집계 vs 추출의 이중 규칙**: `summarizeOpsSmokeSessionsFromFlatRows` 는 `aggregateSmokeSessionProgress(rowsForAgg)` 에 **필터된** 행만 넣고, 머신 필드 추출은 `primaryRows` 또는 전체 `rows` 를 섞어 쓴다. **attempt lineage** 가 켜지면 `filterRowsForSessionAggregateTopline` 이 교차 시도 증거만 예외로 두는데, 예외 목록에 빠진 이벤트는 위상에서 사라진다 (intake 누락 버그).
- **스키마 불균형**: `cursor_receive_intake_committed` 는 종종 `smoke_session_id` 없이 기록되므로, 세션 버킷팅에서 **2차 귀속**(run_id 매칭)이 필요하다.

## 2. 잠재 원인 체크리스트 (다음 이슈 때 위에서부터)

| 구역 | 증상 힌트 | 확인할 것 |
|------|-----------|-----------|
| SSOT 타입 | 파일 요약엔 있는데 Supabase만 다름 / 그 반대 | `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` 한 벌만 쓰는지 (`runStoreSupabase` + `runCosEvents` Set) |
| 병합 상한 | 최근 세션이 요약에서 잘림 | `mergedSmokeSummaryPerSourceFetchBudget` — 소스별 `min(10k, finalLimit*2)` 후 merge·`slice(finalLimit)` (`runStoreSupabase.js`). `--max-rows` 로 최종 한도 조정. |
| 세션 귀속 | intake 가 아예 세션에 안 붙음 | `summarizeOpsSmokeSessionsFromFlatRows` 의 `pendingIntakeNoSid` + `runIdToSmokeSids` |
| 집계 필터 | 콜백은 있는데 `without_progression_patch` | `filterRowsForSessionAggregateTopline` 에 **진행 판정** 이벤트가 예외 목록에 있는지 |
| 쓰기 시점 | DB엔 없고 런타임만 성공 | Railway/COS 프로세스의 Supabase 자격·`append` 실패 로그 |
| 정책 레이어 | Slack 에서 `create_spec` 차단 | 실행 프로필 / `toolsBridge` — **요약 집계와 별개** |
| 프로바이더 리포트 | Cursor 구조화 리포트만 성공 | 그건 외부 제품 UI; COS 는 **자체 이벤트·집계**로만 단정 |

## 3. 권장 “재건” 방향 (한 번에 묶어 가기)

1. **타입 SSOT**: `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES` 만 정의하고, Supabase `cos_run_events` 조회·파일 스캔 모두 여기서 파생 (이번 패치).
2. **단일 정규화 레이어**(선택): flat row 를 세션에 넣기 전에 `enrichRowForSmokeSummary(row)` 로 `smoke_session_id` / `attempt_seq` 를 가능한 한 채운다 (intake 에 sid 주입까지).
3. **불변식 테스트**: “provider correlated + intake committed ⇒ `phases_seen` 에 `run_packet_progression_patched`” 같은 **속성 테스트**를 `smokeOps` 에 고정.
4. **병합 단일 시계열**: 뷰 `cos_ops_smoke_summary_stream` + `supabaseListMergedSmokeSummaryEventsFromStream` (마이그레이션 `20260413103000`). 실패 시 `supabaseListMergedSmokeSummaryEventsFallback` + 소스 예산. `COS_SMOKE_SUMMARY_LEGACY_MERGE_ONLY=1` 로 강제 레거시.

## 4. 코드 앵커

- **게이트(입구·분류)**: `src/founder/opsSmokeParcelGate.js` — 버킷 빌드, `SESSION_WIDE_AGGREGATE_EVENT_TYPES`, 하니스 `ops_smoke_session_id` 앵커, intake `smoke_session_id` 보강, 다중 세션 시 orphan intake `dominant` 귀속(`inferPreferredSmokeSessionIdPerRunFromFlatRows`)
- 타입 SSOT + 병합: `src/founder/runStoreSupabase.js` — `COS_OPS_SMOKE_SUMMARY_EVENT_TYPES`, `COS_OPS_SMOKE_SUMMARY_STREAM_VIEW`, `supabaseListMergedSmokeSummaryEvents`, `supabaseListMergedSmokeSummaryEventsFallback`, `supabaseMapHarnessOpsSmokeSessionIdsByRunIds`
- 파일/메모리 필터: `src/founder/runCosEvents.js` — `SMOKE_SUMMARY_EVENT_TYPES`
- 세션 요약 본문: `src/founder/smokeOps.js` — `summarizeOpsSmokeSessionsFromFlatRows`, `aggregateSmokeSessionProgress`, founder-facing
- Intake 기록: `src/founder/cursorReceiveCommit.js` — `cursor_receive_intake_committed`
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

## Owner actions

- 로컬: `npm test`, `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --limit 10`
- Git: 패치 후 `pull --rebase` → `commit` → `push` (워크스페이스 규칙과 동일)
