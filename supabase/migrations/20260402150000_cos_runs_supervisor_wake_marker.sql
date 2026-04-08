-- vNext.13.40 — durable supervisor wake hint for periodic backstop

alter table public.cos_runs
  add column if not exists pending_supervisor_wake boolean not null default false;

alter table public.cos_runs
  add column if not exists last_supervisor_wake_request_at timestamptz;

comment on column public.cos_runs.pending_supervisor_wake is 'Set when a run-scoped wake is requested; periodic sweep may clear after an attempted tick';
comment on column public.cos_runs.last_supervisor_wake_request_at is 'Last time notify/signal requested supervisor attention for this run uuid';
