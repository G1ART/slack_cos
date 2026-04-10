-- vNext.13.62 — Persist provisional Cursor callback anchors on the run row (file/memory already merge arbitrary keys).
alter table if exists public.cos_runs
  add column if not exists cursor_callback_anchor jsonb;
