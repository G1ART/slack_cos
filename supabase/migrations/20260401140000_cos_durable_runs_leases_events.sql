-- vNext.13.31 durable runtime: runs, supervisor leases, optional events

create table if not exists public.cos_runs (
  id uuid primary key default gen_random_uuid(),
  thread_key text not null,
  dispatch_id text not null,
  objective text not null,
  status text not null,
  stage text,
  current_packet_id text,
  next_packet_id text,
  packet_state_map jsonb not null default '{}'::jsonb,
  handoff_order jsonb not null default '[]'::jsonb,
  dispatch_payload jsonb not null default '{}'::jsonb,
  starter_kickoff jsonb,
  last_auto_invocation_sha text,
  founder_request_summary text,
  founder_notified_started_at timestamptz,
  founder_notified_review_required_at timestamptz,
  founder_notified_blocked_at timestamptz,
  founder_notified_completed_at timestamptz,
  founder_notified_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  external_run_id text,
  required_packet_ids jsonb not null default '[]'::jsonb,
  terminal_packet_ids jsonb not null default '[]'::jsonb,
  harness_snapshot jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  last_progressed_at timestamptz,
  last_founder_update_sha text
);

create index if not exists idx_cos_runs_thread_key_created_at
  on public.cos_runs (thread_key, created_at desc);

create index if not exists idx_cos_runs_status
  on public.cos_runs (status);

create unique index if not exists cos_runs_one_active_per_thread
  on public.cos_runs (thread_key)
  where (status in ('queued', 'running', 'review_required', 'blocked'));

create table if not exists public.cos_supervisor_leases (
  lease_name text primary key,
  owner_id text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.cos_run_events (
  id bigserial primary key,
  run_id uuid not null references public.cos_runs (id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_cos_run_events_run_id_created
  on public.cos_run_events (run_id, created_at desc);

comment on table public.cos_runs is 'COS durable execution run state (service_role)';
comment on table public.cos_supervisor_leases is 'Cross-replica supervisor lease';
comment on table public.cos_run_events is 'Append-only run audit trail';
