-- vNext.13.47 — Ops-only smoke / pre-trigger audit events (no FK to cos_runs; run_id nullable for orphan pre-trigger).
create table if not exists public.cos_ops_smoke_events (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  smoke_session_id text not null,
  run_id text null,
  thread_key text null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists cos_ops_smoke_events_created_at_desc on public.cos_ops_smoke_events (created_at desc);
create index if not exists cos_ops_smoke_events_smoke_session_id on public.cos_ops_smoke_events (smoke_session_id);
create index if not exists cos_ops_smoke_events_event_type on public.cos_ops_smoke_events (event_type);
