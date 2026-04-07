import assert from 'node:assert';
import {
  canonicalizeExternalRunStatus,
  resolveCursorPacketStateAuthority,
} from '../src/founder/externalRunStatus.js';
import { applyExternalCursorPacketProgress } from '../src/founder/canonicalExternalEvent.js';
import { persistRunAfterDelegate, getActiveRunForThread, __resetCosRunMemoryStore } from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';

assert.equal(canonicalizeExternalRunStatus('processing').bucket, 'non_terminal');
assert.equal(canonicalizeExternalRunStatus('done').bucket, 'positive_terminal');
assert.equal(canonicalizeExternalRunStatus('timed_out').bucket, 'negative_terminal');

const r1 = resolveCursorPacketStateAuthority('completed', 'running', '2026-04-02T12:00:00.000Z', null);
assert.equal(r1.state, 'completed');
assert.equal(r1.skipPatch, true);

const r2 = resolveCursorPacketStateAuthority(
  'completed',
  'failed',
  '2026-04-02T12:00:00.000Z',
  { occurred_at: '2026-04-02T12:00:00.000Z', outcome: 'positive' },
);
assert.equal(r2.state, 'failed');

const r3 = resolveCursorPacketStateAuthority(
  'failed',
  'completed',
  '2026-04-02T11:00:00.000Z',
  { occurred_at: '2026-04-02T12:00:00.000Z', outcome: 'negative' },
);
assert.equal(r3.state, 'failed');
assert.equal(r3.skipPatch, true);

process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;
process.env.COS_RUNTIME_STATE_DIR = process.cwd() + '/.runtime/test-status-auth';
__resetCosRunMemoryStore();

const tk = 'mention:status_auth:1';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_sa',
    objective: 'o',
    packets: [
      {
        packet_id: 'p_sa',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_sa',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'p_sa',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'auth_run_1',
});

await applyExternalCursorPacketProgress(tk, 'p_sa', {
  provider: 'cursor',
  event_type: 'x',
  external_id: 'cursor:cloud_run:auth_run_1',
  external_run_id: 'auth_run_1',
  status_hint: 'external_completed',
  thread_key_hint: null,
  packet_id_hint: null,
  run_id_hint: null,
  occurred_at: '2026-04-02T10:00:00.000Z',
  payload: { status: 'completed' },
});
let r = await getActiveRunForThread(tk);
assert.equal(r.packet_state_map.p_sa, 'completed');

await applyExternalCursorPacketProgress(tk, 'p_sa', {
  provider: 'cursor',
  event_type: 'x',
  external_id: 'cursor:cloud_run:auth_run_1',
  external_run_id: 'auth_run_1',
  status_hint: 'external_status_update',
  thread_key_hint: null,
  packet_id_hint: null,
  run_id_hint: null,
  occurred_at: '2026-04-02T11:00:00.000Z',
  payload: { status: 'running' },
});
r = await getActiveRunForThread(tk);
assert.equal(r.packet_state_map.p_sa, 'completed');

console.log('test-cursor-status-authority: ok');
