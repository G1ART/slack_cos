-- W13-B — Additive mirror column for rehearsal eligibility (audit-only).
--
-- 런타임 SSOT 는 `ops/rehearsal_eligibility.json` 파일이다.
-- 이 JSONB 컬럼은 감사용 mirror 일 뿐이며, scenario runner / binding writer 는 파일을 우선한다.
-- 값을 절대 이 컬럼에서 먼저 읽어 rehearsal 여부를 결정하지 않는다.

ALTER TABLE public.project_space_bindings
  ADD COLUMN IF NOT EXISTS rehearsal_safety_class_json jsonb NULL;

COMMENT ON COLUMN public.project_space_bindings.rehearsal_safety_class_json IS
  'W13-B audit-only mirror of ops/rehearsal_eligibility.json. Runtime SSOT is the local file; this column exists only for operator audit visibility.';
