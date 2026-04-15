-- M0: ops smoke 요약 스트림·ledger 테넩시 뷰 맨 뒤에 slack_team_id 표현 컬럼 추가 (42P16: 기존 열 순서 유지 후 append).
-- 값은 payload.slack_team_id 우선(앱 merge 가 채움).

create or replace view public.cos_ops_smoke_summary_stream as
select
  e.run_id::text as run_id,
  e.event_type,
  e.payload,
  e.created_at,
  nullif(nullif(trim(e.payload ->> 'parcel_deployment_key'), ''), '') as parcel_deployment_key,
  nullif(nullif(trim(e.payload ->> 'workspace_key'), ''), '') as workspace_key,
  nullif(nullif(trim(e.payload ->> 'product_key'), ''), '') as product_key,
  nullif(nullif(trim(e.payload ->> 'project_space_key'), ''), '') as project_space_key,
  nullif(nullif(trim(e.payload ->> 'slack_team_id'), ''), '') as slack_team_id
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
  nullif(nullif(trim(x.payload ->> 'project_space_key'), ''), '') as project_space_key,
  nullif(nullif(trim(x.payload ->> 'slack_team_id'), ''), '') as slack_team_id
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
  'Merged ops smoke timeline. Tenancy + slack_team_id from payload; IN list sync with COS_OPS_SMOKE_SUMMARY_EVENT_TYPES.';

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
  ) as project_space_key,
  nullif(nullif(trim(e.payload ->> 'slack_team_id'), ''), '') as slack_team_id
from public.cos_run_events e
inner join public.cos_runs r on r.id = e.run_id;

comment on view public.cos_run_events_tenancy_stream is
  'All cos_run_events with tenancy + slack_team_id from payload; cos_runs coalesce for tenancy keys.';
