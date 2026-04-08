/**
 * vNext.13.54 — Session summary exposes selected_execution_lane, payload_origin, builder_stage, callback_absence_classification.
 */
import assert from 'node:assert';
import {
  summarizeOpsSmokeSessionsFromFlatRows,
  inferSelectedExecutionLaneFromAgg,
  callbackAbsenceClassificationFromFinalStatus,
} from '../src/founder/smokeOps.js';

const flat = [
  {
    run_id: 'r_lane',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T10:00:00Z',
    payload: {
      smoke_session_id: 'sess_lane',
      phase: 'live_payload_compilation_started',
      at: '2026-04-08T10:00:00Z',
      payload_origin: 'invoke_external_tool_raw',
      builder_stage_last_reached: 'no_narrow_or_ops_compilation_source',
    },
  },
  {
    run_id: 'r_lane',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-08T10:00:01Z',
    payload: {
      smoke_session_id: 'sess_lane',
      phase: 'trigger_blocked_invalid_payload',
      at: '2026-04-08T10:00:01Z',
      exact_failure_code: 'invoke_payload_missing_narrow_live_patch_or_ops',
      payload_origin: 'invoke_external_tool_raw',
      builder_stage_last_reached: 'no_narrow_or_ops_compilation_source',
    },
  },
];

const agg = {
  phases_seen: ['live_payload_compilation_started', 'trigger_blocked_invalid_payload'],
  final_status: 'unknown',
};
assert.equal(inferSelectedExecutionLaneFromAgg(agg), 'cloud_emit_patch_assembly_failed');
assert.equal(callbackAbsenceClassificationFromFinalStatus('cursor_callback_absent_without_callback_contract'), 'absent_without_contract');

const s = summarizeOpsSmokeSessionsFromFlatRows(flat, { sessionLimit: 5 })[0];
assert.equal(s.selected_execution_lane, 'cloud_emit_patch_assembly_failed');
assert.equal(s.payload_origin, 'invoke_external_tool_raw');
assert.ok(s.builder_stage_last_reached);
assert.equal(s.exact_failure_code, 'invoke_payload_missing_narrow_live_patch_or_ops');
assert.equal(s.callback_absence_classification, 'not_callback_absence');

console.log('test-smoke-summary-includes-lane-and-callback-absence-class: ok');
