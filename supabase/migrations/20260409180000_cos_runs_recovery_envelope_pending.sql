-- vNext.13.59a — Durable pending recovery envelope (survives process restart; JSON blob).
alter table public.cos_runs
  add column if not exists recovery_envelope_pending jsonb;

comment on column public.cos_runs.recovery_envelope_pending is 'COS emit_patch secondary GitHub recovery bridge state (pending_callback, paths, repo)';
