import assert from 'node:assert';
import path from 'path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { registerRunStateChangeListener } from '../src/founder/supervisorDirectTrigger.js';
import {
  persistRunAfterDelegate,
  getActiveRunForThread,
  patchRunById,
  __resetCosRunMemoryStore,
} from '../src/founder/executionRunStore.js';
import { upsertExternalCorrelation } from '../src/founder/correlationStore.js';
import { bindCursorEmitPatchDispatchLedgerBeforeTrigger } from '../src/founder/providerEventCorrelator.js';
import { handleCursorWebhookIngress, __resetExternalGatewayTestState } from '../src/founder/externalEventGateway.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
process.env.COS_RUNTIME_STATE_DIR = path.join(__dirname, '..', '.runtime', 'test-ext-run-wake');
process.env.COS_RUN_STORE = 'memory';
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SERVICE_ROLE_KEY;

__resetCosRunMemoryStore();
__resetExternalGatewayTestState();

let wakes = 0;
registerRunStateChangeListener(() => {
  wakes += 1;
});

const secret = 'cursor_webhook_secret_test_min_len__';
const tk = 'mention:C_crwake:2.2';
const run = await persistRunAfterDelegate({
  threadKey: tk,
  dispatch: {
    ok: true,
    status: 'accepted',
    dispatch_id: 'h_crwake',
    objective: 'cr',
    packets: [
      {
        packet_id: 'p_cr',
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
assert.ok(run?.id);
await patchRunById(String(run.id), {
  packet_state_map: { p_cr: 'running' },
  required_packet_ids: ['p_cr'],
});

const cloudRunId = 'cr_tool_test_wake_001';
await upsertExternalCorrelation({
  run_id: String(run.id),
  thread_key: tk,
  packet_id: 'p_cr',
  provider: 'cursor',
  object_type: 'cloud_agent_run',
  object_id: cloudRunId,
});

const bindWake = await bindCursorEmitPatchDispatchLedgerBeforeTrigger({
  threadKey: tk,
  runId: String(run.id),
  packetId: 'p_cr',
  invocation_id: 'inv_ext_run_wake',
  payload: {
    live_patch: { path: 'src/wake-cr.txt', operation: 'create', content: 'w', live_only: true, no_fallback: true },
  },
});
assert.equal(bindWake.ok, true);

const body = JSON.stringify({
  type: 'statusChange',
  runId: cloudRunId,
  status: 'completed',
  request_id: bindWake.request_id,
  thread_key: tk,
  packet_id: 'p_cr',
  paths_touched: ['src/wake-cr.txt'],
});
const raw = Buffer.from(body, 'utf8');
const sig = `sha256=${crypto.createHmac('sha256', secret).update(raw).digest('hex')}`;

const prev = wakes;
const out = await handleCursorWebhookIngress({
  rawBody: raw,
  headers: {
    'x-cursor-signature-256': sig,
  },
  env: { CURSOR_WEBHOOK_SECRET: secret },
});
assert.equal(out.matched, true);

const r2 = await getActiveRunForThread(tk);
assert.equal(r2.packet_state_map.p_cr, 'completed');

await Promise.resolve();
await Promise.resolve();
assert.ok(wakes > prev, 'notifyRunStateChanged after cursor canonical event');

registerRunStateChangeListener(null);

console.log('test-external-event-run-wakeup: ok');
