/**
 * Ops smoke summary: file/memory filter and Supabase cos_run_events filter share COS_OPS_SMOKE_SUMMARY_EVENT_TYPES.
 */
import assert from 'node:assert';
import { SMOKE_SUMMARY_EVENT_TYPES } from '../src/founder/runCosEvents.js';
import { COS_OPS_SMOKE_SUMMARY_EVENT_TYPES } from '../src/founder/runStoreSupabase.js';

const fromSsoT = new Set(COS_OPS_SMOKE_SUMMARY_EVENT_TYPES);
assert.deepStrictEqual(SMOKE_SUMMARY_EVENT_TYPES, fromSsoT);
assert.ok(SMOKE_SUMMARY_EVENT_TYPES.has('cursor_receive_intake_committed'));
assert.ok(SMOKE_SUMMARY_EVENT_TYPES.has('emit_patch_payload_validated'));
assert.ok(SMOKE_SUMMARY_EVENT_TYPES.has('live_payload_compilation_started'));

console.log('test-smoke-summary-event-list-ssot: ok');
