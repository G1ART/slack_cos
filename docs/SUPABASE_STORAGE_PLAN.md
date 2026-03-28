# Supabase Storage Plan (Live Schema + Dual Write)

## 목표
- JSON(`data/*.json`) 기반 저장소를 **Supabase 중심 system-of-record**로 점진 전환한다.
- 이번 단계(이번 patch의 범위): Supabase 전용 라이브 테이블을 실제 생성하고, **dual-write v1**을 “핵심 컬렉션 5개”에만 적용한다.
- JSON 저장소는 계속 유지하며, 운영 중단 없이 롤백 가능하게 구성한다.

## 1차 Live 대상 테이블
이번 patch의 실제 마이그레이션 파일은:
- `supabase/migrations/20260319_g1cos_live_core_tables.sql`

1차 live 대상(dual-write v1 core):
- `g1cos_work_items`
- `g1cos_work_runs`
- `g1cos_approvals`
- `g1cos_project_context`
- `g1cos_environment_context`

## JSON -> Supabase 필드 매핑(핵심 5개)
공통 원칙:
- 원본 record 전체는 `payload jsonb`로 저장한다.
- 운영/조회에 필요한 최소 필드는 별도 컬럼으로 분리해 인덱스를 건다.
- 모든 핵심 배열 테이블은 `created_at`, `updated_at(timestamptz)`를 갖고, `updated_at`은 DB trigger로 유지한다.

### g1cos_work_items
- PK: `id text`  (JSON: `work_items[].id`)
- 관계: `work_items.id` ← `work_runs.work_id`
- 인덱스용 컬럼: `project_key`, `tool_key`, `status`, `approval_status`, `assigned_persona`, `approval_required`
- created_at/updated_at: `work_items[].created_at`, `work_items[].updated_at`
- 나머지: `payload jsonb`에 전체 record 저장

### g1cos_work_runs
- PK: `run_id text` (JSON: `work-runs[].run_id`)
- FK: `work_id text references g1cos_work_items(id)`
- 인덱스용 컬럼: `work_id`, `status`, `qa_status`, `result_status`
- created_at/updated_at: `work_runs[].created_at`, `work_runs[].updated_at`
- 나머지: `payload jsonb`에 전체 record 저장

### g1cos_approvals
- PK: `id text` (JSON: `approval-queue[].id`)
- 인덱스용 컬럼: `status`, `approval_key`, `approval_category`, `priority_score`
- created_at/updated_at: `approvals[].created_at`, `approvals[].updated_at`
  - 기존 JSON 흐름에서 `approvals.updated_at`은 초기에는 제한적이므로, adapter 레벨에서 안전하게 세팅한다.
- 나머지: `payload jsonb`에 전체 record 저장

### g1cos_project_context / g1cos_environment_context (key-value)
- PK: `key text` (JSON: `project-context.json`의 channelId 키)
- value: `value jsonb` (JSON: projectKey/envKey 문자열)
- created_at/updated_at: Supabase dual-write 시 adapter/trigger로 유지
- JSON에는 timestamp가 없으므로, JSON 우선 read 기준에서는 비교에서 maxUpdatedAt이 `null`일 수 있다.

## JSON-only(아직 JSON 유지) 컬렉션
이번 patch에서는 Supabase 테이블을 만들지 않으며, 실제 운영 read/write는 그대로 JSON만 사용한다.
- `decisions`, `lessons`, `interactions`
- `repo_registry`, `supabase_registry`
- `automation_settings`

## 2차 이전 예정 컬렉션(권장)
2차로는 아래 순서를 권장한다(실제 table 추가 후 dual-write 확대):
1. `decisions`, `lessons`, `interactions` (memory/log)
2. `repo_registry`, `supabase_registry` (registry)
3. `automation_settings` (settings)

## Dual Write 운영 원칙(v1)
- `STORAGE_MODE=dual`일 때, core 5개 컬렉션만 JSON + Supabase에 **동시에 write**한다.
- read는 기본 `JSON 우선`이다(안정성). `STORE_READ_PREFERENCE=supabase`를 옵션으로 줄 수 있으나 v1 운영에서는 기본값 유지 권장.
- mismatch/오류 가능성이 있으면 즉시 `STORAGE_MODE=json`으로 롤백한다.

## 롤백 전략
- 언제든지 `STORAGE_MODE=json`으로 즉시 전환해 JSON만 read/write 되게 한다.
- Supabase 테이블은 유지하되, 앱이 Supabase에 write하지 않게 되면 운영 영향이 급격히 줄어든다.

## dev -> staging -> prod 전환 순서(권장)
1. dev Supabase: 마이그레이션 적용 후 `STORAGE_MODE=dual`로 1~2일 관측
2. staging Supabase: 동일하게 core 5개 dual-write 적용 + 저장소비교로 row count/mismatch 확인
3. prod Supabase: 동일 검증 완료 후 전환

## 적용 절차(핸드 적용 기준)
아래 문서/스크립트를 참고:
- `scripts/supabase-push.sh` (이번 patch 범위에서는 CLI 자동실행은 코드에 포함하지 않음)

