/**
 * Ops-only pre-trigger tool call audit (vNext.13.46). No raw payload body, secrets, or full URLs.
 */

import { appendCosRunEventForRun, appendSmokeSummaryOrphanRow } from './runCosEvents.js';
import { getActiveRunForThread, getCosRunStoreMode } from './executionRunStore.js';
import { createCosRuntimeSupabase, supabaseAppendOpsSmokeEvent } from './runStoreSupabase.js';
import { isOpsSmokeEnabled } from './smokeOps.js';

/**
 * @param {string} callName
 * @param {Record<string, unknown>} args
 */
export function summarizeToolArgsForAudit(callName, args) {
  const a = args && typeof args === 'object' ? args : {};
  if (callName === 'invoke_external_tool') {
    const pl = a.payload && typeof a.payload === 'object' && !Array.isArray(a.payload) ? a.payload : {};
    const hasLp = pl.live_patch && typeof pl.live_patch === 'object' && !Array.isArray(pl.live_patch);
    return {
      selected_tool: a.tool != null ? String(a.tool) : null,
      selected_action: a.action != null ? String(a.action) : null,
      payload_top_level_keys: Object.keys(pl)
        .sort()
        .slice(0, 48),
      delegate_packets_present: false,
      delegate_packets_count: 0,
      delegate_live_patch_present: Boolean(hasLp),
    };
  }
  if (callName === 'delegate_harness_team') {
    const pkts = Array.isArray(a.packets) ? a.packets : null;
    const live =
      pkts &&
      pkts.some((p) => p && typeof p === 'object' && !Array.isArray(p) && p.live_patch != null);
    return {
      selected_tool: null,
      selected_action: null,
      payload_top_level_keys: Object.keys(a)
        .sort()
        .slice(0, 48),
      delegate_packets_present: Array.isArray(pkts) && pkts.length > 0,
      delegate_packets_count: Array.isArray(pkts) ? pkts.length : 0,
      delegate_live_patch_present: Boolean(live),
    };
  }
  return {
    selected_tool: null,
    selected_action: null,
    payload_top_level_keys: [],
    delegate_packets_present: false,
    delegate_packets_count: 0,
    delegate_live_patch_present: false,
  };
}

/**
 * @param {{
 *   env?: NodeJS.ProcessEnv,
 *   threadKey?: string,
 *   runId?: string | null,
 *   smoke_session_id: string,
 *   call_name: string,
 *   args: Record<string, unknown>,
 *   blocked: boolean,
 *   machine_hint?: string | null,
 *   blocked_reason?: string | null,
 *   missing_required_fields?: string[] | null,
 *   invalid_enum_fields?: string[] | null,
 *   invalid_nested_fields?: string[] | null,
 *   delegate_schema_valid?: boolean | null,
 *   delegate_schema_error_fields?: string[] | null,
 *   parent_smoke_session_id?: string | null,
 * }} p
 */
export async function recordCosPretriggerAudit(p) {
  const env = p.env || process.env;
  if (!isOpsSmokeEnabled(env)) return;
  const smoke_session_id = String(p.smoke_session_id || '').trim();
  if (!smoke_session_id) return;

  let runId = String(p.runId || '').trim();
  if (!runId && p.threadKey) {
    const run = await getActiveRunForThread(String(p.threadKey));
    runId = run?.id != null ? String(run.id).trim() : '';
  }

  const summary = summarizeToolArgsForAudit(p.call_name, p.args);
  const eventType = p.blocked ? 'cos_pretrigger_tool_call_blocked' : 'cos_pretrigger_tool_call';
  const payload = {
    smoke_session_id,
    run_id: runId || null,
    at: new Date().toISOString(),
    thread_key: p.threadKey != null ? String(p.threadKey).slice(0, 200) : null,
    call_name: String(p.call_name || '').slice(0, 80),
    phase: eventType,
    ...summary,
    machine_hint: p.machine_hint != null ? String(p.machine_hint).slice(0, 300) : null,
    blocked_reason: p.blocked_reason != null ? String(p.blocked_reason).slice(0, 120) : null,
    missing_required_fields: Array.isArray(p.missing_required_fields)
      ? p.missing_required_fields.map((x) => String(x).slice(0, 120)).slice(0, 24)
      : null,
    invalid_enum_fields: Array.isArray(p.invalid_enum_fields)
      ? p.invalid_enum_fields.map((x) => String(x).slice(0, 120)).slice(0, 24)
      : null,
    invalid_nested_fields: Array.isArray(p.invalid_nested_fields)
      ? p.invalid_nested_fields.map((x) => String(x).slice(0, 120)).slice(0, 24)
      : null,
    delegate_schema_valid:
      p.delegate_schema_valid === true || p.delegate_schema_valid === false ? p.delegate_schema_valid : null,
    delegate_schema_error_fields: Array.isArray(p.delegate_schema_error_fields)
      ? p.delegate_schema_error_fields.map((x) => String(x).slice(0, 120)).slice(0, 48)
      : null,
    parent_smoke_session_id:
      p.parent_smoke_session_id != null ? String(p.parent_smoke_session_id).slice(0, 120) : null,
  };

  if (runId) {
    await appendCosRunEventForRun(runId, eventType, payload, {});
  } else if (getCosRunStoreMode() === 'supabase') {
    const sb = createCosRuntimeSupabase();
    if (sb) {
      await supabaseAppendOpsSmokeEvent(sb, {
        smoke_session_id,
        run_id: null,
        thread_key: p.threadKey != null ? String(p.threadKey).slice(0, 200) : null,
        event_type: eventType,
        payload,
      });
    }
  } else {
    await appendSmokeSummaryOrphanRow({
      event_type: eventType,
      payload,
      created_at: payload.at,
    });
  }
}
