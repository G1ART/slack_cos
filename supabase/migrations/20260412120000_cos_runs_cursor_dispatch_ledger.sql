-- Dispatch ledger: ties emit_patch trigger → target packet for signed Cursor callbacks (multi-turn safe).
alter table if exists public.cos_runs
  add column if not exists cursor_dispatch_ledger jsonb;

comment on column public.cos_runs.cursor_dispatch_ledger is
  'Cursor emit_patch dispatch bind: target_packet_id, automation_request_id, pending_provider_callback, etc.';
