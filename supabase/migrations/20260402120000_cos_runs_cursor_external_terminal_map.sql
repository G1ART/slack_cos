-- vNext.13.37 — terminal authority metadata for cursor callbacks (no secrets)

alter table public.cos_runs
  add column if not exists cursor_external_terminal_by_packet jsonb not null default '{}'::jsonb;

comment on column public.cos_runs.cursor_external_terminal_by_packet is 'Per-packet last external terminal event (occurred_at + outcome) for status authority';
