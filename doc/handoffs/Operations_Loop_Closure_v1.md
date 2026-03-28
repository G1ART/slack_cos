# Handoff: Operations Loop Closure v1

**패치명:** Operations Loop Closure v1  
**날짜:** 2026-03-19  
**목표:** Slack COS 운영 루프(계획 → work → 승인 → 발행 → 결과 ingest → 검토 → 수정/완료)를 **끝까지** 돌릴 수 있는 최소 완결.

---

## 1. 새 lifecycle (work 중심)

저장소(`work_items.status`)에 추가·활성화된 값:

| 저장 값 | 의미 |
|---------|------|
| `draft` | 초안 / planner child (plan `review_pending`이면 표시상 `approval_pending`) |
| `pending_approval` | 업무 자체 승인 대기 |
| `approved` | 승인됨 |
| `assigned` | 배정됨 |
| `dispatched` | GitHub issue / Cursor handoff 등 **외부 발행 완료** |
| `in_progress` | 실행 중 |
| `review_requested` | 결과 ingest 후 검토 대기 (`review` 레거시는 표시 시 동일 취급) |
| `needs_revision` | `업무수정요청` |
| `blocked` | 차단 |
| `done` | 완료 |
| `canceled` | 취소 |

**Plan** 상태(`plans.status`)는 기존과 동일하며, `계획완료`는 **연결된 모든 child work가 `done`**일 때만 허용.

---

## 2. 새/변경 명령

| 명령 | 동작 |
|------|------|
| `계획등록:` / `계획등록：` / `계획등록 …` / 자연어(계획 세워줘, 단계별 나눠줘 등) | **planner 전용** — Council/fallback 없음. 실패 시 안내만. |
| `계획진행 <PLN>` | **집계만** (total, approval_pending, dispatched, in_progress, review_requested, needs_revision, done, blocked …). |
| `계획시작 <PLN>` | 기존 `계획진행`이 하던 **plan → in_progress** 전이. |
| `계획완료 <PLN>` | child 전부 `done` 아니면 **거부 + 미완료 목록**. |
| `업무검토 <WRK>` | **조회 전용** — 상태 변경 없음, 검토 대기 여부 요약. |
| `업무수정요청 <WRK> <사유>` | `needs_revision` + note append. |
| `업무완료 <WRK>` | `done`; **이미 done이면 no-op** 메시지. |

기존: `업무차단`, `업무재개` 유지.

---

## 3. Planner 로그 (grep용 JSON 한 줄)

`console.info`로 다음 `stage` 필드가 붙습니다:

- `planner_route_entered`
- `planner_persisted`
- `planner_works_created`
- `planner_approval_created`
- `planner_response_rendered`

공통 필드 예: `normalized_input`, `route_reason`, `fallback_suppressed`, `plan_id`, `work_ids`, `approval_id`, `dedup_hit`(선택).

---

## 4. Slack 응답 계약 (`계획등록` 성공 시)

- `Plan: PLN-…`
- `Status: …`
- `Approval: yes|no`
- `Approval ID: APR-…|none|실패 안내`
- `Works: WRK-…`
- `Next:` (계획상세 / 계획발행목록 / 계획진행 …)

---

## 5. 결과 ingest → lifecycle

- `커서결과기록` — `patch_complete` 시 work → **`review_requested`**.
- `결과등록` — 동일하게 **`review_requested`**.
- 성공적인 **`이슈발행`** 후 work → **`dispatched`** (기존 `in_progress` 대체).
- **`커서발행`** 성공 후 work → **`dispatched`**.

---

## 6. 중복 방어 (최소)

- 동일 채널·사용자·본문 해시로 **120초** 내 planner 응답 캐시 재사용.
- `업무완료` 중복 → idempotent.

---

## 7. 배포·실행 명령 (참고)

> **이 패치(Operations Loop Closure v1) 자체에는 DB 스키마 변경이 없어 SQL은 필수가 아님.** 아래는 호스트/Supabase를 쓸 때 참고용 템플릿.

**Git push**

```bash
cd /path/to/g1-cos-slack
git status
git add -A
git commit -m "chore: Operations Loop Closure v1"
git push origin <브랜치명>   # 예: main
```

**SQL (Supabase 마이그레이션 반영)**

프로젝트 마이그레이션 파일: `supabase/migrations/20260319_g1cos_live_core_tables.sql`

- **대시보드:** Supabase → SQL Editor → 위 파일 내용 붙여넣기 후 Run  
- **Supabase CLI** (프로젝트 연결된 경우):

```bash
cd /path/to/g1-cos-slack
supabase link --project-ref <PROJECT_REF>   # 최초 1회
supabase db push
```

- **psql** (직접 URL이 있을 때):

```bash
psql "$DATABASE_URL" -f supabase/migrations/20260319_g1cos_live_core_tables.sql
```

**봇 기동**

```bash
cd /path/to/g1-cos-slack
npm install          # 의존성 변경 시
npm start            # = node app.js
```

`.env`에 Slack 토큰·`STORAGE_MODE` 등 필수 변수가 있어야 합니다.

---

## 8. 테스트

로컬 스크립트:

```bash
node scripts/test-operations-loop.mjs
```

Slack 수동 시나리오는 지시서 **TEST 1–6** 참고 (`계획등록` → `계획상세`/`계획발행목록` → `커서발행`/`커서결과기록` → `업무검토`/`업무수정요청`/`업무완료` → `계획완료`).

---

## 9. 남은 리스크

- `dispatched` 이후에도 일부 경로가 `in_progress`로 올릴 수 있음(다른 명령 조합) — 다음 패치에서 정리 후보.
- Plan 차단 시 child work 자동 `blocked`는 이번 범위 밖.
- NL planner 트리거는 **보수적 정규식** — 과매칭 방지 우선.

---

## 10. 다음 추천 패치 (1개)

**`review_requested` → `done` 게이트**: `업무완료` 전에 최소 1회 `커서결과기록` 또는 `결과등록`이 있는지 선택적 검증(플래그로 on/off).
