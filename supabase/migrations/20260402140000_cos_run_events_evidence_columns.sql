-- vNext.13.38 — durable external event evidence (no raw payload / secrets)

alter table public.cos_run_events
  add column if not exists matched_by text,
  add column if not exists canonical_status text,
  add column if not exists payload_fingerprint_prefix text;

comment on column public.cos_run_events.matched_by is 'Correlation match path label (e.g. external_run_id)';
comment on column public.cos_run_events.canonical_status is 'Normalized external status bucket / milestone hint';
comment on column public.cos_run_events.payload_fingerprint_prefix is 'Short non-reversible fingerprint prefix of inbound body';
