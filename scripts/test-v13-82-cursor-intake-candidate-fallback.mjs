/**
 * vNext.13.82 — Intake commit tries webhook accepted id, callback_request_id, then ledger automation_request_id;
 * skips accepted_external_id rows whose packet_id disagrees with cursor_dispatch_ledger.target_packet_id.
 */
import assert from 'node:assert';
import path from 'path';
import { fileURLToPath } from 'node:url';

import { commitReceivedCursorCallbackToRunPacket } from '../src/founder/cursorReceiveCommit.js';
import {
  findExternalCorrelationCursorHintsWithMeta,
  __resetCorrelationMemoryForTests,
  upsertExternalCorrelation,
} from '../src/founder/correlationStore.js';
import {
  persistRunAfterDelegate,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-v13-82-intake-cand');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

function reset() {
  __resetCosRunMemoryStore();
  __resetCorrelationMemoryForTests();
}

reset();
const TK = 'mention:v82:cand';
const P_OK = 'p_emit_v82';
const run = await persistRunAfterDelegate({
  threadKey: TK,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd82',
    objective: 'o',
    packets: [
      {
        packet_id: P_OK,
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: { executed: false },
  founder_request_summary: '',
});
const rid = String(run.id);
await patchRunById(rid, {
  packet_state_map: { [P_OK]: 'running' },
  required_packet_ids: [P_OK],
  cursor_dispatch_ledger: {
    bound_at: new Date().toISOString(),
    selected_tool: 'cursor',
    selected_action: 'emit_patch',
    target_packet_id: P_OK,
    automation_request_id: 'tool_v82_authoritative',
    pending_provider_callback: true,
  },
});

await upsertExternalCorrelation({
  run_id: rid,
  thread_key: TK,
  packet_id: 'p_wrong_alias_packet',
  provider: 'cursor',
  object_type: 'accepted_external_id',
  object_id: 'api_short_alias_v82',
});
await upsertExternalCorrelation({
  run_id: rid,
  thread_key: TK,
  packet_id: P_OK,
  provider: 'cursor',
  object_type: 'accepted_external_id',
  object_id: 'tool_v82_authoritative',
});

const res = await commitReceivedCursorCallbackToRunPacket({
  accepted_external_id: 'api_short_alias_v82',
  run_uuid_hint: rid,
  callback_thread_key: TK,
  canonical: {
    provider: 'cursor',
    occurred_at: new Date().toISOString(),
    payload: { status: 'completed' },
    status_hint: 'external_completed',
  },
  status_bucket: 'positive_terminal',
  ingress_meta: { matched_by: 'accepted_external_id', payload_fingerprint_prefix: 'v82' },
});
assert.equal(res.committed, true, res.reason);
assert.equal(res.packet_id, P_OK);

const { corr, matched_by } = await findExternalCorrelationCursorHintsWithMeta({
  run_id: rid,
  packet_id: null,
  thread_key: null,
  accepted_external_id: null,
  external_run_id: null,
});
assert.equal(matched_by, 'run_uuid_packet');
assert.equal(String(corr?.packet_id || ''), P_OK);
assert.equal(String(corr?.object_type || ''), 'accepted_external_id');

console.log('ok test-v13-82-cursor-intake-candidate-fallback');
