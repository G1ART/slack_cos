# Handoff: Phase 3c — Review / Revise / Done Closure

**날짜:** 2026-03-20  
**범위:** 운영 루프를 Slack에서 review → revise → done까지 닫음. (plans Supabase 승격, PR 자동화, NLP 고도화 **제외**)

---

## 1. 변경 파일 목록

| 파일 | 요약 |
|------|------|
| `app.js` (후속) | **`normalizePlanMgmtCommandLine`**: `계획 상세` 등 공백 분리 → 붙여쓰기로 정규화. **계획 관리 블록을 planner intake보다 앞**에 배치. `계획변경` 안내 명령. Council probe는 `trimmed` 기준. |
| `src/features/plannerRoute.js` (후속) | `extractPlannerRequest`가 `계획상세` 등 **관리 명령을 절대 intake로 오인하지 않도록** 가드. |
| `src/features/workLifecycle.js` | `proposed`·`rejected` 집계, `assigned`/`approved` 분리, `derivePlanRollupLabel`, `formatWorkReviewSummaryFromParts` 강화 |
| `src/features/workItems.js` | `WORK_STATUS`에 `proposed`, `rejected`; `needs_revision` 중복 요청 idempotent/append; `formatWorkItemDetail` 필수 필드·섹션 정리 |
| `src/features/workRuns.js` | `getLatestRunByWorkId` / `getLatestCursorRunForWork` **updated_at** 우선 정렬 (결과 ingest 후 최신 반영) |
| `src/features/cursorHandoff.js` | `inferCursorIngestResultStatus` 패턴 보강 (구현 완료·반영 완료·1차 구현 등) |
| `src/features/plans.js` | `계획진행` / `계획상세` 집계·rollup·next_allowed_actions 보강 |
| `app.js` | `커서결과기록`: 추론 `unknown`도 **review_requested**로 전환 |
| `scripts/test-operations-loop.mjs` | bucket 분리, rollup, cursor infer, 업무검토 문자열 검증 추가 |

**벤치마킹:** 이번 턴은 기존 인메모리 스토어·명령 패턴을 유지했고 새 오픈소스 의존성은 추가하지 않음. 이후 상태머신/워크플로 엔진이 필요해지면 후보를 비교 검토 권장.

---

## 2. 구현된 lifecycle / 명령

### Work lifecycle (저장·표시 기준)

- `proposed` | `draft` — 초안 (집계에서는 `approval_pending`과 함께 카운트 가능)
- `pending_approval` — 승인 대기
- `approved` / `assigned` — 승인·배정 (집계 **분리**)
- `dispatched` / `in_progress` — 발행·진행
- `review_requested` (legacy `review` → 정규화 시 동일 취급)
- `needs_revision`
- `done`
- `blocked`
- `rejected` (work-level)
- `canceled`

**원칙:** Slack 표시·집계는 **work** 중심. **plan**은 `plan.status` 저장값 + `derivePlanRollupLabel(plan.status, buckets)`로 child 집계 요약을 병기.

### 명령 (이번 패치에서 다듬어진 부분)

| 명령 | 동작 |
|------|------|
| `업무검토 <WRK>` | 결과/GitHub/Cursor/Review 구역 분리, 수정요청 notes 요약 |
| `업무수정요청 <WRK> <사유>` | `needs_revision`; **동일 사유** 재호출 → no-op; 다른 사유 → notes **append** |
| `업무완료 <WRK>` | `done`; 이미 `done` → **no-op** (기존 유지) |
| `계획진행 <PLN>` | total + approval_pending/approved/assigned/dispatched/…/blocked/rejected + rollup + 미종결 샘플 + next actions |
| `계획완료 <PLN>` | child **전부 `done`**일 때만 plan `done`; 아니면 거부 + 미완료 목록 (기존 유지) |
| `커서결과기록 …` | 성공 시 run 갱신 + **`patch_complete` 또는 `unknown`** → work `review_requested`; `needs_followup` → `in_progress`; `failed` → `blocked` |
| `결과등록 …` | 기존과 같이 work → `review_requested` |

---

## 3. TEST 1~8 결과

| 테스트 | 결과 | 비고 |
|--------|------|------|
| TEST 1 계획등록 | **수동(Slack)** | 자동화 스크립트는 planner 전체 플로 미포함 |
| TEST 2 계획상세/진행 | **수동** | 포맷·집계는 코드 반영됨 |
| TEST 3 커서발행/결과기록 → review_requested | **부분 자동** | `inferCursorIngestResultStatus`·`unknown→review_requested` 단위 검증은 `scripts/test-operations-loop.mjs` |
| TEST 4 업무검토 | **자동** | `formatWorkReviewSummaryFromParts` 문구 검증 |
| TEST 5 업무수정요청 | **수동** | idempotent/append 로직 `updateWorkStatus` |
| TEST 6 재 결과기록 | **수동** | latest run 정렬이 `updated_at` 기준으로 개선 |
| TEST 7 업무완료 중복 | **기존+수동** | `done` idempotent 유지 |
| TEST 8 계획완료 | **기존 로직 유지** | 미완료 거부 메시지 |

로컬: `node scripts/test-operations-loop.mjs` **통과**.

---

## 4. 남은 리스크 (2~3)

1. **JSON 파일 스토어 동시성** — 다중 인스턴스/동시 쓰기 시 마지막 쓰기 우선으로 레이스 가능 (기존 한계).
2. **`unknown` → review_requested** — 애매한 한 줄도 검토 큐로 올라감; 운영에서 문구 가이드 필요.
3. **plan rollup vs 저장 status** — `child_work_rollup`은 참고용이며, gate는 여전히 `plan.status` 기준.

---

## 5. 다음 추천 패치 (1개)

**Phase 3d — Plan/Work 영속화 Supabase + 단일 진실 원천**  
현 인메모리/파일 `replaceAll`을 점진 이전하고, work 상태 전이를 트랜잭션·감사 로그와 함께 기록.

---

## 6. 검증 명령

```bash
cd ~/g1-cos-slack && node scripts/test-operations-loop.mjs && node --check app.js
```
