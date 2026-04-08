import assert from 'node:assert';
import { listOpsSmokePhaseEventsForSummary } from '../src/founder/runCosEvents.js';

const stubRows = [
  {
    run_id: 'uuid-a',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 'sess_sb', phase: 'cursor_trigger_recorded', at: '2026-04-02T11:00:01Z' },
    created_at: '2026-04-02T11:00:01Z',
  },
  {
    run_id: 'uuid-a',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 'sess_sb', phase: 'external_callback_matched', at: '2026-04-02T11:00:02Z' },
    created_at: '2026-04-02T11:00:02Z',
  },
];

function createMockSupabase(runRows, opsRows = []) {
  return {
    from(table) {
      const rows = table === 'cos_ops_smoke_events' ? opsRows : runRows;
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
          return Promise.resolve({ data: rows, error: null });
        },
      };
    },
  };
}

const mockSb = createMockSupabase(stubRows, []);
const out = await listOpsSmokePhaseEventsForSummary({
  modeOverride: 'supabase',
  supabaseClient: mockSb,
  maxRows: 100,
});
assert.equal(out.length, 2);
assert.equal(out[0].run_id, 'uuid-a');

console.log('test-smoke-summary-supabase-mode: ok');
