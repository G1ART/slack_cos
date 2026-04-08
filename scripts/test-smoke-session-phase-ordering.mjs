import assert from 'node:assert';
import { aggregateSmokeSessionProgress } from '../src/founder/smokeOps.js';

function row(phase, at) {
  return { event_type: 'ops_smoke_phase', payload: { phase, at } };
}

const empty = aggregateSmokeSessionProgress([]);
assert.equal(empty.final_status, 'no_ops_smoke_events');
assert.equal(empty.breaks_at, null);

const full = aggregateSmokeSessionProgress([
  row('cursor_trigger_recorded', '2026-04-01T00:00:01Z'),
  row('external_run_id_extracted', '2026-04-01T00:00:02Z'),
  row('external_callback_matched', '2026-04-01T00:00:03Z'),
  row('run_packet_progression_patched', '2026-04-01T00:00:04Z'),
  row('supervisor_wake_enqueued', '2026-04-01T00:00:05Z'),
  row('founder_milestone_sent', '2026-04-01T00:00:06Z'),
]);
assert.equal(full.final_status, 'full_pipeline_observed');
assert.equal(full.breaks_at, null);
assert.ok(full.phases_seen.includes('supervisor_wake_enqueued'));

const partial = aggregateSmokeSessionProgress([
  row('cursor_trigger_recorded', 'a'),
  row('external_run_id_extracted', 'b'),
  row('external_callback_matched', 'c'),
]);
assert.equal(partial.breaks_at, 'run_packet_progression_patched');
assert.ok(String(partial.final_status).startsWith('partial_stopped_before_'));

const triggerOnly = aggregateSmokeSessionProgress([row('cursor_trigger_recorded', 'a')]);
assert.equal(triggerOnly.breaks_at, 'external_run_id_extracted');

const failed = aggregateSmokeSessionProgress([
  row('cursor_trigger_failed', 'a'),
  row('cursor_trigger_recorded', 'b'),
]);
assert.equal(failed.final_status, 'trigger_failed');
assert.equal(failed.breaks_at, 'cursor_trigger_recorded');

console.log('test-smoke-session-phase-ordering: ok');
