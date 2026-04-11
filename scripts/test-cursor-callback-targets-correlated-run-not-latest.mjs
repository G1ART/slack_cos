import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  getRunById,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cursor-corr-target');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

const tk = 'mention:vnext38_cursor_target:1';
const secret = 'cursor_target_secret_test_min_len__';

const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_a',
    objective: 'a',
    packets: [
      {
        packet_id: 'p_a',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_a',
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridA = String(runA.id);
await patchRunById(ridA, { packet_state_map: { p_a: 'running' }, required_packet_ids: ['p_a'] });

const extLate = 'cloud_late_run_correlation_99';
await upsertExternalCorrelation({
  run_id: ridA,
  thread_key: tk,
  packet_id: 'p_a',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: extLate,
});

const runB = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_b',
    objective: 'b',
    packets: [
      {
        packet_id: 'p_b',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'emit_patch',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_b',
    tool: 'cursor',
    action: 'emit_patch',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridB = String(runB.id);
await patchRunById(ridB, { packet_state_map: { p_b: 'running' }, required_packet_ids: ['p_b'] });

assert.notEqual(ridA, ridB);
assert.equal(String((await getActiveRunForThread(tk)).id), ridB);

const body = JSON.stringify({
  type: 'statusChange',
  runId: extLate,
  status: 'completed',
  paths_touched: ['src/target-corr.ts'],
});
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;
const wh = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(wh.matched, true);

const patchedA = await getRunById(ridA);
const patchedB = await getRunById(ridB);
assert.equal(patchedA.packet_state_map.p_a, 'completed');
assert.equal(patchedB.packet_state_map.p_b, 'running');

console.log('test-cursor-callback-targets-correlated-run-not-latest: ok');
