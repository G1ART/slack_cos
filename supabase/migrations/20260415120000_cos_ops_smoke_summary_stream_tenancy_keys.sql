-- 요약 스트림 뷰: workspace / product / project_space 키를 payload 에서 표현 컬럼으로 노출.
-- 열 순서: 기존 5열(run_id … parcel_deployment_key) 유지 후 맨 뒤에만 추가 (CREATE OR REPLACE VIEW 42P16 방지).
-- JS 정본 IN 리스트: src/founder/runStoreSupabase.js 의 COS_OPS_SMOKE_SUMMARY_EVENT_TYPES

create or replace view public.cos_ops_smoke_summary_stream as
select
  e.run_id::text as run_id,
  e.event_type,
  e.payload,
  e.created_at,
  nullif(nullif(trim(e.payload ->> 'parcel_deployment_key'), ''), '') as parcel_deployment_key,
  nullif(nullif(trim(e.payload ->> 'workspace_key'), ''), '') as workspace_key,
  nullif(nullif(trim(e.payload ->> 'product_key'), ''), '') as product_key,
  nullif(nullif(trim(e.payload ->> 'project_space_key'), ''), '') as project_space_key
from public.cos_run_events e
where e.event_type in (
  'ops_smoke_phase',
  'cos_pretrigger_tool_call',
  'cos_pretrigger_tool_call_blocked',
  'live_payload_compilation_started',
  'delegate_packets_ready',
  'emit_patch_payload_validated',
  'trigger_blocked_invalid_payload',
  'cos_cursor_webhook_ingress_safe',
  'cursor_receive_intake_committed',
  'cos_github_fallback_evidence',
  'result_recovery_github_secondary'
)

union all

select
  x.run_id,
  x.event_type,
  x.payload,
  x.created_at,
  nullif(nullif(trim(x.payload ->> 'parcel_deployment_key'), ''), '') as parcel_deployment_key,
  nullif(nullif(trim(x.payload ->> 'workspace_key'), ''), '') as workspace_key,
  nullif(nullif(trim(x.payload ->> 'product_key'), ''), '') as product_key,
  nullif(nullif(trim(x.payload ->> 'project_space_key'), ''), '') as project_space_key
from (
  select
    case
      when o.run_id is not null and trim(o.run_id) <> '' then trim(o.run_id)
      else '_orphan'
    end as run_id,
    o.event_type,
    case
      when trim(o.smoke_session_id) <> ''
        and (coalesce(nullif(trim(o.payload ->> 'smoke_session_id'), ''), '') = '')
      then o.payload || jsonb_build_object('smoke_session_id', o.smoke_session_id)
      else o.payload
    end as payload,
    o.created_at
  from public.cos_ops_smoke_events o
  where o.event_type in (
    'ops_smoke_phase',
    'cos_pretrigger_tool_call',
    'cos_pretrigger_tool_call_blocked',
    'live_payload_compilation_started',
    'delegate_packets_ready',
    'emit_patch_payload_validated',
    'trigger_blocked_invalid_payload',
    'cos_cursor_webhook_ingress_safe',
    'cursor_receive_intake_committed',
    'cos_github_fallback_evidence',
    'result_recovery_github_secondary'
  )
) x;

comment on view public.cos_ops_smoke_summary_stream is
  'Merged ops smoke timeline. Tenancy keys from payload; IN list sync with COS_OPS_SMOKE_SUMMARY_EVENT_TYPES.';
