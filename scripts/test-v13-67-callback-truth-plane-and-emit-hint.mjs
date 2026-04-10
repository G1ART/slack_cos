/**
 * vNext.13.67 — Callback truth plane (provider vs manual probe), aggregate promotion, emit_patch scope hint.
 */
import assert from 'node:assert';
import { aggregateSmokeSessionProgress, summarizeOpsSmokeSessionsFromFlatRows } from '../src/founder/smokeOps.js';
import { prepareEmitPatchForCloudAutomation } from '../src/founder/livePatchPayload.js';

const sid = 'sess_v13_67_truth';
const flatPromoted = [
  {
    run_id: 'r67a',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-10T10:00:01Z',
    payload: {
      smoke_session_id: sid,
      phase: 'cursor_trigger_recorded',
      at: '2026-04-10T10:00:01Z',
      trigger_ok: true,
    },
  },
  {
    run_id: 'r67a',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-10T10:00:02Z',
    payload: {
      smoke_session_id: sid,
      phase: 'trigger_accepted_external_id_present',
      at: '2026-04-10T10:00:02Z',
    },
  },
  {
    run_id: 'r67b',
    event_type: 'cos_cursor_webhook_ingress_safe',
    created_at: '2026-04-10T10:00:03Z',
    payload: {
      smoke_session_id: sid,
      at: '2026-04-10T10:00:03Z',
      correlation_outcome: 'matched',
      callback_source_kind: 'provider_runtime',
      signature_verification_ok: true,
      json_parse_ok: true,
    },
  },
];
const sum = summarizeOpsSmokeSessionsFromFlatRows(flatPromoted, { sessionLimit: 5 })[0];
assert.equal(sum.primary_run_id, 'r67a');
assert.deepEqual(sum.related_run_ids, ['r67b']);
assert.equal(sum.final_status, 'callback_correlated_without_progression_patch');
assert.equal(sum.authoritative_closure_source, 'provider_runtime');
assert.equal(sum.inbound_callback_observed, true);
assert.equal(sum.manual_probe_callback_ingress_observed, false);

const flatManual = [
  {
    run_id: 'r67m',
    event_type: 'ops_smoke_phase',
    created_at: '2026-04-10T11:00:01Z',
    payload: {
      smoke_session_id: 'sess_manual',
      phase: 'cursor_trigger_recorded',
      at: '2026-04-10T11:00:01Z',
      trigger_ok: true,
    },
  },
  {
    run_id: 'r67m',
    event_type: 'cos_cursor_webhook_ingress_safe',
    created_at: '2026-04-10T11:00:02Z',
    payload: {
      smoke_session_id: 'sess_manual',
      at: '2026-04-10T11:00:02Z',
      correlation_outcome: 'matched',
      callback_source_kind: 'manual_probe',
      signature_verification_ok: true,
      json_parse_ok: true,
    },
  },
];
const aggMan = aggregateSmokeSessionProgress(
  flatManual.map((row) => ({
    event_type: row.event_type,
    payload: row.payload,
  })),
);
assert.equal(aggMan.final_status, 'manual_probe_callback_matched_without_provider_closure');

const prep = prepareEmitPatchForCloudAutomation({
  title: 't',
  live_patch: {
    path: 'src/a.txt',
    operation: 'replace',
    content: 'x',
    live_only: true,
    no_fallback: true,
  },
});
const hint = prep.payload?.cos_execution_scope_hint;
assert.ok(hint && typeof hint === 'object');
assert.equal(hint.kind, 'narrow_single_file');
assert.equal(hint.path, 'src/a.txt');
assert.equal(hint.live_only, true);
assert.equal(hint.no_fallback, true);
assert.equal(hint.handoff_scan_policy, 'target_path_and_parent_only');

console.log('test-v13-67-callback-truth-plane-and-emit-hint: ok');
