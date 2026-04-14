/**
 * M1: smoke-summary 이벤트 append 시 payload 에 run_id 등 정본 봉투 키가 채워진다.
 */
import assert from 'node:assert/strict';
import {
  appendCosRunEventForRun,
  listCosRunEventsForRun,
  __resetCosRunEventsMemoryForTests,
} from '../src/founder/runCosEvents.js';
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
__resetCosRunEventsMemoryForTests();

const rid = '00000000-0000-4000-8000-0000000000aa';
await appendCosRunEventForRun(rid, 'ops_smoke_phase', {
  smoke_session_id: 'sess_env',
  phase: 'cursor_trigger_recorded',
  at: '2026-04-16T12:00:00.000Z',
});

const rows = await listCosRunEventsForRun(rid, 5);
assert.equal(rows.length, 1);
const pl = rows[0].payload && typeof rows[0].payload === 'object' ? rows[0].payload : {};
assert.equal(String(pl.run_id || '').trim(), rid, 'append path must inject run_id for audit trace');
assert.equal(String(pl.smoke_session_id || '').trim(), 'sess_env');

console.log('test-canonical-execution-envelope-smoke-payload: ok');
