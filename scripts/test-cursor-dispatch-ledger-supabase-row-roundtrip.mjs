/**
 * Ensures cursor_dispatch_ledger survives appRunToDbRow / dbRowToAppRun (Supabase persist path).
 */
import assert from 'node:assert/strict';
import { appRunToDbRow, dbRowToAppRun } from '../src/founder/runStoreSupabase.js';

const ledger = {
  bound_at: '2026-04-12T00:00:00.000Z',
  target_packet_id: 'cursor-smoke-live-28',
  automation_request_id: 'tool_test_1',
  pending_provider_callback: true,
  selected_tool: 'cursor',
  selected_action: 'emit_patch',
};

const app = {
  id: '00000000-0000-4000-8000-000000000001',
  thread_key: 'mention:C0TEST:1.0',
  dispatch_id: 'd1',
  objective: 'o',
  status: 'running',
  cursor_dispatch_ledger: ledger,
};

const db = appRunToDbRow(app);
assert.ok(db.cursor_dispatch_ledger && typeof db.cursor_dispatch_ledger === 'object');
assert.equal(db.cursor_dispatch_ledger.target_packet_id, ledger.target_packet_id);

const round = dbRowToAppRun({
  id: app.id,
  thread_key: app.thread_key,
  dispatch_id: app.dispatch_id,
  objective: app.objective,
  status: app.status,
  packet_state_map: {},
  required_packet_ids: [],
  terminal_packet_ids: [],
  harness_snapshot: {},
  handoff_order: [],
  dispatch_payload: {},
  cursor_dispatch_ledger: db.cursor_dispatch_ledger,
});
assert.ok(round.cursor_dispatch_ledger);
assert.equal(round.cursor_dispatch_ledger.target_packet_id, ledger.target_packet_id);

console.log('test-cursor-dispatch-ledger-supabase-row-roundtrip: ok');
