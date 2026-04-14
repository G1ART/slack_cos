-- 에픽 6 확장: cos_runs 행에 최소 테넄시 키 (요약 스트림 외 정본).
-- 기존 행은 NULL 유지 (레거시 전역). 앱은 insert 시 env에서 채움.

alter table public.cos_runs
  add column if not exists parcel_deployment_key text,
  add column if not exists workspace_key text,
  add column if not exists product_key text,
  add column if not exists project_space_key text;

create index if not exists idx_cos_runs_parcel_deployment_key
  on public.cos_runs (parcel_deployment_key)
  where parcel_deployment_key is not null;

comment on column public.cos_runs.parcel_deployment_key is 'Deployment/env slice; mirrors COS_PARCEL_DEPLOYMENT_KEY / payload parcel_deployment_key';
comment on column public.cos_runs.workspace_key is 'Slack workspace or tenant slice; COS_WORKSPACE_KEY';
comment on column public.cos_runs.product_key is 'Product slice; COS_PRODUCT_KEY';
comment on column public.cos_runs.project_space_key is 'Project scope; COS_PROJECT_SPACE_KEY';
