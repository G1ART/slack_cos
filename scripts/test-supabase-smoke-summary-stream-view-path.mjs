/**
 * 단일 뷰 경로: cos_ops_smoke_summary_stream 이 성공하면 이중 쿼리 없이 반환.
 */
import assert from 'node:assert';
import {
  COS_OPS_SMOKE_SUMMARY_STREAM_VIEW,
  supabaseListMergedSmokeSummaryEvents,
} from '../src/founder/runStoreSupabase.js';

const streamRows = [
  {
    run_id: 'uuid-stream',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 's_new', phase: 'cursor_trigger_recorded', at: '2026-04-03T01:00:00Z' },
    created_at: '2026-04-03T01:00:00Z',
  },
  {
    run_id: 'uuid-stream',
    event_type: 'ops_smoke_phase',
    payload: { smoke_session_id: 's_new', phase: 'emit_patch_payload_validated', at: '2026-04-03T00:00:00Z' },
    created_at: '2026-04-03T00:00:00Z',
  },
];

function createStreamMock() {
  let fromCallCount = 0;
  return {
    fromCallCount: () => fromCallCount,
    from(table) {
      fromCallCount += 1;
      assert.equal(table, COS_OPS_SMOKE_SUMMARY_STREAM_VIEW);
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        limit() {
          return Promise.resolve({ data: streamRows, error: null });
        },
      };
    },
  };
}

const sb = createStreamMock();
const merged = await supabaseListMergedSmokeSummaryEvents(sb, { limit: 50 });
assert.equal(sb.fromCallCount(), 1, 'single view query only');
assert.equal(merged.length, 2);
assert.equal(merged[0].created_at, '2026-04-03T01:00:00Z');

console.log('test-supabase-smoke-summary-stream-view-path: ok');
