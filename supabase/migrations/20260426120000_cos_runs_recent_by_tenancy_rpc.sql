-- G1 M6 (일부): cos_runs 테넌시 선택 슬라이스 read-only RPC. 앱은 아직 필수 호출하지 않음; 운영·향후 클라이언트용.

create or replace function public.cos_runs_recent_by_tenancy(
  p_limit integer default 80,
  p_workspace_key text default null,
  p_product_key text default null,
  p_project_space_key text default null,
  p_parcel_deployment_key text default null
)
returns table (
  id uuid,
  thread_key text,
  status text,
  stage text,
  dispatch_id text,
  workspace_key text,
  product_key text,
  project_space_key text,
  parcel_deployment_key text,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = public
as $$
  select
    r.id,
    r.thread_key,
    r.status,
    r.stage,
    r.dispatch_id,
    r.workspace_key,
    r.product_key,
    r.project_space_key,
    r.parcel_deployment_key,
    r.updated_at
  from public.cos_runs r
  where
    coalesce(p_limit, 80) between 1 and 500
    and (p_workspace_key is null or r.workspace_key is not distinct from p_workspace_key)
    and (p_product_key is null or r.product_key is not distinct from p_product_key)
    and (p_project_space_key is null or r.project_space_key is not distinct from p_project_space_key)
    and (p_parcel_deployment_key is null or r.parcel_deployment_key is not distinct from p_parcel_deployment_key)
  order by r.updated_at desc nulls last
  limit greatest(1, least(coalesce(p_limit, 80), 500));
$$;

comment on function public.cos_runs_recent_by_tenancy(integer, text, text, text, text) is
  'G1 M6: read-only cos_runs rows filtered by optional tenancy keys; limit 1–500; IS NOT DISTINCT FROM for null-safe match.';

revoke all on function public.cos_runs_recent_by_tenancy(integer, text, text, text, text) from public;
grant execute on function public.cos_runs_recent_by_tenancy(integer, text, text, text, text) to service_role;
