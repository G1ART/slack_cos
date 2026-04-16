/**
 * Shared external-tool outcome / hook constants (lane-agnostic contract surface).
 */

/** Cloud lane eligible but emit_patch payload did not compile to automation contract — do not fall through to artifact. */
export const EXTERNAL_CALL_BLOCKED_EMPTY_COMPILED_PAYLOAD = 'external_call_blocked_empty_compiled_payload';

/** Machine reason: founder must supply structured delegate narrow live_patch before cloud emit_patch. */
export const DELEGATE_PACKETS_MISSING_FOR_EMIT_PATCH = 'delegate_packets_missing_for_emit_patch';

/** Live-only/no-fallback thread: cloud emit_patch requires merged delegate packet (cannot bypass via packet_id alone). */
export const DELEGATE_REQUIRED_BEFORE_EMIT_PATCH = 'delegate_required_before_emit_patch';

/** outcome_code — ledger·요약에서 실행 진실 구분 */
export const TOOL_OUTCOME_CODES = {
  LIVE_COMPLETED: 'live_completed',
  ARTIFACT_PREPARED: 'artifact_prepared',
  DEGRADED_FROM_LIVE_FAILURE: 'degraded_from_live_failure',
  DEGRADED_FROM_LIVE_EXCEPTION: 'degraded_from_live_exception',
  BLOCKED_MISSING_INPUT: 'blocked_missing_input',
  FAILED_ARTIFACT_BUILD: 'failed_artifact_build',
  FAILED_LIVE_AND_ARTIFACT: 'failed_live_and_artifact',
  CLOUD_AGENT_DISPATCH_ACCEPTED: 'cloud_agent_dispatch_accepted',
};

/** 테스트: 특정 도구의 artifact 빌드만 실패시키기 */
export const __invokeToolTestHooks = { failArtifactForTool: /** @type {string | null} */ (null) };

/** Runtime plumbing — sync | webhook | polling (not founder/COS judgment). */
export const ADAPTER_RUNTIME_CAPS = {
  github: {
    create_issue: { completion_mode: 'webhook', callback_provider: 'github', correlation_required: true },
    open_pr: { completion_mode: 'webhook', callback_provider: 'github', correlation_required: true },
  },
  cursor: {
    create_spec: { completion_mode: 'webhook', callback_provider: 'cursor', correlation_required: false },
    emit_patch: { completion_mode: 'webhook', callback_provider: 'cursor', correlation_required: false },
  },
  supabase: {
    apply_sql: { completion_mode: 'sync', callback_provider: 'supabase', correlation_required: false },
  },
  railway: {
    inspect_logs: { completion_mode: 'sync', correlation_required: false },
    deploy: { completion_mode: 'polling', correlation_required: false },
  },
  vercel: {
    deploy: { completion_mode: 'polling', correlation_required: false },
  },
};
