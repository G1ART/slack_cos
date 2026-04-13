-- 요약 스트림 뷰: payload.parcel_deployment_key 를 표현 컬럼으로 노출 (PostgREST 필터·감사 스코프).
-- JS 정본 IN 리스트: src/founder/runStoreSupabase.js 의 COS_OPS_SMOKE_SUMMARY_EVENT_TYPES

-- 열 순서: 기존 뷰(run_id, event_type, payload, created_at)와 1~4번을 동일하게 둔 뒤
-- parcel_deployment_key 만 맨 뒤에 추가. (중간에 끼우면 CREATE OR REPLACE VIEW 가 42P16 으로 실패)

create or replace view public.cos_ops_smoke_summary_stream as
select
  e.run_id::text as run_id,
  e.event_type,
  e.payload,
  e.created_at,
  nullif(nullif(trim(e.payload ->> 'parcel_deployment_key'), ''), '') as parcel_deployment_key
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
  nullif(nullif(trim(x.payload ->> 'parcel_deployment_key'), ''), '') as parcel_deployment_key
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
  'Merged ops smoke timeline for summarize-ops-smoke-sessions (service_role). parcel_deployment_key from payload; IN list sync with COS_OPS_SMOKE_SUMMARY_EVENT_TYPES.';
