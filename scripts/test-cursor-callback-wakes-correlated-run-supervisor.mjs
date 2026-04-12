import assert from 'node:assert';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  getRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';
import { registerRunStateChangeListener } from '../src/founder/supervisorDirectTrigger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-cursor-supervisor-wake');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

/** @type {{ threadKey: string | null, runId: string | null }} */
const last = { threadKey: null, runId: null };
registerRunStateChangeListener((tk, rid) => {
  last.threadKey = tk;
  last.runId = rid != null && String(rid).trim() ? String(rid).trim() : null;
});

const secret = 'cursor_sup_wake_secret_test_min_len_';
const tk = 'mention:vnext39_sup_wake:1';

const runA = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_sw_a',
    objective: 'a',
    packets: [
      {
        packet_id: 'p_sw',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_sw',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridA = String(runA.id);

await upsertExternalCorrelation({
  run_id: ridA,
  thread_key: tk,
  packet_id: 'p_sw',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: 'cloud_sup_wake_77',
});

const runB = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'd_sw_b',
    objective: 'b',
    packets: [
      {
        packet_id: 'p_other',
        packet_status: 'running',
        preferred_tool: 'cursor',
        preferred_action: 'create_spec',
        mission: 'm2',
      },
    ],
  },
  starter_kickoff: {
    executed: true,
    packet_id: 'p_other',
    tool: 'cursor',
    action: 'create_spec',
    outcome: { status: 'running', outcome_code: 'cloud_agent_dispatch_accepted' },
  },
  founder_request_summary: '',
});
const ridB = String(runB.id);
assert.notEqual(ridA, ridB);
assert.equal(String((await getActiveRunForThread(tk)).id), ridB, 'sanity: latest run is active for thread');

const body = JSON.stringify({ type: 'statusChange', runId: 'cloud_sup_wake_77', status: 'completed' });
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

last.threadKey = null;
last.runId = null;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: { 'x-cursor-signature-256': sig },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out.matched, true);

await Promise.resolve();
await Promise.resolve();
assert.equal(last.threadKey, tk);
assert.equal(last.runId, ridA, 'supervisor wake must target correlated run A, not omit run id');

const runAfter = await getRunById(ridA);
assert.equal(
  runAfter?.pending_supervisor_wake,
  true,
  '택배사무소: 웹훅 매칭 후 durable pending_supervisor_wake 가 켜져야 함 (주기 루프 백스톱)',
);

registerRunStateChangeListener(null);

console.log('test-cursor-callback-wakes-correlated-run-supervisor: ok');
