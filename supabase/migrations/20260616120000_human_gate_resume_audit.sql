-- W11-C — project_space_human_gates resume audit columns (additive only).
--
-- 정본: docs/cursor-handoffs/W11_INTERNAL_ALPHA_QUALIFICATION_AND_LIVE_REHEARSAL_49f6924_2026-04-16.md §G11-C.
--
-- 결정: continuation_key 는 app-layer derived helper 로 유지하고 DB 에는 저장하지 않는다.
--       resume_target_kind/resume_target_ref 는 resumable gate 의 운영 진실이므로 DB 에 durable 하게 기록.
--       reopened_count / last_resumed_at / last_resumed_by 는 재개 감사에 필요.
-- invariant (앱 레이어 강제): resume_target_kind 와 resume_target_ref 는 동시에 존재하거나 동시에 null 이어야 한다.

alter table public.project_space_human_gates
  add column if not exists resume_target_kind text,
  add column if not exists resume_target_ref text,
  add column if not exists reopened_count integer not null default 0,
  add column if not exists last_resumed_at timestamptz,
  add column if not exists last_resumed_by text;

comment on column public.project_space_human_gates.resume_target_kind is
  'W11-C: "packet"|"run"|"thread" 중 하나. resume_target_ref 와 반드시 동시에 존재 (app-layer invariant).';
comment on column public.project_space_human_gates.resume_target_ref is
  'W11-C: resume_target_kind 에 해당하는 식별자(packet_id/run_id/thread_key). 값(secret) 저장 금지.';
comment on column public.project_space_human_gates.reopened_count is
  'W11-C: 이 gate 가 다시 열리거나 재개된 누적 횟수 (close→open 재진입 포함 운영 카운터).';
comment on column public.project_space_human_gates.last_resumed_at is
  'W11-C: 마지막으로 재개가 기록된 시각 (markGateResumed/closeGateAndResume 가 갱신).';
comment on column public.project_space_human_gates.last_resumed_by is
  'W11-C: 재개 주체(run_id 또는 operator id). 토큰/secret 금지 — audit trail 만.';
