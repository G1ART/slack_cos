-- W8-B — env/secret propagation runs + steps + delivery readiness snapshots + human_gate continuation columns.
-- SSOT: src/founder/envSecretPropagationPlan.js / envSecretPropagationEngine.js / humanGateRuntime.js / deliveryReadiness.js.
-- Additive only — 기존 project_space_* 테이블 row 는 그대로 유효하다.
-- RLS: service_role 만 허용 (W5-B 테이블과 동일 정책). founder 본문에는 값(secret) 노출 금지(헌법 §6).

begin;

-- 1) project_space_human_gates 에 resumable continuation 컬럼 추가 (NULLABLE → 기존 행 무해)
alter table public.project_space_human_gates
  add column if not exists continuation_packet_id text,
  add column if not exists continuation_run_id text,
  add column if not exists continuation_thread_key text,
  add column if not exists required_human_action text;

comment on column public.project_space_human_gates.continuation_packet_id is
  'W8-B: packet ID to resume when this gate closes (set by humanGateRuntime.openResumableGate). NULLABLE.';
comment on column public.project_space_human_gates.continuation_run_id is
  'W8-B: run ID whose supervisor should be woken on gate close. NULLABLE.';
comment on column public.project_space_human_gates.continuation_thread_key is
  'W8-B: Slack thread key to reuse on resume. NULLABLE.';
comment on column public.project_space_human_gates.required_human_action is
  'W8-B: natural-language description of the human action required. Must NOT contain secret values.';

-- 2) enums (guarded)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'propagation_run_status') then
    create type public.propagation_run_status as enum (
      'planned',
      'running',
      'succeeded',
      'failed',
      'verify_pending'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'propagation_step_verification_kind') then
    create type public.propagation_step_verification_kind as enum (
      'read_back',
      'smoke',
      'none'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'propagation_step_verification_result') then
    create type public.propagation_step_verification_result as enum (
      'ok',
      'failed',
      'not_applicable',
      'pending'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'delivery_readiness_verdict') then
    create type public.delivery_readiness_verdict as enum (
      'ready',
      'missing_binding',
      'open_gate',
      'propagation_failed'
    );
  end if;
end$$;

-- 3) propagation_runs — one row per executePropagationPlan invocation
create table if not exists public.propagation_runs (
  id uuid primary key default gen_random_uuid(),
  project_space_key text not null references public.project_spaces(project_space_key) on delete cascade,
  plan_hash text not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status public.propagation_run_status not null default 'planned',
  failure_resolution_class text,
  workspace_key text,
  product_key text,
  parcel_deployment_key text
);

create index if not exists idx_propagation_runs_project_space_key_started
  on public.propagation_runs (project_space_key, started_at desc);
create index if not exists idx_propagation_runs_parcel_deployment_key
  on public.propagation_runs (parcel_deployment_key) where parcel_deployment_key is not null;
create index if not exists idx_propagation_runs_status
  on public.propagation_runs (status);

comment on table public.propagation_runs is
  'W8-B: env/secret propagation plan execution truth. Values are NEVER stored — only names, refs, and outcomes.';

-- 4) propagation_steps — one row per plan step
create table if not exists public.propagation_steps (
  id uuid primary key default gen_random_uuid(),
  propagation_run_id uuid not null references public.propagation_runs(id) on delete cascade,
  step_index integer not null,
  binding_requirement_kind text not null,
  source_system text not null,
  sink_system text not null,
  secret_handling_mode text not null,
  binding_name text,
  sink_ref text,
  wrote_at timestamptz,
  verification_kind public.propagation_step_verification_kind not null default 'none',
  verification_result public.propagation_step_verification_result not null default 'pending',
  failure_resolution_class text
);

create index if not exists idx_propagation_steps_run_index
  on public.propagation_steps (propagation_run_id, step_index);

comment on table public.propagation_steps is
  'W8-B: step-level propagation truth. binding_name/sink_ref are NAMES or handles — never raw values.';

-- 5) delivery_readiness_snapshots — point-in-time verdict per project_space
create table if not exists public.delivery_readiness_snapshots (
  id uuid primary key default gen_random_uuid(),
  project_space_key text not null references public.project_spaces(project_space_key) on delete cascade,
  computed_at timestamptz not null default now(),
  verdict public.delivery_readiness_verdict not null,
  unresolved_count integer not null default 0,
  snapshot_json jsonb not null default '{}'::jsonb,
  workspace_key text,
  product_key text,
  parcel_deployment_key text
);

create index if not exists idx_delivery_readiness_snapshots_key_at
  on public.delivery_readiness_snapshots (project_space_key, computed_at desc);

comment on table public.delivery_readiness_snapshots is
  'W8-B: summary of whether the project_space is ready to ship (ready / missing_binding / open_gate / propagation_failed).';

-- 6) RLS — service_role only (app uses SUPABASE_SERVICE_ROLE_KEY)
alter table public.propagation_runs enable row level security;
alter table public.propagation_steps enable row level security;
alter table public.delivery_readiness_snapshots enable row level security;

drop policy if exists propagation_runs_service_role_rw on public.propagation_runs;
create policy propagation_runs_service_role_rw
  on public.propagation_runs
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists propagation_steps_service_role_rw on public.propagation_steps;
create policy propagation_steps_service_role_rw
  on public.propagation_steps
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists delivery_readiness_snapshots_service_role_rw on public.delivery_readiness_snapshots;
create policy delivery_readiness_snapshots_service_role_rw
  on public.delivery_readiness_snapshots
  for all
  to service_role
  using (true)
  with check (true);

commit;
