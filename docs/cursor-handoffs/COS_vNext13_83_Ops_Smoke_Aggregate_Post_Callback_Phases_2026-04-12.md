# vNext.13.83 — Ops 스모크 집계에 post-callback `ops_smoke_phase` 포함 (2026-04-12)

## 증상

- Supabase `cos_run_events` 타임라인에는 `external_callback_matched`, `authoritative_callback_closure_applied`, `run_packet_progression_patched`, `supervisor_wake_enqueued`, `founder_milestone_sent` 가 존재.
- `summarize-ops-smoke-sessions.mjs` 는 `breaks_at: supervisor_wake_enqueued`, `phases_seen` 에 위 단계 누락처럼 보임.
- 원인: 다중 시도 lineage 시 `filterRowsForSessionAggregateTopline` 이 `attempt_seq > 0` 인 행만 primary attempt 에 맞춰 통과시키는데, `recordOpsSmokeAfterExternalMatch` / `recordOpsSmokeFounderMilestone` 은 **`attempt_seq` 없이** `ops_smoke_phase` 를 씀 → 집계에서 제거됨.

## 수정

- `src/founder/opsSmokeParcelGate.js`: `SESSION_WIDE_OPS_SMOKE_PHASES_FOR_AGGREGATE` 집합 추가, 해당 phase 의 `ops_smoke_phase` 는 primarySeq 필터를 무시하고 집계에 포함.
- `scripts/test-v13-83-post-callback-ops-phases-in-aggregate.mjs` 회귀.

## Owner actions

- 로컬: `node scripts/test-v13-83-post-callback-ops-phases-in-aggregate.mjs` 또는 `npm test`.
- 재요약: `node scripts/summarize-ops-smoke-sessions.mjs --store supabase --run-id <uuid> --max-rows 8000`.
