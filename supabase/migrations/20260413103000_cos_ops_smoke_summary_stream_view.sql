-- 단일 시계열: cos_run_events + cos_ops_smoke_events (요약 이벤트 타입만).
-- JS 정본: src/founder/runStoreSupabase.js 의 COS_OPS_SMOKE_SUMMARY_EVENT_TYPES — 타입 추가 시 여기와 동기화.

create or replace view public.cos_ops_smoke_summary_stream as
select
  e.run_id::text as run_id,
  e.event_type,
  e.payload,
  e.created_at
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
);

comment on view public.cos_ops_smoke_summary_stream is
  'Merged ops smoke timeline for summarize-ops-smoke-sessions (service_role). Keep event_type list in sync with COS_OPS_SMOKE_SUMMARY_EVENT_TYPES.';
