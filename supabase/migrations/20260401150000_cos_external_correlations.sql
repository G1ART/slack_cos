-- vNext.13.32 — external object ↔ run correlation + webhook delivery dedupe

create table if not exists public.cos_external_correlations (
  id bigserial primary key,
  run_id uuid not null references public.cos_runs (id) on delete cascade,
  thread_key text not null,
  packet_id text,
  provider text not null,
  object_type text not null,
  object_id text not null,
  created_at timestamptz not null default now(),
  unique (provider, object_type, object_id)
);

create index if not exists idx_cos_external_correlations_run_id
  on public.cos_external_correlations (run_id);

create index if not exists idx_cos_external_correlations_thread
  on public.cos_external_correlations (thread_key);

create table if not exists public.cos_github_webhook_deliveries (
  delivery_id text primary key,
  received_at timestamptz not null default now()
);

comment on table public.cos_external_correlations is 'Maps provider objects (e.g. GitHub issue #) to cos_runs for async callbacks';
comment on table public.cos_github_webhook_deliveries is 'GitHub X-GitHub-Delivery dedupe';
