-- M2: ledger 전 구간(cos_run_events)을 배포·워크스페이스 등으로 SQL 필터하기 위한 뷰.
-- payload 에 키가 있으면 우선, 없으면 cos_runs 행에서 coalesce (구 이벤트·레거시 호환).
-- 앱 정본 병합 SSOT는 여전히 mergeCanonicalExecutionEnvelopeToPayload.

create or replace view public.cos_run_events_tenancy_stream as
select
  e.id,
  e.run_id,
  e.event_type,
  e.payload,
  e.created_at,
  e.matched_by,
  e.canonical_status,
  e.payload_fingerprint_prefix,
  nullif(
    trim(
      coalesce(
        nullif(trim(e.payload ->> 'parcel_deployment_key'), ''),
        nullif(trim(r.parcel_deployment_key), '')
      )
    ),
    ''
  ) as parcel_deployment_key,
  nullif(
    trim(
      coalesce(
        nullif(trim(e.payload ->> 'workspace_key'), ''),
        nullif(trim(r.workspace_key), '')
      )
    ),
    ''
  ) as workspace_key,
  nullif(
    trim(
      coalesce(
        nullif(trim(e.payload ->> 'product_key'), ''),
        nullif(trim(r.product_key), '')
      )
    ),
    ''
  ) as product_key,
  nullif(
    trim(
      coalesce(
        nullif(trim(e.payload ->> 'project_space_key'), ''),
        nullif(trim(r.project_space_key), '')
      )
    ),
    ''
  ) as project_space_key
from public.cos_run_events e
inner join public.cos_runs r on r.id = e.run_id;

comment on view public.cos_run_events_tenancy_stream is
  'All cos_run_events with tenancy coalesce(payload, cos_runs) for SQL filters; JS SSOT remains payload merge.';
