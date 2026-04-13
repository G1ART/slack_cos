/**
 * vNext.13.47 — supabaseListMergedSmokeSummaryEvents merges cos_run_events + cos_ops_smoke_events.
 */
import assert from 'node:assert';
import { supabaseListMergedSmokeSummaryEvents } from '../src/founder/runStoreSupabase.js';

const runRows = [
  {
    run_id: 'uuid-a',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 'sess_run', phase: 'cursor_trigger_recorded', at: '2026-04-02T10:00:00Z' },
    created_at: '2026-04-02T10:00:00Z',
  },
];

const opsRows = [
  {
    run_id: null,
    smoke_session_id: 'sess_ops',
    event_type: 'cos_pretrigger_tool_call_blocked',
    payload: {
      smoke_session_id: 'sess_ops',
      at: '2026-04-02T12:00:00Z',
      phase: 'cos_pretrigger_tool_call_blocked',
    },
    created_at: '2026-04-02T12:00:00Z',
    thread_key: null,
  },
];

function createMockSupabase(runData, opsData) {
  return {
    from(table) {
      if (table === 'cos_ops_smoke_summary_stream') {
        return {
          select() {
            return this;
          },
          eq() {
            return this;
          },
          or() {
            return this;
          },
          order() {
            return this;
          },
          limit() {
            return Promise.resolve({ data: null, error: { message: 'mock_no_view' } });
          },
        };
      }
      const data = table === 'cos_ops_smoke_events' ? opsData : runData;
      return {
        select() {
          return this;
        },
        in() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data, error: null });
        },
      };
    },
  };
}

const merged = await supabaseListMergedSmokeSummaryEvents(createMockSupabase(runRows, opsRows), {
  limit: 50,
});
assert.equal(merged.length, 2);
assert.equal(merged[0].created_at, '2026-04-02T12:00:00Z', 'newest row first');
assert.equal(merged[0].payload.smoke_session_id, 'sess_ops');
assert.equal(merged[1].payload.smoke_session_id, 'sess_run');

console.log('test-summarize-smoke-sessions-merges-cos_run_events-and-ops_smoke_events: ok');
