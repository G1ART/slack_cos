-- W5-B — project-space binding graph (project spaces · bindings · human gates).
-- SSOT 위치: src/founder/projectSpaceBindingStore.js. RLS 는 service_role 만 허용하고,
-- founder 본문에는 값(secret) 이 아니라 이름/참조만 쓴다(헌법 §2/§6, W5-W7 §8 Track B).

begin;

-- 1) enums (guarded)
do $$
begin
  if not exists (select 1 from pg_type where typname = 'project_space_binding_kind') then
    create type public.project_space_binding_kind as enum (
      'repo_binding',
      'default_branch',
      'cursor_root',
      'db_binding',
      'deploy_binding',
      'env_requirement'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'project_space_gate_kind') then
    create type public.project_space_gate_kind as enum (
      'oauth_authorization',
      'billing_or_subscription',
      'policy_or_product_decision',
      'manual_secret_entry',
      'high_risk_approval'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'project_space_gate_status') then
    create type public.project_space_gate_status as enum (
      'open',
      'resolved',
      'abandoned'
    );
  end if;
end$$;

-- 2) project_spaces — persistent project space entity (binding/gate aggregate root)
create table if not exists public.project_spaces (
  project_space_key text primary key,
  display_name text,
  workspace_key text,
  product_key text,
  parcel_deployment_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_project_spaces_workspace_key
  on public.project_spaces (workspace_key) where workspace_key is not null;
create index if not exists idx_project_spaces_product_key
  on public.project_spaces (product_key) where product_key is not null;
create index if not exists idx_project_spaces_parcel_deployment_key
  on public.project_spaces (parcel_deployment_key) where parcel_deployment_key is not null;

comment on table public.project_spaces is 'W5-B: persistent project space (tenancy anchor for bindings + human gates).';
comment on column public.project_spaces.project_space_key is 'COS_PROJECT_SPACE_KEY SSOT — same value used across cos_runs.project_space_key.';

-- 3) project_space_bindings — repo / deploy / db / env / cursor_root bindings
create table if not exists public.project_space_bindings (
  id uuid primary key default gen_random_uuid(),
  project_space_key text not null references public.project_spaces(project_space_key) on delete cascade,
  binding_kind public.project_space_binding_kind not null,
  binding_ref text not null,
  evidence_run_id text,
  workspace_key text,
  product_key text,
  parcel_deployment_key text,
  created_at timestamptz not null default now()
);

create index if not exists idx_project_space_bindings_key_kind
  on public.project_space_bindings (project_space_key, binding_kind);
create index if not exists idx_project_space_bindings_evidence_run_id
  on public.project_space_bindings (evidence_run_id) where evidence_run_id is not null;
create index if not exists idx_project_space_bindings_parcel_deployment_key
  on public.project_space_bindings (parcel_deployment_key) where parcel_deployment_key is not null;

comment on table public.project_space_bindings is 'W5-B: binding truth (repo/deploy/db/env/cursor_root) scoped by project_space_key.';
comment on column public.project_space_bindings.binding_ref is 'Reference name only (e.g. owner/repo, project_ref, env var NAME). Do NOT store secret values.';

-- 4) project_space_human_gates — HIL gate events (open → resolved|abandoned)
create table if not exists public.project_space_human_gates (
  id uuid primary key default gen_random_uuid(),
  project_space_key text not null references public.project_spaces(project_space_key) on delete cascade,
  gate_kind public.project_space_gate_kind not null,
  gate_status public.project_space_gate_status not null default 'open',
  gate_reason text,
  gate_action text,
  opened_by_run_id text,
  closed_by_run_id text,
  workspace_key text,
  product_key text,
  parcel_deployment_key text,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists idx_project_space_human_gates_key_status
  on public.project_space_human_gates (project_space_key, gate_status);
create index if not exists idx_project_space_human_gates_parcel_deployment_key
  on public.project_space_human_gates (parcel_deployment_key) where parcel_deployment_key is not null;

comment on table public.project_space_human_gates is 'W5-B: HIL gate lifecycle per project_space_key. founder/COS can query open gates.';

-- 5) RLS — service_role only (app uses SUPABASE_SERVICE_ROLE_KEY). founder surface never reads
-- these tables directly; read_execution_context exposes a compact slice.
alter table public.project_spaces enable row level security;
alter table public.project_space_bindings enable row level security;
alter table public.project_space_human_gates enable row level security;

drop policy if exists project_spaces_service_role_rw on public.project_spaces;
create policy project_spaces_service_role_rw
  on public.project_spaces
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists project_space_bindings_service_role_rw on public.project_space_bindings;
create policy project_space_bindings_service_role_rw
  on public.project_space_bindings
  for all
  to service_role
  using (true)
  with check (true);

drop policy if exists project_space_human_gates_service_role_rw on public.project_space_human_gates;
create policy project_space_human_gates_service_role_rw
  on public.project_space_human_gates
  for all
  to service_role
  using (true)
  with check (true);

commit;
