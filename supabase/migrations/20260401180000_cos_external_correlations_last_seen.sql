-- vNext.13.35 — correlation row freshness for external callbacks

alter table public.cos_external_correlations
  add column if not exists last_seen_at timestamptz not null default now();

comment on column public.cos_external_correlations.last_seen_at is 'Updated on each upsert from COS runtime';
